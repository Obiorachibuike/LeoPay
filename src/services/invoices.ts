import { and, asc, count, desc, eq, sql } from "drizzle-orm";
import { db, transaction } from "@/lib/db/client";
import {
  customers,
  invoiceItems,
  invoiceSequences,
  invoices,
  organizations,
  type Invoice,
} from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { applyBps, formatMoney, multiplyMinor } from "@/lib/money";
import { publicReference } from "@/lib/ids";
import { startCheckout } from "@/services/payments";
import { enqueueMerchantEvent } from "@/services/jobs";
import { queueEmail } from "@/services/notifications";
import { env } from "@/lib/env";
import { audit } from "@/lib/audit";
import type { z } from "zod";
import type { invoiceSchema } from "@/lib/validation";
import { formatDate } from "@/lib/dates";
import { recordReconciliationException } from "@/services/reconciliation";

export type InvoiceInput = z.infer<typeof invoiceSchema>;

export function computeInvoiceTotals(input: {
  items: Array<{ quantity: number; unitAmountMinor: number }>;
  discountMinor: number;
  taxRateBps: number;
}): { subtotalMinor: number; discountMinor: number; taxMinor: number; totalMinor: number; lineAmounts: number[] } {
  const lineAmounts = input.items.map((item) => multiplyMinor(item.unitAmountMinor, item.quantity));
  const subtotalMinor = lineAmounts.reduce((sum, v) => sum + v, 0);

  if (input.discountMinor < 0) throw new AppError("VALIDATION_ERROR", "Discount cannot be negative");
  if (input.discountMinor > subtotalMinor) {
    throw new AppError("VALIDATION_ERROR", "Discount cannot exceed the subtotal");
  }
  if (input.taxRateBps < 0 || input.taxRateBps > 5000) {
    throw new AppError("VALIDATION_ERROR", "Tax rate must be between 0% and 50%");
  }
  const taxable = subtotalMinor - input.discountMinor;
  const taxMinor = applyBps(taxable, input.taxRateBps);
  return {
    subtotalMinor,
    discountMinor: input.discountMinor,
    taxMinor,
    totalMinor: taxable + taxMinor,
    lineAmounts,
  };
}

/** Allocates the next invoice number for the year atomically. */
async function nextInvoiceNumber(
  tx: Parameters<Parameters<typeof transaction>[0]>[0],
  organizationId: string,
  year: number,
): Promise<string> {
  const [row] = await tx
    .insert(invoiceSequences)
    .values({ organizationId, year, nextNumber: 2 })
    .onConflictDoUpdate({
      target: [invoiceSequences.organizationId, invoiceSequences.year],
      set: { nextNumber: sql`${invoiceSequences.nextNumber} + 1` },
    })
    .returning({ allocated: invoiceSequences.nextNumber });

  const allocated = (row?.allocated ?? 2) - 1;
  return `INV-${year}-${String(allocated).padStart(4, "0")}`;
}

export async function createInvoice(input: {
  organizationId: string;
  actorId: string;
  actorEmail: string;
  data: InvoiceInput;
}): Promise<Invoice> {
  const totals = computeInvoiceTotals({
    items: input.data.items,
    discountMinor: input.data.discountMinor,
    taxRateBps: input.data.taxRateBps,
  });

  const invoice = await transaction(async (tx) => {
    const year = new Date(input.data.issueDate).getUTCFullYear();
    const invoiceNumber = await nextInvoiceNumber(tx, input.organizationId, year);
    const reference = publicReference.invoice();

    let customerId = input.data.customerId ?? null;
    if (!customerId && input.data.customerEmail) {
      const [existing] = await tx
        .select({ id: customers.id })
        .from(customers)
        .where(
          and(eq(customers.organizationId, input.organizationId), eq(customers.email, input.data.customerEmail)),
        )
        .limit(1);
      if (existing) {
        customerId = existing.id;
      } else {
        const [created] = await tx
          .insert(customers)
          .values({
            organizationId: input.organizationId,
            name: input.data.customerName,
            email: input.data.customerEmail ?? null,
          })
          .returning({ id: customers.id });
        customerId = created!.id;
      }
    }

    const [created] = await tx
      .insert(invoices)
      .values({
        organizationId: input.organizationId,
        customerId,
        invoiceNumber,
        publicReference: reference,
        currency: input.data.currency,
        subtotalMinor: totals.subtotalMinor,
        discountMinor: totals.discountMinor,
        taxMinor: totals.taxMinor,
        totalMinor: totals.totalMinor,
        taxRateBps: input.data.taxRateBps,
        status: input.data.status,
        issueDate: new Date(input.data.issueDate),
        dueDate: input.data.dueDate ? new Date(input.data.dueDate) : null,
        notes: input.data.notes ?? null,
        terms: input.data.terms ?? null,
        customerName: input.data.customerName,
        customerEmail: input.data.customerEmail ?? null,
        createdBy: input.actorId,
      })
      .returning();

    await tx.insert(invoiceItems).values(
      input.data.items.map((item, index) => ({
        invoiceId: created!.id,
        description: item.description,
        quantity: String(item.quantity),
        unitAmountMinor: item.unitAmountMinor,
        amountMinor: totals.lineAmounts[index]!,
        position: index,
      })),
    );

    if (input.data.status === "issued") {
      await enqueueMerchantEvent(tx, {
        organizationId: input.organizationId,
        type: "invoice.created",
        data: {
          id: created!.id,
          number: created!.invoiceNumber,
          amount: created!.totalMinor,
          currency: created!.currency,
        },
      });
    }

    return created!;
  });

  await audit({
    action: "invoice.created",
    organizationId: input.organizationId,
    actorId: input.actorId,
    actorEmail: input.actorEmail,
    targetType: "invoice",
    targetId: invoice.id,
    metadata: { invoiceNumber: invoice.invoiceNumber, totalMinor: invoice.totalMinor, currency: invoice.currency },
  });

  return invoice;
}

export async function getInvoiceWithItems(organizationId: string, invoiceId: string) {
  const [invoice] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, invoiceId), eq(invoices.organizationId, organizationId)))
    .limit(1);
  if (!invoice) return null;
  const items = await db
    .select()
    .from(invoiceItems)
    .where(eq(invoiceItems.invoiceId, invoice.id))
    .orderBy(asc(invoiceItems.position));
  const customer = invoice.customerId
    ? (
        await db
          .select()
          .from(customers)
          .where(and(eq(customers.id, invoice.customerId), eq(customers.organizationId, organizationId)))
          .limit(1)
      )[0]
    : undefined;
  return { invoice, items, customer: customer ?? null };
}

export async function getInvoiceByPublicReference(reference: string) {
  const [invoice] = await db.select().from(invoices).where(eq(invoices.publicReference, reference)).limit(1);
  if (!invoice) return null;
  const items = await db
    .select()
    .from(invoiceItems)
    .where(eq(invoiceItems.invoiceId, invoice.id))
    .orderBy(asc(invoiceItems.position));
  return { invoice, items };
}

export async function updateInvoiceStatus(
  organizationId: string,
  invoiceId: string,
  status: Invoice["status"],
  actor: { id: string; email: string },
): Promise<void> {
  const [invoice] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, invoiceId), eq(invoices.organizationId, organizationId)))
    .limit(1);
  if (!invoice) throw new AppError("NOT_FOUND", "Invoice not found");
  if (invoice.status === "paid" && status !== "paid") {
    throw new AppError("CONFLICT", "A paid invoice cannot be changed to another status");
  }
  if (status === "paid") {
    throw new AppError("CONFLICT", "Invoices are marked paid only when a payment is verified");
  }
  await db.update(invoices).set({ status }).where(eq(invoices.id, invoiceId));
  await audit({
    action: "invoice.updated",
    organizationId,
    actorId: actor.id,
    actorEmail: actor.email,
    targetType: "invoice",
    targetId: invoiceId,
    metadata: { status },
  });
}

/** Sends (or resends) an invoice email and marks it as sent. */
export async function sendInvoiceEmail(input: {
  organizationId: string;
  invoiceId: string;
  reminder?: boolean;
  actor?: { id: string | null; email: string };
}): Promise<void> {
  const result = await getInvoiceWithItems(input.organizationId, input.invoiceId);
  if (!result) throw new AppError("NOT_FOUND", "Invoice not found");
  const { invoice } = result;
  if (!invoice.customerEmail) throw new AppError("VALIDATION_ERROR", "This invoice has no customer email address");
  if (invoice.status === "draft") throw new AppError("CONFLICT", "Issue the invoice before sending it");
  if (invoice.status === "paid") throw new AppError("CONFLICT", "This invoice is already paid");

  const [organization] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, input.organizationId))
    .limit(1);

  await queueEmail({
    to: invoice.customerEmail,
    template: input.reminder ? "invoice_reminder" : "invoice_delivery",
    organizationId: input.organizationId,
    data: {
      invoiceNumber: invoice.invoiceNumber,
      organization: organization?.name ?? "LeoPay merchant",
      amount: formatMoney(invoice.totalMinor - invoice.amountPaidMinor, invoice.currency),
      dueDate: formatDate(invoice.dueDate ?? invoice.issueDate),
      notes: invoice.notes ?? "",
      url: `${env.appUrl}/pay/invoice/${invoice.publicReference}`,
    },
  });

  await db
    .update(invoices)
    .set(input.reminder ? { lastReminderAt: new Date() } : { sentAt: new Date() })
    .where(eq(invoices.id, invoice.id));

  await audit({
    action: input.reminder ? "invoice.reminder_sent" : "invoice.sent",
    organizationId: input.organizationId,
    actorId: input.actor?.id,
    actorEmail: input.actor?.email,
    targetType: "invoice",
    targetId: invoice.id,
  });
}

/** Starts checkout for the outstanding balance of an invoice. */
export async function startInvoiceCheckout(reference: string, email?: string) {
  const result = await getInvoiceByPublicReference(reference);
  if (!result) throw new AppError("NOT_FOUND", "Invoice not found");
  const { invoice } = result;

  if (invoice.status === "draft" || invoice.status === "cancelled") {
    throw new AppError("CONFLICT", "This invoice is not available for payment");
  }
  if (invoice.status === "paid") throw new AppError("CONFLICT", "This invoice has already been paid");

  const outstanding = invoice.totalMinor - invoice.amountPaidMinor;
  if (outstanding <= 0) throw new AppError("CONFLICT", "This invoice has no outstanding balance");

  return startCheckout({
    organizationId: invoice.organizationId,
    amountMinor: outstanding,
    currency: invoice.currency,
    customerEmail: email ?? invoice.customerEmail ?? "",
    customerName: invoice.customerName,
    channel: "invoice",
    invoiceId: invoice.id,
    customerId: invoice.customerId,
    metadata: { invoiceNumber: invoice.invoiceNumber },
  });
}

/**
 * Flags unpaid invoices past their due date. Status changes are limited to
 * issued → overdue; paid invoices are never modified by this job.
 */
export async function refreshOverdueInvoices(organizationId: string): Promise<number> {
  const result = await db
    .update(invoices)
    .set({ status: "overdue" })
    .where(
      and(
        eq(invoices.organizationId, organizationId),
        sql`${invoices.status} in ('issued','partially_paid')`,
        sql`${invoices.dueDate} is not null and ${invoices.dueDate} < now()`,
      ),
    )
    .returning({ id: invoices.id });
  return result.length;
}

export async function listInvoices(organizationId: string, options: { page: number; pageSize: number; status?: string }) {
  const where = options.status
    ? and(eq(invoices.organizationId, organizationId), eq(invoices.status, options.status as Invoice["status"]))
    : eq(invoices.organizationId, organizationId);

  const [rows, total] = await Promise.all([
    db
      .select()
      .from(invoices)
      .where(where)
      .orderBy(desc(invoices.createdAt))
      .limit(options.pageSize)
      .offset((options.page - 1) * options.pageSize),
    db.select({ value: count() }).from(invoices).where(where),
  ]);
  return { rows, total: Number(total[0]?.value ?? 0) };
}

/** Consistency check used by reconciliation: verified overpayment is an exception. */
export async function assertInvoicePaymentConsistency(invoiceId: string, organizationId: string) {
  const [invoice] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, invoiceId), eq(invoices.organizationId, organizationId)))
    .limit(1);
  if (!invoice) return;
  if (invoice.amountPaidMinor > invoice.totalMinor) {
    await recordReconciliationException({
      organizationId,
      type: "invoice_paid_but_outstanding",
      severity: "critical",
      description: `Invoice ${invoice.invoiceNumber} has payments exceeding its total.`,
      expected: { totalMinor: invoice.totalMinor },
      actual: { amountPaidMinor: invoice.amountPaidMinor },
    });
  }
}
