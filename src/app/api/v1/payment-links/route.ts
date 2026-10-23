import { and, count, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { paymentLinks } from "@/lib/db/schema";
import { withApi, jsonResponse, readJson, parsePagination, apiError } from "@/lib/api";
import { serializePaymentLink } from "@/lib/api-serialize";
import { paymentLinkSchema } from "@/lib/validation";
import { createPaymentLink } from "@/services/payment-links";
import { fieldErrorsApp } from "@/lib/actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return withApi(request, "payment_links:read", async (ctx, url) => {
    const { limit, page } = parsePagination(url);
    const status = url.searchParams.get("status");
    const where = status
      ? and(eq(paymentLinks.organizationId, ctx.organizationId), eq(paymentLinks.status, status))
      : eq(paymentLinks.organizationId, ctx.organizationId);
    const [rows, total] = await Promise.all([
      db.select().from(paymentLinks).where(where).orderBy(desc(paymentLinks.createdAt)).limit(limit).offset((page - 1) * limit),
      db.select({ value: count() }).from(paymentLinks).where(where),
    ]);
    return jsonResponse({
      data: rows.map(serializePaymentLink),
      meta: { page, limit, total: Number(total[0]?.value ?? 0) },
    });
  });
}

const createSchema = paymentLinkSchema;

export async function POST(request: Request) {
  return withApi(request, "payment_links:write", async (ctx) => {
    const body = await readJson(request);
    const parsed = createSchema.safeParse({
      title: body.title,
      description: body.description ?? undefined,
      allowVariableAmount: Boolean(body.allow_variable_amount),
      amountMinor: body.amount_minor ?? undefined,
      minAmountMinor: body.min_amount_minor ?? undefined,
      maxAmountMinor: body.max_amount_minor ?? undefined,
      currency: body.currency ?? "NGN",
      successUrl: body.success_url ?? undefined,
      cancelUrl: body.cancel_url ?? undefined,
      expiresAt: body.expires_at ?? undefined,
      collectCustomerPhone: Boolean(body.collect_customer_phone),
    });
    if (!parsed.success) {
      return apiError(422, "VALIDATION_ERROR", "Check the request body", fieldErrorsApp(parsed.error));
    }
    const link = await createPaymentLink({
      organizationId: ctx.organizationId,
      actorId: ctx.keyId,
      actorEmail: `api-key:${ctx.keyId}`,
      data: parsed.data,
    });
    return jsonResponse({ data: serializePaymentLink(link) }, 201);
  });
}

// Keep zod referenced for consumers importing this module's schema types.
export type PaymentLinkApiBody = z.infer<typeof createSchema>;
