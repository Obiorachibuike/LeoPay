/**
 * Mock payment provider.
 *
 * Development and test only. It exists so the complete checkout, webhook,
 * reconciliation and ledger flows can be exercised end-to-end without live
 * credentials. The adapter refuses to operate in production unless
 * ALLOW_MOCK_PAYMENTS=true is explicitly set (e.g. an isolated demo), and every
 * record it creates is tagged `provider = "mock"`.
 */
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { mockCheckoutSessions } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { hmacSignature, safeEqual } from "@/lib/crypto";
import type {
  Bank,
  InitializePaymentInput,
  InitializePaymentResult,
  PaymentProvider,
  PayoutInput,
  PayoutResult,
  ProviderCapabilities,
  RefundInput,
  RefundResult,
  ResolveAccountInput,
  ResolveAccountResult,
  VerifyPaymentResult,
} from "./types";

function assertAllowed() {
  if (env.isProduction && process.env.ALLOW_MOCK_PAYMENTS !== "true") {
    throw new AppError(
      "PROVIDER_NOT_CONFIGURED",
      "Mock payments are disabled in production. Configure a live payment provider.",
    );
  }
}

/** Called by the mock checkout page to record the simulated outcome. */
export async function setMockCheckoutOutcome(
  reference: string,
  status: "succeeded" | "failed" | "abandoned",
): Promise<void> {
  assertAllowed();
  const updated = await db
    .update(mockCheckoutSessions)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(mockCheckoutSessions.reference, reference), eq(mockCheckoutSessions.status, "pending")))
    .returning({ id: mockCheckoutSessions.id });
  if (!updated.length) {
    throw new AppError("CONFLICT", "This test checkout has already been completed or does not exist");
  }
}

export class MockPaymentProvider implements PaymentProvider {
  readonly name = "mock" as const;
  readonly displayName = "LeoPay Test Payments";
  readonly capabilities: ProviderCapabilities = {
    hostedCheckout: true,
    refunds: true,
    payouts: true,
    accountResolution: true,
    webhooks: true,
    channels: ["card", "bank_transfer", "ussd"],
  };

  isConfigured(): boolean {
    return !env.isProduction || process.env.ALLOW_MOCK_PAYMENTS === "true";
  }

  async initializePayment(input: InitializePaymentInput): Promise<InitializePaymentResult> {
    assertAllowed();
    await db
      .insert(mockCheckoutSessions)
      .values({
        reference: input.reference,
        amountMinor: input.amountMinor,
        currency: input.currency,
        email: input.email,
      })
      .onConflictDoNothing();
    return {
      providerReference: input.reference,
      authorizationUrl: `/checkout/test/${encodeURIComponent(input.reference)}`,
    };
  }

  async verifyPayment(reference: string): Promise<VerifyPaymentResult> {
    assertAllowed();
    const [row] = await db
      .select()
      .from(mockCheckoutSessions)
      .where(eq(mockCheckoutSessions.reference, reference))
      .limit(1);
    if (!row) {
      return {
        providerReference: reference,
        status: "failed",
        amountMinor: 0,
        currency: "NGN",
        failureCode: "not_found",
        failureMessage: "Test checkout not found",
      };
    }
    return {
      providerReference: reference,
      status:
        row.status === "succeeded"
          ? "succeeded"
          : row.status === "failed"
            ? "failed"
            : row.status === "abandoned"
              ? "cancelled"
              : "pending",
      amountMinor: row.amountMinor,
      currency: row.currency,
      channel: "test",
      feeMinor: 0,
      paidAt: row.status === "succeeded" ? row.updatedAt : null,
      failureCode: row.status === "failed" ? "test_declined" : null,
      failureMessage: row.status === "failed" ? "Test payment was declined by the customer" : null,
      raw: { simulated: true, status: row.status },
    };
  }

  async createRefund(input: RefundInput): Promise<RefundResult> {
    assertAllowed();
    return { status: "succeeded", providerReference: `mock_refund_${input.providerReference}` };
  }

  async listBanks(): Promise<Bank[]> {
    return [
      { code: "058", name: "Guaranty Trust Bank (test)" },
      { code: "044", name: "Access Bank (test)" },
      { code: "011", name: "First Bank of Nigeria (test)" },
      { code: "057", name: "Zenith Bank (test)" },
      { code: "999992", name: "OPay Digital Services (test)" },
    ];
  }

  async resolveAccount(input: ResolveAccountInput): Promise<ResolveAccountResult> {
    assertAllowed();
    return { accountName: "TEST ACCOUNT HOLDER", accountNumber: input.accountNumber };
  }

  async createPayout(input: PayoutInput): Promise<PayoutResult> {
    assertAllowed();
    return { providerReference: `mock_transfer_${input.reference}`, status: "processing" };
  }

  async verifyPayout(reference: string): Promise<PayoutResult> {
    assertAllowed();
    return { providerReference: reference, status: "succeeded" };
  }

  verifyWebhook(rawBody: string, headers: Headers) {
    const secret = env.authSecret || "mock-webhook-secret";
    const timestamp = Number(headers.get("x-leopay-timestamp"));
    const signature = headers.get("x-leopay-signature") ?? "";
    if (!signature) return { valid: false, reason: "missing signature" };
    const expected = hmacSignature(secret, timestamp, rawBody);
    return safeEqual(expected, signature) ? { valid: true } : { valid: false, reason: "signature mismatch" };
  }
}
