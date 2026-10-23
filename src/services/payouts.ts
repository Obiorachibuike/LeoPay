/**
 * Payouts: beneficiary management, approval workflow and provider settlement.
 *
 * Money movement is deliberately conservative:
 * - requests are checked against a ledger-derived clearing balance (an estimate
 *   of verified, unsettled funds — never presented as a provider-confirmed
 *   withdrawable balance);
 * - amounts above the organization threshold require a separate approver;
 * - an uncertain provider outcome is never retried automatically; it becomes a
 *   reconciliation exception until verified.
 */
import { and, desc, eq, sql } from "drizzle-orm";
import { db, transaction } from "@/lib/db/client";
import {
  beneficiaries,
  payoutEvents,
  payouts,
  type Beneficiary,
} from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { decryptField, encryptField } from "@/lib/crypto";
import { internalReference } from "@/lib/ids";
import { formatMoney } from "@/lib/money";
import { defaultProvider, providerForName } from "@/lib/providers";
import { getBalances, payoutPostings, postEntry } from "@/lib/ledger";
import { enqueueMerchantEvent } from "@/services/jobs";
import { queueEmail } from "@/services/notifications";
import { audit } from "@/lib/audit";
import { logger } from "@/lib/logger";

async function provider() {
  const p = defaultProvider();
  if (!p.isConfigured()) {
    throw new AppError("PROVIDER_NOT_CONFIGURED", "Payouts are unavailable: no payment provider is configured.");
  }
  if (!p.capabilities.payouts) {
    throw new AppError("UNSUPPORTED", "The configured payment provider does not support payouts.");
  }
  return p;
}

/** Creates a beneficiary, resolving the account name with the provider. */
export async function createBeneficiary(input: {
  organizationId: string;
  actor: { id: string; email: string };
  data: { name: string; bankCode: string; bankName: string; accountNumber: string };
}): Promise<Beneficiary> {
  const p = await provider();
  if (!p.capabilities.accountResolution) {
    throw new AppError("UNSUPPORTED", "Account name resolution is not supported by the configured provider.");
  }

  let accountName: string;
  try {
    const resolved = await p.resolveAccount({
      accountNumber: input.data.accountNumber,
      bankCode: input.data.bankCode,
    });
    accountName = resolved.accountName;
  } catch (error) {
    throw new AppError(
      "PROVIDER_ERROR",
      error instanceof AppError ? error.message : "We could not verify that bank account. Check the details and try again.",
    );
  }

  const last4 = input.data.accountNumber.slice(-4);
  const [existing] = await db
    .select()
    .from(beneficiaries)
    .where(
      and(
        eq(beneficiaries.organizationId, input.organizationId),
        eq(beneficiaries.bankCode, input.data.bankCode),
        eq(beneficiaries.accountNumberLast4, last4),
        eq(beneficiaries.accountName, accountName),
      ),
    )
    .limit(1);
  if (existing) {
    throw new AppError("CONFLICT", "This beneficiary already exists");
  }

  const [created] = await db
    .insert(beneficiaries)
    .values({
      organizationId: input.organizationId,
      name: input.data.name,
      bankCode: input.data.bankCode,
      bankName: input.data.bankName,
      accountNumberEncrypted: encryptField(input.data.accountNumber),
      accountNumberLast4: last4,
      accountName,
      verificationStatus: "verified",
      createdBy: input.actor.id,
    })
    .returning();

  await audit({
    action: "beneficiary.created",
    organizationId: input.organizationId,
    actorId: input.actor.id,
    actorEmail: input.actor.email,
    targetType: "beneficiary",
    targetId: created!.id,
    metadata: { bankCode: created!.bankCode, last4 },
  });

  return created!;
}

export async function listBeneficiaries(organizationId: string): Promise<Beneficiary[]> {
  return db
    .select()
    .from(beneficiaries)
    .where(and(eq(beneficiaries.organizationId, organizationId), eq(beneficiaries.status, "active")))
    .orderBy(desc(beneficiaries.createdAt));
}

export function maskedAccount(beneficiary: Beneficiary): string {
  return `•••• ${beneficiary.accountNumberLast4}`;
}

/**
 * Ledger-derived funds available for payout. This is LeoPay's estimate of
 * settled collections minus refunds and payouts; it is NOT a provider balance
 * and can differ from the provider's settlement timing.
 */
export async function computePayoutCapacity(organizationId: string, currency: string) {
  const balances = await getBalances(organizationId, currency);
  const clearing = balances.find((b) => b.code === "1000")?.balanceMinor ?? 0;
  const pendingPayouts = await db
    .select({ total: sql<number>`coalesce(sum(${payouts.amountMinor}), 0)::bigint` })
    .from(payouts)
    .where(
      and(
        eq(payouts.organizationId, organizationId),
        sql`${payouts.status} in ('approved','processing')`,
      ),
    );
  const reserved = Number(pendingPayouts[0]?.total ?? 0);
  return {
    ledgerClearingMinor: clearing,
    pendingPayoutsMinor: reserved,
    availableMinor: Math.max(0, clearing - reserved),
  };
}

async function dailyPayoutTotal(organizationId: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${payouts.amountMinor}), 0)::bigint` })
    .from(payouts)
    .where(
      and(
        eq(payouts.organizationId, organizationId),
        sql`${payouts.status} <> 'failed'`,
        sql`${payouts.createdAt} > now() - interval '24 hours'`,
      ),
    );
  return Number(row?.total ?? 0);
}

export async function requestPayout(input: {
  organizationId: string;
  actor: { id: string; email: string };
  beneficiaryId: string;
  amountMinor: number;
  currency: string;
  reason?: string;
  idempotencyKey?: string;
  dailyLimitMinor: number;
  approvalThresholdMinor: number;
}): Promise<{ payoutId: string; status: string; requiresApproval: boolean }> {
  const p = await provider();

  const [beneficiary] = await db
    .select()
    .from(beneficiaries)
    .where(and(eq(beneficiaries.id, input.beneficiaryId), eq(beneficiaries.organizationId, input.organizationId)))
    .limit(1);
  if (!beneficiary) throw new AppError("NOT_FOUND", "Beneficiary not found");
  if (beneficiary.status !== "active") throw new AppError("CONFLICT", "This beneficiary is disabled");
  if (beneficiary.verificationStatus !== "verified") {
    throw new AppError("CONFLICT", "Verify the beneficiary bank account before sending a payout");
  }

  if (input.amountMinor <= 0) throw new AppError("VALIDATION_ERROR", "Enter a payout amount");

  const capacity = await computePayoutCapacity(input.organizationId, input.currency);
  if (input.amountMinor > capacity.availableMinor) {
    throw new AppError(
      "CONFLICT",
      `Payout exceeds the amount available from settled collections (${formatMoney(capacity.availableMinor, input.currency)}).`,
    );
  }

  const paidToday = await dailyPayoutTotal(input.organizationId);
  if (paidToday + input.amountMinor > input.dailyLimitMinor) {
    throw new AppError(
      "CONFLICT",
      `This payout would exceed your 24-hour payout limit of ${formatMoney(input.dailyLimitMinor, input.currency)}.`,
    );
  }

  if (input.idempotencyKey) {
    const [existing] = await db
      .select()
      .from(payouts)
      .where(and(eq(payouts.organizationId, input.organizationId), eq(payouts.idempotencyKey, input.idempotencyKey)))
      .limit(1);
    if (existing) {
      return {
        payoutId: existing.id,
        status: existing.status,
        requiresApproval: existing.status === "pending_approval",
      };
    }
  }

  const requiresApproval = input.amountMinor >= input.approvalThresholdMinor;
  const reference = internalReference("pyt");

  const [payout] = await db
    .insert(payouts)
    .values({
      organizationId: input.organizationId,
      beneficiaryId: beneficiary.id,
      internalReference: reference,
      provider: p.name,
      amountMinor: input.amountMinor,
      currency: input.currency,
      status: requiresApproval ? "pending_approval" : "approved",
      reason: input.reason ?? null,
      requestedBy: input.actor.id,
      idempotencyKey: input.idempotencyKey ?? null,
    })
    .returning();

  await db.insert(payoutEvents).values({
    payoutId: payout!.id,
    type: requiresApproval ? "requested_pending_approval" : "approved",
    message: requiresApproval
      ? `Amount is at or above the approval threshold of ${formatMoney(input.approvalThresholdMinor, input.currency)}`
      : "Below approval threshold",
    actorId: input.actor.id,
  });

  await audit({
    action: "payout.requested",
    organizationId: input.organizationId,
    actorId: input.actor.id,
    actorEmail: input.actor.email,
    targetType: "payout",
    targetId: payout!.id,
    metadata: { amountMinor: input.amountMinor, currency: input.currency, requiresApproval },
  });

  if (!requiresApproval) {
    await initiatePayout({ payoutId: payout!.id, organizationId: input.organizationId });
  }

  return {
    payoutId: payout!.id,
    status: requiresApproval ? "pending_approval" : "processing",
    requiresApproval,
  };
}

/** Calls the provider for an approved payout. Never retried automatically. */
export async function initiatePayout(input: { payoutId: string; organizationId: string }): Promise<void> {
  const p = await provider();
  const [payout] = await db
    .select()
    .from(payouts)
    .where(and(eq(payouts.id, input.payoutId), eq(payouts.organizationId, input.organizationId)))
    .limit(1);
  if (!payout) throw new AppError("NOT_FOUND", "Payout not found");
  if (payout.status !== "approved") {
    throw new AppError("CONFLICT", `Payout cannot be initiated from status ${payout.status}`);
  }

  const [beneficiary] = await db.select().from(beneficiaries).where(eq(beneficiaries.id, payout.beneficiaryId)).limit(1);
  if (!beneficiary) throw new AppError("NOT_FOUND", "Beneficiary not found");

  await db
    .update(payouts)
    .set({ status: "processing" })
    .where(and(eq(payouts.id, payout.id), eq(payouts.status, "approved")));
  await db.insert(payoutEvents).values({
    payoutId: payout.id,
    type: "provider_request_sent",
    message: "Transfer submitted to payment provider",
  });

  try {
    const result = await p.createPayout({
      reference: payout.internalReference,
      amountMinor: payout.amountMinor,
      currency: payout.currency,
      beneficiary: {
        name: beneficiary.accountName,
        accountNumber: decryptField(beneficiary.accountNumberEncrypted),
        bankCode: beneficiary.bankCode,
        providerRecipientReference: beneficiary.providerRecipientReference,
      },
      reason: payout.reason ?? undefined,
      idempotencyKey: payout.internalReference,
    });

    await db
      .update(payouts)
      .set({ providerReference: result.providerReference, processedAt: new Date() })
      .where(eq(payouts.id, payout.id));

    if (result.recipientReference && !beneficiary.providerRecipientReference) {
      await db
        .update(beneficiaries)
        .set({ providerRecipientReference: result.recipientReference })
        .where(eq(beneficiaries.id, beneficiary.id));
    }

    if (result.status === "succeeded") {
      await finalizePayoutSuccess(payout.id);
    } else if (result.status === "failed") {
      await finalizePayoutFailure(payout.id, result.failureMessage ?? "Provider rejected the transfer");
    } else {
      await db.insert(payoutEvents).values({
        payoutId: payout.id,
        type: "provider_processing",
        message: "Provider is processing the transfer",
      });
      await audit({
        action: "payout.initiated",
        organizationId: payout.organizationId,
        targetType: "payout",
        targetId: payout.id,
        metadata: { amountMinor: payout.amountMinor, currency: payout.currency },
      });
    }
  } catch (error) {
    // The provider may or may not have accepted the transfer. Do not retry:
    // flag for human verification through reconciliation.
    const message = (error as Error).message.slice(0, 300);
    logger.error("Payout provider call failed", { payoutId: payout.id, error: message });
    await db
      .update(payouts)
      .set({
        status: "processing",
        failureCode: "provider_outcome_unknown",
        failureMessage: `Provider outcome uncertain: ${message}`,
      })
      .where(eq(payouts.id, payout.id));
    await db.insert(payoutEvents).values({
      payoutId: payout.id,
      type: "provider_outcome_unknown",
      message: "Transfer outcome could not be confirmed. Verify with the provider before retrying.",
    });
    const { recordReconciliationException } = await import("@/services/reconciliation");
    await recordReconciliationException({
      organizationId: payout.organizationId,
      payoutId: payout.id,
      type: "unresolved_payout",
      severity: "critical",
      description: `Payout ${payout.internalReference} could not be confirmed with the provider. Verify before retrying.`,
    });
    throw new AppError(
      "PROVIDER_ERROR",
      "We could not confirm the transfer with the payment provider. The payout is on hold pending verification — do not resubmit it.",
    );
  }
}

export async function approvePayout(input: {
  organizationId: string;
  payoutId: string;
  actor: { id: string; email: string; role: string };
  decision: "approve" | "reject";
  note?: string;
}): Promise<void> {
  const [payout] = await db
    .select()
    .from(payouts)
    .where(and(eq(payouts.id, input.payoutId), eq(payouts.organizationId, input.organizationId)))
    .limit(1);
  if (!payout) throw new AppError("NOT_FOUND", "Payout not found");
  if (payout.status !== "pending_approval") {
    throw new AppError("CONFLICT", "This payout is not awaiting approval");
  }
  if (payout.requestedBy === input.actor.id) {
    throw new AppError("FORBIDDEN", "Separation of duties: the requester cannot approve their own payout");
  }

  if (input.decision === "reject") {
    await db
      .update(payouts)
      .set({ status: "failed", failureCode: "rejected", failureMessage: input.note ?? "Rejected by approver" })
      .where(eq(payouts.id, payout.id));
    await db.insert(payoutEvents).values({
      payoutId: payout.id,
      type: "rejected",
      message: input.note ?? "Rejected by approver",
      actorId: input.actor.id,
    });
    await audit({
      action: "payout.rejected",
      organizationId: input.organizationId,
      actorId: input.actor.id,
      actorEmail: input.actor.email,
      targetType: "payout",
      targetId: payout.id,
    });
    return;
  }

  await db
    .update(payouts)
    .set({ status: "approved", approvedBy: input.actor.id, approvedAt: new Date() })
    .where(and(eq(payouts.id, payout.id), eq(payouts.status, "pending_approval")));
  await db.insert(payoutEvents).values({
    payoutId: payout.id,
    type: "approved",
    message: input.note ?? "Approved",
    actorId: input.actor.id,
  });
  await audit({
    action: "payout.approved",
    organizationId: input.organizationId,
    actorId: input.actor.id,
    actorEmail: input.actor.email,
    targetType: "payout",
    targetId: payout.id,
    metadata: { amountMinor: payout.amountMinor },
  });

  await initiatePayout({ payoutId: payout.id, organizationId: input.organizationId });
}

async function finalizePayoutSuccess(payoutId: string): Promise<void> {
  const result = await transaction(async (tx) => {
    await tx.execute(sql`select id from payouts where id = ${payoutId} for update`);
    const [payout] = await tx.select().from(payouts).where(eq(payouts.id, payoutId)).limit(1);
    if (!payout) return null;
    if (payout.status === "succeeded") return payout;

    const [updated] = await tx
      .update(payouts)
      .set({ status: "succeeded", processedAt: new Date() })
      .where(eq(payouts.id, payout.id))
      .returning();

    await postEntry(tx, {
      organizationId: payout.organizationId,
      currency: payout.currency,
      reference: `payout:${payout.id}`,
      description: `Payout ${payout.internalReference} settled`,
      sourceType: "payout",
      sourceId: payout.id,
      postings: payoutPostings(payout.amountMinor),
    });

    await enqueueMerchantEvent(tx, {
      organizationId: payout.organizationId,
      type: "payout.succeeded",
      data: {
        id: payout.id,
        reference: payout.internalReference,
        amount: payout.amountMinor,
        currency: payout.currency,
        status: "succeeded",
      },
    });

    await tx.insert(payoutEvents).values({ payoutId: payout.id, type: "succeeded", message: "Transfer completed" });
    return updated ?? payout;
  });

  if (!result) return;

  await audit({
    action: "payout.initiated",
    organizationId: result.organizationId,
    targetType: "payout",
    targetId: result.id,
    metadata: { status: "succeeded", amountMinor: result.amountMinor },
  });

  await queueEmail({
    to: "finance@leopay.local",
    template: "payout_update",
    organizationId: result.organizationId,
    data: {
      status: "succeeded",
      amount: formatMoney(result.amountMinor, result.currency),
      beneficiary: result.internalReference,
      reference: result.internalReference,
    },
  }).catch(() => undefined);
}

async function finalizePayoutFailure(payoutId: string, message: string): Promise<void> {
  const [payout] = await db.select().from(payouts).where(eq(payouts.id, payoutId)).limit(1);
  if (!payout) return;
  await db
    .update(payouts)
    .set({ status: "failed", failureCode: "provider_failed", failureMessage: message.slice(0, 300) })
    .where(eq(payouts.id, payoutId));
  await db.insert(payoutEvents).values({ payoutId, type: "failed", message });
  await enqueueMerchantEvent(db, {
    organizationId: payout.organizationId,
    type: "payout.failed",
    data: {
      id: payout.id,
      reference: payout.internalReference,
      amount: payout.amountMinor,
      currency: payout.currency,
      status: "failed",
    },
  });
  await audit({
    action: "payout.failed",
    organizationId: payout.organizationId,
    targetType: "payout",
    targetId: payout.id,
    metadata: { message },
  });
}

/** Resolves a payout using the provider's authoritative transfer status. */
export async function reconcilePayoutFromProvider(reference: string): Promise<void> {
  if (!reference) return;
  const [payout] = await db
    .select()
    .from(payouts)
    .where(
      sql`${payouts.internalReference} = ${reference} or ${payouts.providerReference} = ${reference} or ${payouts.id}::text = ${reference}`,
    )
    .limit(1);
  if (!payout) return;
  if (payout.status === "succeeded" || payout.status === "failed") return;

  const p = providerForName(payout.provider);
  if (!p.isConfigured()) return;

  const result = await p.verifyPayout(payout.providerReference ?? payout.internalReference);
  if (result.status === "succeeded") {
    await finalizePayoutSuccess(payout.id);
  } else if (result.status === "failed") {
    await finalizePayoutFailure(payout.id, result.failureMessage ?? "Provider reported the transfer failed");
  }
}

export async function listPayouts(organizationId: string, options: { page: number; pageSize: number }) {
  return db
    .select({ payout: payouts, beneficiaryName: beneficiaries.name })
    .from(payouts)
    .innerJoin(beneficiaries, eq(beneficiaries.id, payouts.beneficiaryId))
    .where(eq(payouts.organizationId, organizationId))
    .orderBy(desc(payouts.createdAt))
    .limit(options.pageSize)
    .offset((options.page - 1) * options.pageSize);
}

export async function getPayoutDetail(organizationId: string, payoutId: string) {
  const [row] = await db
    .select({ payout: payouts, beneficiary: beneficiaries })
    .from(payouts)
    .innerJoin(beneficiaries, eq(beneficiaries.id, payouts.beneficiaryId))
    .where(and(eq(payouts.id, payoutId), eq(payouts.organizationId, organizationId)))
    .limit(1);
  if (!row) return null;
  const events = await db
    .select()
    .from(payoutEvents)
    .where(eq(payoutEvents.payoutId, payoutId))
    .orderBy(desc(payoutEvents.createdAt));
  return { ...row, events };
}
