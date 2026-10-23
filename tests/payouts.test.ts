import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { beneficiaries, payouts } from "@/lib/db/schema";
import { ensureSchema, resetDb } from "./helpers/db";
import { makeOrganization, makeUser } from "./helpers/factories";
import { createPaymentLink, startLinkCheckout } from "@/services/payment-links";
import { verifyAndSettlePayment } from "@/services/payments";
import { setMockCheckoutOutcome } from "@/lib/providers/mock";
import {
  approvePayout,
  computePayoutCapacity,
  createBeneficiary,
  initiatePayout,
  reconcilePayoutFromProvider,
  requestPayout,
} from "@/services/payouts";
import { getBalances, verifyLedgerIntegrity } from "@/lib/ledger";

beforeEach(async () => {
  await resetDb();
  await ensureSchema();
});

async function fundOrganization(amountMinor: number) {
  const user = await makeUser({ verified: true });
  const org = await makeOrganization(user);
  const link = await createPaymentLink({
    organizationId: org.id,
    actorId: user.id,
    actorEmail: user.email,
    data: {
      title: "Funding",
      allowVariableAmount: false,
      amountMinor,
      currency: "NGN",
      successUrl: null,
      cancelUrl: null,
      expiresAt: null,
      collectCustomerPhone: false,
    },
  });
  const checkout = await startLinkCheckout({
    reference: link.publicReference,
    amountMinor: null,
    customerEmail: "payer@example.test",
  });
  await setMockCheckoutOutcome(checkout.payment.internalReference, "succeeded");
  await verifyAndSettlePayment(checkout.payment.internalReference);
  return { user, org };
}

async function makeBeneficiary(orgId: string, userId: string, email: string) {
  return createBeneficiary({
    organizationId: orgId,
    actor: { id: userId, email },
    data: { name: "Ada Obi", bankCode: "058", bankName: "GTBank (test)", accountNumber: "0123456789" },
  });
}

describe("beneficiaries", () => {
  it("encrypts account numbers and resolves the account name with the provider", async () => {
    const { user, org } = await fundOrganization(10000);
    const beneficiary = await makeBeneficiary(org.id, user.id, user.email);

    expect(beneficiary.accountNumberLast4).toBe("6789");
    expect(beneficiary.accountNumberEncrypted).not.toContain("0123456789");
    expect(beneficiary.verificationStatus).toBe("verified");
    expect(beneficiary.accountName).toBe("TEST ACCOUNT HOLDER");

    await expect(makeBeneficiary(org.id, user.id, user.email)).rejects.toThrow(/already exists/i);
  });
});

describe("payout safety", () => {
  it("cannot pay out more than settled collections", async () => {
    const { user, org } = await fundOrganization(100000);
    const beneficiary = await makeBeneficiary(org.id, user.id, user.email);

    const capacity = await computePayoutCapacity(org.id, "NGN");
    expect(capacity.availableMinor).toBe(100000);

    await expect(
      requestPayout({
        organizationId: org.id,
        actor: { id: user.id, email: user.email },
        beneficiaryId: beneficiary.id,
        amountMinor: 100001,
        currency: "NGN",
        dailyLimitMinor: 50_000_000,
        approvalThresholdMinor: 10_000_000,
      }),
    ).rejects.toThrow(/settled collections/i);
  });

  it("completes a payout below the approval threshold and books it once", async () => {
    const { user, org } = await fundOrganization(500000);
    const beneficiary = await makeBeneficiary(org.id, user.id, user.email);

    const result = await requestPayout({
      organizationId: org.id,
      actor: { id: user.id, email: user.email },
      beneficiaryId: beneficiary.id,
      amountMinor: 120000,
      currency: "NGN",
      reason: "Contractor payment",
      dailyLimitMinor: 50_000_000,
      approvalThresholdMinor: 10_000_000,
    });

    expect(result.requiresApproval).toBe(false);

    await reconcilePayoutFromProvider(result.payoutId);

    const [payout] = await db.select().from(payouts).where(eq(payouts.id, result.payoutId));
    expect(payout!.status).toBe("succeeded");

    const balances = await getBalances(org.id, "NGN");
    expect(balances.find((b) => b.code === "1000")?.balanceMinor).toBe(380000);
    expect(balances.find((b) => b.code === "3100")?.balanceMinor).toBe(120000);
    expect((await verifyLedgerIntegrity(org.id)).balanced).toBe(true);

    // Confirming twice must not double-book.
    await reconcilePayoutFromProvider(result.payoutId);
    expect((await getBalances(org.id, "NGN")).find((b) => b.code === "1000")?.balanceMinor).toBe(380000);

    // A settled payout is not payable again from the same funds.
    await expect(
      initiatePayout({ payoutId: result.payoutId, organizationId: org.id }),
    ).rejects.toThrow(/cannot be initiated/i);
  });

  it("requires a second approver above the threshold and enforces separation of duties", async () => {
    const { user, org } = await fundOrganization(500000);
    const approver = await makeUser({ verified: true });
    const beneficiary = await makeBeneficiary(org.id, user.id, user.email);

    const result = await requestPayout({
      organizationId: org.id,
      actor: { id: user.id, email: user.email },
      beneficiaryId: beneficiary.id,
      amountMinor: 200000,
      currency: "NGN",
      dailyLimitMinor: 50_000_000,
      approvalThresholdMinor: 100000,
    });

    expect(result.requiresApproval).toBe(true);
    expect(result.status).toBe("pending_approval");

    await expect(
      approvePayout({
        organizationId: org.id,
        payoutId: result.payoutId,
        actor: { id: user.id, email: user.email, role: "owner" },
        decision: "approve",
      }),
    ).rejects.toThrow(/separation of duties/i);

    await approvePayout({
      organizationId: org.id,
      payoutId: result.payoutId,
      actor: { id: approver.id, email: approver.email, role: "admin" },
      decision: "approve",
    });

    await reconcilePayoutFromProvider(result.payoutId);
    const [payout] = await db.select().from(payouts).where(eq(payouts.id, result.payoutId));
    expect(payout!.status).toBe("succeeded");
    expect(payout!.approvedBy).toBe(approver.id);
  });

  it("enforces the daily payout limit", async () => {
    const { user, org } = await fundOrganization(500000);
    const beneficiary = await makeBeneficiary(org.id, user.id, user.email);

    await expect(
      requestPayout({
        organizationId: org.id,
        actor: { id: user.id, email: user.email },
        beneficiaryId: beneficiary.id,
        amountMinor: 200000,
        currency: "NGN",
        dailyLimitMinor: 100000,
        approvalThresholdMinor: 10_000_000,
      }),
    ).rejects.toThrow(/24-hour payout limit/i);
  });

  it("refuses to pay a disabled beneficiary", async () => {
    const { user, org } = await fundOrganization(500000);
    const beneficiary = await makeBeneficiary(org.id, user.id, user.email);
    await db
      .update(beneficiaries)
      .set({ status: "disabled" })
      .where(eq(beneficiaries.id, beneficiary.id));

    await expect(
      requestPayout({
        organizationId: org.id,
        actor: { id: user.id, email: user.email },
        beneficiaryId: beneficiary.id,
        amountMinor: 1000,
        currency: "NGN",
        dailyLimitMinor: 50_000_000,
        approvalThresholdMinor: 10_000_000,
      }),
    ).rejects.toThrow(/disabled/i);
  });
});
