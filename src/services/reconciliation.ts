/**
 * Reconciliation between LeoPay's records, its ledger and the payment provider.
 *
 * Reconciliation never mutates financial records to make totals agree. It
 * records exceptions for a human to resolve, and only provider-verified
 * settlement (through the normal payment path) can change a payment's state.
 */
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  invoices,
  journalEntries,
  orders,
  payments,
  payouts,
  reconciliationExceptions,
  reconciliationRuns,
  refunds,
  webhookEvents,
} from "@/lib/db/schema";
import { providerForName } from "@/lib/providers";
import { verifyAndSettlePayment } from "@/services/payments";
import { logger } from "@/lib/logger";
import { audit } from "@/lib/audit";

export type ExceptionType =
  | "amount_mismatch"
  | "currency_mismatch"
  | "missing_ledger_entry"
  | "duplicate_provider_reference"
  | "refund_exceeds_payment"
  | "unresolved_payout"
  | "paid_order_without_payment"
  | "invoice_paid_but_outstanding"
  | "failed_webhook_event"
  | "provider_verification_failed";

export async function recordReconciliationException(input: {
  organizationId: string;
  paymentId?: string | null;
  payoutId?: string | null;
  runId?: string | null;
  type: ExceptionType;
  severity?: "info" | "warning" | "critical";
  description: string;
  expected?: Record<string, unknown>;
  actual?: Record<string, unknown>;
}) {
  await db.insert(reconciliationExceptions).values({
    organizationId: input.organizationId,
    paymentId: input.paymentId ?? null,
    payoutId: input.payoutId ?? null,
    runId: input.runId ?? null,
    type: input.type,
    severity: input.severity ?? "warning",
    description: input.description,
    expected: input.expected,
    actual: input.actual,
  });
}

export type ReconciliationResult = {
  runId: string;
  checked: number;
  exceptions: number;
  providerVerified: number;
};

/**
 * Runs reconciliation for an organization.
 * - Internal checks compare payments, ledger, invoices, orders, refunds and payouts.
 * - Provider checks re-verify a bounded set of in-flight payments so a missed
 *   webhook cannot leave a paid transaction pending forever.
 */
export async function runReconciliation(input: {
  organizationId: string;
  provider?: string;
  verifyInFlight?: boolean;
  actorId?: string | null;
}): Promise<ReconciliationResult> {
  const [run] = await db
    .insert(reconciliationRuns)
    .values({
      organizationId: input.organizationId,
      provider: input.provider ?? "all",
      scope: input.verifyInFlight ? "provider" : "internal",
      status: "running",
    })
    .returning();

  let checked = 0;
  let exceptionCount = 0;
  let providerVerified = 0;

  const flag = async (input2: Parameters<typeof recordReconciliationException>[0]) => {
    await recordReconciliationException({ ...input2, runId: run!.id });
    exceptionCount += 1;
  };

  try {
    /* 1. Settled payments must have a balanced journal entry. */
    const settled = await db
      .select({
        id: payments.id,
        amountMinor: payments.amountMinor,
        currency: payments.currency,
        internalReference: payments.internalReference,
        status: payments.status,
      })
      .from(payments)
      .where(and(eq(payments.organizationId, input.organizationId), sql`${payments.status} in ('succeeded','partially_refunded','refunded')`))
      .limit(500);
    checked += settled.length;

    for (const payment of settled) {
      const [entry] = await db
        .select({ id: journalEntries.id })
        .from(journalEntries)
        .where(
          and(
            eq(journalEntries.organizationId, input.organizationId),
            eq(journalEntries.reference, `payment:${payment.id}`),
          ),
        )
        .limit(1);
      if (!entry) {
        await flag({
          organizationId: input.organizationId,
          paymentId: payment.id,
          type: "missing_ledger_entry",
          severity: "critical",
          description: `Settled payment ${payment.internalReference} has no ledger entry.`,
          expected: { reference: `payment:${payment.id}` },
          actual: { status: payment.status },
        });
      }
    }

    /* 2. Refunds must never exceed the settled amount. */
    const refundRows = await db
      .select({
        paymentId: refunds.paymentId,
        total: sql<number>`coalesce(sum(${refunds.amountMinor}), 0)::bigint`,
        amount: payments.amountMinor,
        reference: payments.internalReference,
        currency: refunds.currency,
        paymentCurrency: payments.currency,
      })
      .from(refunds)
      .innerJoin(payments, eq(payments.id, refunds.paymentId))
      .where(and(eq(refunds.organizationId, input.organizationId), eq(refunds.status, "succeeded")))
      .groupBy(refunds.paymentId, payments.amountMinor, payments.internalReference, refunds.currency, payments.currency);
    checked += refundRows.length;
    for (const row of refundRows) {
      if (Number(row.total) > row.amount) {
        await flag({
          organizationId: input.organizationId,
          paymentId: row.paymentId,
          type: "refund_exceeds_payment",
          severity: "critical",
          description: `Refunds for ${row.reference} exceed the collected amount.`,
          expected: { amountMinor: row.amount },
          actual: { refundedMinor: Number(row.total) },
        });
      }
      if (row.currency !== row.paymentCurrency) {
        await flag({
          organizationId: input.organizationId,
          paymentId: row.paymentId,
          type: "currency_mismatch",
          severity: "critical",
          description: `Refund currency ${row.currency} does not match payment currency ${row.paymentCurrency}.`,
        });
      }
    }

    /* 3. Invoices marked paid should have no outstanding balance. */
    const paidInvoices = await db
      .select({
        id: invoices.id,
        number: invoices.invoiceNumber,
        totalMinor: invoices.totalMinor,
        amountPaidMinor: invoices.amountPaidMinor,
      })
      .from(invoices)
      .where(and(eq(invoices.organizationId, input.organizationId), eq(invoices.status, "paid")))
      .limit(500);
    checked += paidInvoices.length;
    for (const invoice of paidInvoices) {
      if (invoice.amountPaidMinor < invoice.totalMinor) {
        await flag({
          organizationId: input.organizationId,
          type: "invoice_paid_but_outstanding",
          description: `Invoice ${invoice.number} is marked paid but has an outstanding balance.`,
          expected: { amountPaidMinor: invoice.totalMinor },
          actual: { amountPaidMinor: invoice.amountPaidMinor },
        });
      }
    }

    /* 4. Paid orders must reference a settled payment. */
    const paidOrders = await db
      .select({ id: orders.id, paymentId: orders.paymentId, reference: orders.publicReference, totalMinor: orders.totalMinor })
      .from(orders)
      .where(and(eq(orders.organizationId, input.organizationId), sql`${orders.status} in ('paid','fulfilled')`))
      .limit(500);
    checked += paidOrders.length;
    for (const order of paidOrders) {
      if (!order.paymentId) {
        await flag({
          organizationId: input.organizationId,
          type: "paid_order_without_payment",
          severity: "critical",
          description: `Order ${order.reference} is paid but has no linked payment.`,
        });
      }
    }

    /* 5. Payouts stuck in processing indicate an unresolved provider outcome. */
    const stuckPayouts = await db
      .select({ id: payouts.id, reference: payouts.internalReference })
      .from(payouts)
      .where(
        and(
          eq(payouts.organizationId, input.organizationId),
          sql`${payouts.status} in ('approved','processing')`,
          sql`${payouts.createdAt} < now() - interval '2 hours'`,
        ),
      );
    checked += stuckPayouts.length;
    for (const payout of stuckPayouts) {
      await flag({
        organizationId: input.organizationId,
        payoutId: payout.id,
        type: "unresolved_payout",
        severity: "warning",
        description: `Payout ${payout.reference} has not reached a final state. Verify with the provider before retrying.`,
      });
    }

    /* 6. Provider webhook failures need attention. */
    const failedEvents = await db
      .select({ id: webhookEvents.id, eventType: webhookEvents.eventType })
      .from(webhookEvents)
      .where(eq(webhookEvents.status, "failed"))
      .limit(50);
    checked += failedEvents.length;
    for (const event of failedEvents) {
      await flag({
        organizationId: input.organizationId,
        type: "failed_webhook_event",
        severity: "warning",
        description: `Provider event ${event.eventType} (${event.id}) failed processing and needs review.`,
      });
    }

    /* 7. Optionally re-verify in-flight payments with the provider. */
    if (input.verifyInFlight) {
      const inFlight = await db
        .select({ id: payments.id, internalReference: payments.internalReference, provider: payments.provider })
        .from(payments)
        .where(
          and(
            eq(payments.organizationId, input.organizationId),
            sql`${payments.status} in ('pending','processing','created')`,
            sql`${payments.createdAt} > now() - interval '7 days'`,
          ),
        )
        .limit(25);

      for (const payment of inFlight) {
        const provider = providerForName(payment.provider);
        if (!provider.isConfigured()) continue;
        try {
          const result = await provider.verifyPayment(payment.internalReference);
          if (result.status === "succeeded") {
            await verifyAndSettlePayment(payment.internalReference);
            providerVerified += 1;
          }
        } catch (error) {
          await flag({
            organizationId: input.organizationId,
            paymentId: payment.id,
            type: "provider_verification_failed",
            description: `Could not verify ${payment.internalReference} with the provider: ${(error as Error).message}`,
          });
        }
      }
    }

    await db
      .update(reconciliationRuns)
      .set({ status: "completed", checkedCount: checked, exceptionCount, finishedAt: new Date() })
      .where(eq(reconciliationRuns.id, run!.id));

    await audit({
      action: "admin.reconciliation_resolved",
      organizationId: input.organizationId,
      actorId: input.actorId ?? null,
      targetType: "reconciliation_run",
      targetId: run!.id,
      metadata: { checked, exceptionCount, providerVerified },
    });

    return { runId: run!.id, checked, exceptions: exceptionCount, providerVerified };
  } catch (error) {
    await db
      .update(reconciliationRuns)
      .set({ status: "failed", error: (error as Error).message.slice(0, 500), finishedAt: new Date() })
      .where(eq(reconciliationRuns.id, run!.id));
    logger.error("Reconciliation failed", { error: (error as Error).message });
    throw error;
  }
}

export async function resolveException(input: {
  organizationId: string;
  exceptionId: string;
  actorId: string;
  resolution: "resolved" | "ignored";
}): Promise<void> {
  await db
    .update(reconciliationExceptions)
    .set({ status: input.resolution, resolvedBy: input.actorId, resolvedAt: new Date() })
    .where(
      and(
        eq(reconciliationExceptions.id, input.exceptionId),
        eq(reconciliationExceptions.organizationId, input.organizationId),
      ),
    );
  await audit({
    action: "admin.reconciliation_resolved",
    organizationId: input.organizationId,
    actorId: input.actorId,
    targetType: "reconciliation_exception",
    targetId: input.exceptionId,
    metadata: { resolution: input.resolution },
  });
}
