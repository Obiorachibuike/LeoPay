import { and, count, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { organizations, paymentLinks, payments, type PaymentLink } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { publicReference } from "@/lib/ids";
import { startCheckout } from "@/services/payments";
import { audit } from "@/lib/audit";
import type { z } from "zod";
import type { paymentLinkSchema } from "@/lib/validation";

export type PaymentLinkInput = z.infer<typeof paymentLinkSchema>;

export async function createPaymentLink(input: {
  organizationId: string;
  actorId: string;
  actorEmail: string;
  data: PaymentLinkInput;
}): Promise<PaymentLink> {
  if (input.data.allowVariableAmount) {
    const min = input.data.minAmountMinor ?? 0;
    const max = input.data.maxAmountMinor ?? 0;
    if (min <= 0 || max <= 0 || max < min) {
      throw new AppError("VALIDATION_ERROR", "Set a valid minimum and maximum amount");
    }
  }

  const [link] = await db
    .insert(paymentLinks)
    .values({
      organizationId: input.organizationId,
      publicReference: publicReference.paymentLink(),
      title: input.data.title,
      description: input.data.description ?? null,
      amountMinor: input.data.allowVariableAmount ? null : (input.data.amountMinor ?? null),
      currency: input.data.currency,
      allowVariableAmount: input.data.allowVariableAmount,
      minAmountMinor: input.data.allowVariableAmount ? (input.data.minAmountMinor ?? null) : null,
      maxAmountMinor: input.data.allowVariableAmount ? (input.data.maxAmountMinor ?? null) : null,
      successUrl: input.data.successUrl ?? null,
      cancelUrl: input.data.cancelUrl ?? null,
      expiresAt: input.data.expiresAt ? new Date(input.data.expiresAt) : null,
      collectCustomerPhone: input.data.collectCustomerPhone,
      createdBy: input.actorId,
    })
    .returning();

  await audit({
    action: "payment_link.created",
    organizationId: input.organizationId,
    actorId: input.actorId,
    actorEmail: input.actorEmail,
    targetType: "payment_link",
    targetId: link!.id,
    metadata: { title: link!.title, amountMinor: link!.amountMinor, currency: link!.currency },
  });

  return link!;
}

export async function setPaymentLinkStatus(input: {
  organizationId: string;
  linkId: string;
  status: "active" | "disabled";
  actor: { id: string; email: string };
}): Promise<void> {
  const [link] = await db
    .select()
    .from(paymentLinks)
    .where(and(eq(paymentLinks.id, input.linkId), eq(paymentLinks.organizationId, input.organizationId)))
    .limit(1);
  if (!link) throw new AppError("NOT_FOUND", "Payment link not found");

  await db
    .update(paymentLinks)
    .set({ status: input.status })
    .where(eq(paymentLinks.id, input.linkId));

  await audit({
    action: input.status === "disabled" ? "payment_link.disabled" : "payment_link.updated",
    organizationId: input.organizationId,
    actorId: input.actor.id,
    actorEmail: input.actor.email,
    targetType: "payment_link",
    targetId: input.linkId,
    metadata: { status: input.status },
  });
}

export function linkIsPayable(link: PaymentLink, now = new Date()): { payable: boolean; reason?: string } {
  if (link.status !== "active") return { payable: false, reason: "This payment link is no longer accepting payments." };
  if (link.expiresAt && link.expiresAt.getTime() < now.getTime()) {
    return { payable: false, reason: "This payment link has expired." };
  }
  return { payable: true };
}

/** Server-validated amount for a link; client-submitted amounts are never trusted. */
export function resolveLinkAmount(link: PaymentLink, requestedMinor: number | null): number {
  if (!link.allowVariableAmount) {
    if (!link.amountMinor) throw new AppError("CONFIGURATION_ERROR", "This payment link has no amount configured");
    return link.amountMinor;
  }
  if (requestedMinor === null || !Number.isInteger(requestedMinor) || requestedMinor <= 0) {
    throw new AppError("VALIDATION_ERROR", "Enter the amount you want to pay");
  }
  const min = link.minAmountMinor ?? 0;
  const max = link.maxAmountMinor ?? Number.MAX_SAFE_INTEGER;
  if (requestedMinor < min || requestedMinor > max) {
    throw new AppError(
      "VALIDATION_ERROR",
      `Enter an amount between ${(min / 100).toLocaleString("en-NG")} and ${(max / 100).toLocaleString("en-NG")} ${link.currency}`,
    );
  }
  return requestedMinor;
}

/** Public link data. Returns only fields safe to render on a public page. */
export async function getPublicPaymentLink(reference: string) {
  const [row] = await db
    .select({
      link: paymentLinks,
      organizationName: organizations.name,
      organizationSlug: organizations.slug,
      organizationStatus: organizations.status,
    })
    .from(paymentLinks)
    .innerJoin(organizations, eq(organizations.id, paymentLinks.organizationId))
    .where(eq(paymentLinks.publicReference, reference))
    .limit(1);
  if (!row) return null;
  if (row.organizationStatus !== "active") return null;
  return {
    link: row.link,
    organizationName: row.organizationName,
    organizationSlug: row.organizationSlug,
  };
}

/** Public checkout start. Validates link state and amount on the server. */
export async function startLinkCheckout(input: {
  reference: string;
  amountMinor: number | null;
  customerName?: string;
  customerEmail: string;
  customerPhone?: string;
}) {
  const publicData = await getPublicPaymentLink(input.reference);
  if (!publicData) throw new AppError("NOT_FOUND", "Payment link not found");

  const payable = linkIsPayable(publicData.link);
  if (!payable.payable) throw new AppError("CONFLICT", payable.reason ?? "This link cannot accept payments");

  const amountMinor = resolveLinkAmount(publicData.link, input.amountMinor);

  return startCheckout({
    organizationId: publicData.link.organizationId,
    amountMinor,
    currency: publicData.link.currency,
    customerEmail: input.customerEmail,
    customerName: input.customerName ?? null,
    channel: "hosted_link",
    paymentLinkId: publicData.link.id,
    metadata: {
      paymentLinkReference: publicData.link.publicReference,
      customerPhone: input.customerPhone,
    },
  });
}

export async function listPaymentLinks(organizationId: string, options: { page: number; pageSize: number }) {
  const where = eq(paymentLinks.organizationId, organizationId);
  const [rows, total] = await Promise.all([
    db
      .select({
        link: paymentLinks,
        collectedMinor: sql<number>`coalesce((select sum(${payments.amountMinor}) from ${payments} where ${payments.paymentLinkId} = ${paymentLinks.id} and ${payments.status} = 'succeeded'), 0)::bigint`,
        successCount: sql<number>`coalesce((select count(*) from ${payments} where ${payments.paymentLinkId} = ${paymentLinks.id} and ${payments.status} = 'succeeded'), 0)::int`,
      })
      .from(paymentLinks)
      .where(where)
      .orderBy(desc(paymentLinks.createdAt))
      .limit(options.pageSize)
      .offset((options.page - 1) * options.pageSize),
    db.select({ value: count() }).from(paymentLinks).where(where),
  ]);
  return { rows, total: Number(total[0]?.value ?? 0) };
}
