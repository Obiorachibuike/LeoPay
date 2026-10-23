/**
 * Payment lifecycle: initialization, authoritative verification, refunds and
 * provider webhook processing.
 *
 * Rules enforced here:
 * - A redirect back to the app never proves success; only provider
 *   verification (webhook or explicit verify call) can settle a payment.
 * - Amounts and currencies returned by the provider must match the internal
 *   record exactly before money is recognised.
 * - Settlement, ledger postings, invoice/order updates, outbox events and
 *   emails happen inside one database transaction.
 * - Every operation is idempotent under retries and duplicate webhooks.
 */
import { and, eq, sql } from "drizzle-orm";
import { db, transaction, type Database } from "@/lib/db/client";
import {
  customers,
  invoices,
  orders,
  payments,
  paymentLinks,
  refunds,
  webhookEvents,
  type Payment,
} from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { env } from "@/lib/env";
import { formatMoney } from "@/lib/money";
import { internalReference } from "@/lib/ids";
import { defaultProvider, providerForName } from "@/lib/providers";
import type { ProviderName, VerifyPaymentResult } from "@/lib/providers/types";
import { collectionPostings, postEntry, refundPostings } from "@/lib/ledger";
import { enqueueMerchantEvent, type MerchantEventType } from "@/services/jobs";
import { queueEmail } from "@/services/notifications";
import { audit } from "@/lib/audit";
import { recordReconciliationException } from "@/services/reconciliation";

const TERMINAL_SUCCESS = new Set(["succeeded", "refunded", "partially_refunded"]);

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  created: ["pending", "processing", "failed", "cancelled", "expired"],
  pending: ["processing", "succeeded", "failed", "cancelled", "expired"],
  processing: ["succeeded", "failed", "cancelled"],
  failed: ["succeeded"], // a delayed provider success remains authoritative
  cancelled: ["succeeded"],
  expired: ["succeeded"],
  succeeded: ["refunded", "partially_refunded"],
  partially_refunded: ["refunded"],
  refunded: [],
};

export function canTransition(from: string, to: string): boolean {
  if (from === to) return true;
  return (ALLOWED_TRANSITIONS[from] ?? []).includes(to);
}

export type CheckoutInput = {
  organizationId: string;
  amountMinor: number;
  currency: string;
  customerEmail: string;
  customerName?: string | null;
  channel: "hosted_link" | "invoice" | "storefront" | "api";
  paymentLinkId?: string | null;
  invoiceId?: string | null;
  orderId?: string | null;
  metadata?: Record<string, unknown>;
  customerId?: string | null;
  providerName?: ProviderName;
};

export type CheckoutResult = { payment: Payment; authorizationUrl: string };

/**
 * Creates a pending payment and initializes it with the provider.
 * Provider failure leaves a failed payment record (never a silent success).
 */
export async function startCheckout(input: CheckoutInput): Promise<CheckoutResult> {
  const provider = input.providerName ? providerForName(input.providerName) : defaultProvider();
  if (!provider.isConfigured()) {
    throw new AppError(
      "PROVIDER_NOT_CONFIGURED",
      "Payments are not available yet: the payment provider has not been configured for this deployment.",
    );
  }

  const reference = internalReference(input.channel === "invoice" ? "inv" : "pay");

  const [payment] = await db
    .insert(payments)
    .values({
      organizationId: input.organizationId,
      customerId: input.customerId ?? null,
      paymentLinkId: input.paymentLinkId ?? null,
      invoiceId: input.invoiceId ?? null,
      orderId: input.orderId ?? null,
      internalReference: reference,
      provider: provider.name,
      amountMinor: input.amountMinor,
      currency: input.currency,
      status: "created",
      channel: input.channel,
      customerEmail: input.customerEmail,
      customerName: input.customerName ?? null,
      metadata: input.metadata ?? {},
    })
    .returning();

  try {
    const initialized = await provider.initializePayment({
      reference,
      amountMinor: input.amountMinor,
      currency: input.currency,
      email: input.customerEmail,
      customerName: input.customerName ?? undefined,
      callbackUrl: `${env.appUrl}/checkout/return?reference=${encodeURIComponent(reference)}`,
      metadata: { organizationId: input.organizationId, channel: input.channel, ...input.metadata },
    });

    const [updated] = await db
      .update(payments)
      .set({
        status: "pending",
        providerReference: initialized.providerReference,
        metadata: { ...(input.metadata ?? {}), authorizationUrl: initialized.authorizationUrl },
      })
      .where(eq(payments.id, payment!.id))
      .returning();

    await audit({
      action: "payment.initialized",
      organizationId: input.organizationId,
      targetType: "payment",
      targetId: payment!.id,
      metadata: { provider: provider.name, amountMinor: input.amountMinor, currency: input.currency },
    });

    return { payment: updated!, authorizationUrl: initialized.authorizationUrl };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Payment initialization failed";
    await db
      .update(payments)
      .set({ status: "failed", failureCode: "initialization_failed", failureMessage: message.slice(0, 300) })
      .where(eq(payments.id, payment!.id));
    logger.error("Payment initialization failed", { paymentId: payment!.id, error: message });
    throw error instanceof AppError
      ? error
      : new AppError("PAYMENT_ERROR", "We could not start this payment. Please try again.");
  }
}

/** Attaches (or reuses) a customer record scoped to the organization. */
export async function upsertCustomer(
  organizationId: string,
  input: { name: string; email?: string | null; phone?: string | null },
): Promise<string> {
  if (input.email) {
    const [existing] = await db
      .select({ id: customers.id })
      .from(customers)
      .where(and(eq(customers.organizationId, organizationId), eq(customers.email, input.email)))
      .limit(1);
    if (existing) return existing.id;
  }
  const [created] = await db
    .insert(customers)
    .values({
      organizationId,
      name: input.name,
      email: input.email ?? null,
      phone: input.phone ?? null,
    })
    .returning({ id: customers.id });
  return created!.id;
}

/* ---------------------------------------------------------- verification */

export type SettlementOutcome = {
  payment: Payment;
  settled: boolean;
  reason?: string;
};

/**
 * Verifies a payment with the provider and settles it atomically.
 * Safe to call from the return page, a webhook, a reconciliation job or a
 * repeated request: the second caller observes the final state and does not
 * post a second ledger entry or duplicate events.
 */
export async function verifyAndSettlePayment(internalRef: string): Promise<SettlementOutcome> {
  const [payment] = await db.select().from(payments).where(eq(payments.internalReference, internalRef)).limit(1);
  if (!payment) throw new AppError("NOT_FOUND", "Payment not found");

  if (TERMINAL_SUCCESS.has(payment.status)) {
    return { payment, settled: payment.status === "succeeded", reason: "already_settled" };
  }

  const provider = providerForName(payment.provider);
  if (!provider.isConfigured()) {
    throw new AppError("PROVIDER_NOT_CONFIGURED", "The payment provider for this transaction is not configured");
  }

  const result = await provider.verifyPayment(payment.providerReference ?? payment.internalReference);

  if (result.status === "pending" || result.status === "processing") {
    const nextStatus = result.status === "processing" ? "processing" : "pending";
    if (canTransition(payment.status, nextStatus)) {
      const [updated] = await db
        .update(payments)
        .set({ status: nextStatus as Payment["status"] })
        .where(eq(payments.id, payment.id))
        .returning();
      return { payment: updated!, settled: false, reason: "pending" };
    }
    return { payment, settled: false, reason: "pending" };
  }

  if (result.status !== "succeeded") {
    return finalizeFailure(payment, result);
  }

  // Amount and currency integrity checks before any money is recognised.
  if (result.amountMinor !== payment.amountMinor || result.currency !== payment.currency) {
    const [updated] = await db
      .update(payments)
      .set({
        status: "failed",
        failureCode: "amount_mismatch",
        failureMessage: "Provider amount did not match the requested amount",
      })
      .where(eq(payments.id, payment.id))
      .returning();
    await recordReconciliationException({
      organizationId: payment.organizationId,
      paymentId: payment.id,
      type: "amount_mismatch",
      severity: "critical",
      description: `Provider reported ${result.amountMinor} ${result.currency} but the payment was created for ${payment.amountMinor} ${payment.currency}.`,
      expected: { amountMinor: payment.amountMinor, currency: payment.currency },
      actual: { amountMinor: result.amountMinor, currency: result.currency },
    });
    return { payment: updated!, settled: false, reason: "amount_mismatch" };
  }

  return settlePayment(payment, result);
}

async function finalizeFailure(payment: Payment, result: VerifyPaymentResult): Promise<SettlementOutcome> {
  const updated = await transaction(async (tx) => {
    await tx.execute(sql`select id from payments where id = ${payment.id} for update`);
    const [current] = await tx.select().from(payments).where(eq(payments.id, payment.id)).limit(1);
    if (!current) throw new AppError("NOT_FOUND", "Payment not found");
    if (TERMINAL_SUCCESS.has(current.status)) return current;

    const next = result.status === "cancelled" ? "cancelled" : "failed";
    if (!canTransition(current.status, next)) return current;

    const [row] = await tx
      .update(payments)
      .set({
        status: next as Payment["status"],
        failureCode: result.failureCode ?? next,
        failureMessage: result.failureMessage ?? null,
        paymentMethod: result.channel ?? current.paymentMethod,
      })
      .where(eq(payments.id, payment.id))
      .returning();

    await enqueueMerchantEvent(tx, {
      organizationId: current.organizationId,
      type: "payment.failed",
      data: {
        id: current.id,
        reference: current.internalReference,
        amount: current.amountMinor,
        currency: current.currency,
        status: next,
      },
    });

    return row!;
  });

  await audit({
    action: "payment.failed",
    organizationId: payment.organizationId,
    targetType: "payment",
    targetId: payment.id,
    metadata: { reason: result.failureCode ?? "provider_failed" },
  });

  if (updated.customerEmail) {
    await queueEmail({
      to: updated.customerEmail,
      template: "payment_failed",
      organizationId: updated.organizationId,
      data: {
        amount: formatMoney(updated.amountMinor, updated.currency),
        description: updated.customerName ?? "your payment",
        reference: updated.internalReference,
        url: `${env.appUrl}/checkout/return?reference=${updated.internalReference}`,
      },
    }).catch(() => undefined);
  }

  return { payment: updated, settled: false, reason: "failed" };
}

async function settlePayment(payment: Payment, result: VerifyPaymentResult): Promise<SettlementOutcome> {
  const fee = result.feeMinor !== null && result.feeMinor !== undefined && result.feeMinor >= 0 ? Math.min(result.feeMinor, payment.amountMinor) : 0;
  const net = payment.amountMinor - fee;

  const settled = await transaction(async (tx) => {
    // Serialize concurrent settlement attempts (webhook + return page + retry).
    await tx.execute(sql`select id from payments where id = ${payment.id} for update`);
    const [current] = await tx.select().from(payments).where(eq(payments.id, payment.id)).limit(1);
    if (!current) throw new AppError("NOT_FOUND", "Payment not found");
    if (current.status === "succeeded") return { payment: current, alreadySettled: true };

    const [updated] = await tx
      .update(payments)
      .set({
        status: "succeeded",
        paidAt: result.paidAt ?? new Date(),
        feeMinor: fee,
        netMinor: net,
        paymentMethod: result.channel ?? null,
        providerReference: result.providerReference,
        failureCode: null,
        failureMessage: null,
      })
      .where(eq(payments.id, payment.id))
      .returning();

    await postEntry(tx, {
      organizationId: current.organizationId,
      currency: current.currency,
      reference: `payment:${current.id}`,
      description: `Payment ${current.internalReference} settled`,
      sourceType: "payment",
      sourceId: current.id,
      postings: collectionPostings({ grossMinor: current.amountMinor, feeMinor: fee }),
    });

    if (current.invoiceId) {
      await applyInvoicePayment(tx, current.organizationId, current.invoiceId, current.amountMinor, current.currency);
    }
    if (current.orderId) {
      await markOrderPaid(tx, current.organizationId, current.orderId, current.id);
    }

    const eventTypes: MerchantEventType[] = ["payment.succeeded"];
    if (current.invoiceId) eventTypes.push("invoice.paid");
    if (current.orderId) eventTypes.push("order.paid");

    for (const type of eventTypes) {
      await enqueueMerchantEvent(tx, {
        organizationId: current.organizationId,
        type,
        data: {
          id: current.id,
          reference: current.internalReference,
          amount: current.amountMinor,
          fee,
          net,
          currency: current.currency,
          status: "succeeded",
          invoiceId: current.invoiceId,
          orderId: current.orderId,
          paidAt: (result.paidAt ?? new Date()).toISOString(),
          paymentMethod: result.channel ?? null,
        },
      });
    }

    return { payment: updated!, alreadySettled: false };
  });

  if (!settled.alreadySettled) {
    await audit({
      action: "payment.succeeded",
      organizationId: payment.organizationId,
      targetType: "payment",
      targetId: payment.id,
      metadata: { amountMinor: payment.amountMinor, currency: payment.currency, feeMinor: fee },
    });

    if (settled.payment.customerEmail) {
      await queueEmail({
        to: settled.payment.customerEmail,
        template: "payment_confirmation",
        organizationId: payment.organizationId,
        data: {
          amount: formatMoney(settled.payment.amountMinor, settled.payment.currency),
          description: settled.payment.customerName ?? "your payment",
          reference: settled.payment.internalReference,
          url: `${env.appUrl}/checkout/return?reference=${settled.payment.internalReference}`,
        },
      }).catch(() => undefined);
    }
    logger.info("Payment settled", { paymentId: payment.id, amountMinor: payment.amountMinor });
  }

  return { payment: settled.payment, settled: true };
}

/** Applies a verified payment to an invoice, inside the caller's transaction. */
async function applyInvoicePayment(
  tx: Database,
  organizationId: string,
  invoiceId: string,
  amountMinor: number,
  currency: string,
): Promise<void> {
  await tx.execute(sql`select id from invoices where id = ${invoiceId} for update`);
  const [invoice] = await tx
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, invoiceId), eq(invoices.organizationId, organizationId)))
    .limit(1);
  if (!invoice) return;
  if (invoice.currency !== currency) {
    throw new AppError("UNSAFE_OPERATION", "Invoice currency does not match the payment currency");
  }

  const amountPaidMinor = Math.min(invoice.totalMinor, invoice.amountPaidMinor + amountMinor);
  const status =
    amountPaidMinor >= invoice.totalMinor ? "paid" : amountPaidMinor > 0 ? "partially_paid" : invoice.status;

  await tx
    .update(invoices)
    .set({ amountPaidMinor, status: status as typeof invoice.status })
    .where(eq(invoices.id, invoiceId));
}

async function markOrderPaid(tx: Database, organizationId: string, orderId: string, paymentId: string): Promise<void> {
  await tx.execute(sql`select id from orders where id = ${orderId} for update`);
  const [order] = await tx
    .select()
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.organizationId, organizationId)))
    .limit(1);
  if (!order) return;
  await tx
    .update(orders)
    .set({ status: "paid", paymentId })
    .where(and(eq(orders.id, orderId), eq(orders.status, "pending_payment")));
}

/* --------------------------------------------------------------- refunds */

export async function refundPayment(input: {
  organizationId: string;
  paymentId: string;
  amountMinor: number;
  reason?: string;
  actorId: string;
  actorEmail: string;
}): Promise<{ refundId: string; status: string }> {
  const [payment] = await db
    .select()
    .from(payments)
    .where(and(eq(payments.id, input.paymentId), eq(payments.organizationId, input.organizationId)))
    .limit(1);
  if (!payment) throw new AppError("NOT_FOUND", "Payment not found");
  if (payment.status !== "succeeded" && payment.status !== "partially_refunded") {
    throw new AppError("CONFLICT", "Only settled payments can be refunded");
  }

  const [refundedRow] = await db
    .select({ total: sql<number>`coalesce(sum(${refunds.amountMinor}), 0)::bigint` })
    .from(refunds)
    .where(and(eq(refunds.paymentId, payment.id), eq(refunds.status, "succeeded")));
  const alreadyRefunded = Number(refundedRow?.total ?? 0);
  const refundable = payment.amountMinor - alreadyRefunded;

  if (input.amountMinor <= 0) throw new AppError("VALIDATION_ERROR", "Refund amount must be greater than zero");
  if (input.amountMinor > refundable) {
    throw new AppError(
      "CONFLICT",
      `Refund exceeds the refundable amount of ${formatMoney(refundable, payment.currency)}`,
    );
  }

  const provider = providerForName(payment.provider);
  if (!provider.capabilities.refunds) {
    throw new AppError("UNSUPPORTED", "This provider does not support refunds through LeoPay");
  }
  if (!payment.providerReference) {
    throw new AppError("CONFLICT", "This payment has no provider reference to refund");
  }

  const [refund] = await db
    .insert(refunds)
    .values({
      organizationId: input.organizationId,
      paymentId: payment.id,
      amountMinor: input.amountMinor,
      currency: payment.currency,
      reason: input.reason ?? null,
      status: "pending",
      provider: payment.provider,
      createdBy: input.actorId,
    })
    .returning();

  const result = await provider.createRefund({
    providerReference: payment.providerReference,
    amountMinor: input.amountMinor,
    reason: input.reason,
  });

  if (result.status === "failed") {
    await db
      .update(refunds)
      .set({ status: "failed", providerReference: result.providerReference ?? null })
      .where(eq(refunds.id, refund!.id));
    throw new AppError("PROVIDER_ERROR", result.failureMessage ?? "The provider rejected this refund");
  }

  await db
    .update(refunds)
    .set({ status: result.status, providerReference: result.providerReference ?? null })
    .where(eq(refunds.id, refund!.id));

  if (result.status === "succeeded") {
    await applySucceededRefund(refund!.id);
  }

  await audit({
    action: "payment.refunded",
    organizationId: input.organizationId,
    actorId: input.actorId,
    actorEmail: input.actorEmail,
    targetType: "payment",
    targetId: payment.id,
    metadata: { refundId: refund!.id, amountMinor: input.amountMinor, status: result.status },
  });

  return { refundId: refund!.id, status: result.status };
}

/** Books a confirmed refund and shifts the payment into its refund state. */
export async function applySucceededRefund(refundId: string): Promise<void> {
  await transaction(async (tx) => {
    await tx.execute(sql`select id from refunds where id = ${refundId} for update`);
    const [refund] = await tx.select().from(refunds).where(eq(refunds.id, refundId)).limit(1);
    if (!refund || refund.status !== "succeeded") return;

    await postEntry(tx, {
      organizationId: refund.organizationId,
      currency: refund.currency,
      reference: `refund:${refund.id}`,
      description: `Refund for payment ${refund.paymentId}`,
      sourceType: "refund",
      sourceId: refund.id,
      postings: refundPostings(refund.amountMinor),
    });

    const [totals] = await tx
      .select({ total: sql<number>`coalesce(sum(${refunds.amountMinor}), 0)::bigint` })
      .from(refunds)
      .where(and(eq(refunds.paymentId, refund.paymentId), eq(refunds.status, "succeeded")));

    const [payment] = await tx.select().from(payments).where(eq(payments.id, refund.paymentId)).limit(1);
    if (!payment) return;
    const totalRefunded = Number(totals?.total ?? 0);
    const status = totalRefunded >= payment.amountMinor ? "refunded" : "partially_refunded";
    await tx
      .update(payments)
      .set({ status: status as Payment["status"] })
      .where(eq(payments.id, payment.id));

    await enqueueMerchantEvent(tx, {
      organizationId: refund.organizationId,
      type: "payment.refunded",
      data: {
        id: payment.id,
        reference: payment.internalReference,
        refundId: refund.id,
        amount: refund.amountMinor,
        totalRefunded,
        currency: refund.currency,
        status,
      },
    });
  });
}

/* ------------------------------------------------------- provider events */

/**
 * Processes a verified provider webhook event exactly once, using the provider
 * event id as the idempotency key. The payload's status is never trusted: the
 * transaction is re-verified with the provider API.
 */
export async function processProviderWebhook(input: {
  provider: ProviderName;
  eventId: string;
  eventType: string;
  payload: Record<string, unknown>;
}): Promise<{ processed: boolean; duplicate: boolean; message: string }> {
  const inserted = await db
    .insert(webhookEvents)
    .values({
      provider: input.provider,
      eventId: input.eventId,
      eventType: input.eventType,
      payload: input.payload,
      signatureVerified: true,
      status: "received",
    })
    .onConflictDoNothing({ target: [webhookEvents.provider, webhookEvents.eventId] })
    .returning({ id: webhookEvents.id });

  if (!inserted.length) {
    return { processed: false, duplicate: true, message: "Event already processed" };
  }
  const eventRowId = inserted[0]!.id;

  try {
    const data = (input.payload.data ?? {}) as Record<string, unknown>;
    const reference = typeof data.reference === "string" ? data.reference : null;

    if (input.eventType.startsWith("charge.") || input.eventType.startsWith("transaction.")) {
      const [payment] = reference
        ? await db.select().from(payments).where(eq(payments.providerReference, reference)).limit(1)
        : [];
      if (!payment) {
        await markEvent(eventRowId, "ignored", "No matching payment for provider reference");
        return { processed: false, duplicate: false, message: "No matching payment" };
      }
      await verifyAndSettlePayment(payment.internalReference);
    } else if (input.eventType.startsWith("transfer.")) {
      const { reconcilePayoutFromProvider } = await import("@/services/payouts");
      await reconcilePayoutFromProvider(reference ?? "");
    } else if (input.eventType.startsWith("refund.")) {
      const refundReference = String(data.id ?? data.refund_reference ?? "");
      if (refundReference) {
        const [refund] = await db
          .select()
          .from(refunds)
          .where(eq(refunds.providerReference, refundReference))
          .limit(1);
        if (refund && input.eventType === "refund.processed") {
          await db.update(refunds).set({ status: "succeeded" }).where(eq(refunds.id, refund.id));
          await applySucceededRefund(refund.id);
        }
      }
    }

    await markEvent(eventRowId, "processed");
    return { processed: true, duplicate: false, message: "Processed" };
  } catch (error) {
    const message = (error as Error).message.slice(0, 500);
    await markEvent(eventRowId, "failed", message);
    logger.error("Provider webhook processing failed", { eventId: input.eventId, error: message });
    throw error;
  }
}

async function markEvent(id: string, status: string, error?: string) {
  await db
    .update(webhookEvents)
    .set({ status, processedAt: new Date(), error: error ?? null, attempts: sql`${webhookEvents.attempts} + 1` })
    .where(eq(webhookEvents.id, id));
}

/** Expires stale pending payments. Does not touch settled records. */
export async function expireStalePayments(): Promise<number> {
  const result = await db
    .update(payments)
    .set({ status: "expired", failureCode: "expired", failureMessage: "Checkout was not completed in time" })
    .where(
      and(
        sql`${payments.status} in ('created','pending','processing')`,
        sql`${payments.createdAt} < now() - interval '24 hours'`,
      ),
    )
    .returning({ id: payments.id });
  return result.length;
}

/** Public-facing link lookup that does not expose internal identifiers. */
export async function getPaymentLinkByReference(reference: string) {
  const [link] = await db
    .select()
    .from(paymentLinks)
    .where(eq(paymentLinks.publicReference, reference))
    .limit(1);
  return link ?? null;
}

export function isTerminalSuccess(status: string): boolean {
  return TERMINAL_SUCCESS.has(status);
}
