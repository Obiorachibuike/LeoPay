import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { apiKeys, payments } from "@/lib/db/schema";
import { ensureSchema, resetDb } from "./helpers/db";
import { makeOrganization, makeUser } from "./helpers/factories";
import { validateWebhookUrlString } from "@/lib/ssrf";
import { enforceRateLimit, clearRateLimit } from "@/lib/rate-limit";
import { createApiKey } from "@/services/api-keys";
import { authenticateApiKey, requireScope } from "@/services/api-keys";
import { createPaymentLink, startLinkCheckout } from "@/services/payment-links";
import { processProviderWebhook, verifyAndSettlePayment } from "@/services/payments";
import { setMockCheckoutOutcome } from "@/lib/providers/mock";
import { defaultProvider, providerForName } from "@/lib/providers";
import { hmacSignature } from "@/lib/crypto";
import { getBalances, verifyLedgerIntegrity, postEntry } from "@/lib/ledger";
import { transaction } from "@/lib/db/client";

beforeEach(async () => {
  await resetDb();
  await ensureSchema();
});

describe("webhook destination safety", () => {
  it("blocks localhost, private ranges, embedded credentials and non-http schemes", () => {
    expect(validateWebhookUrlString("https://example.com/hook").safe).toBe(true);
    expect(validateWebhookUrlString("http://localhost:3000/hook").safe).toBe(false);
    expect(validateWebhookUrlString("http://127.0.0.1/hook").safe).toBe(false);
    expect(validateWebhookUrlString("http://10.0.0.5/hook").safe).toBe(false);
    expect(validateWebhookUrlString("http://169.254.169.254/latest/meta-data").safe).toBe(false);
    expect(validateWebhookUrlString("http://192.168.1.4/hook").safe).toBe(false);
    expect(validateWebhookUrlString("https://user:pass@example.com/hook").safe).toBe(false);
    expect(validateWebhookUrlString("file:///etc/passwd").safe).toBe(false);
    expect(validateWebhookUrlString("https://[::1]/hook").safe).toBe(false);
  });
});

describe("rate limiting", () => {
  it("blocks after the configured number of attempts in a window", async () => {
    await clearRateLimit("test:bucket");
    for (let index = 0; index < 3; index += 1) {
      await enforceRateLimit({ bucket: "test:bucket", limit: 3, windowSeconds: 60 });
    }
    await expect(enforceRateLimit({ bucket: "test:bucket", limit: 3, windowSeconds: 60 })).rejects.toMatchObject({
      code: "RATE_LIMITED",
      status: 429,
    });
  });
});

describe("API keys", () => {
  it("authenticates a valid key, rejects unknown keys and enforces scopes", async () => {
    const user = await makeUser({ verified: true });
    const org = await makeOrganization(user);
    const created = await createApiKey({
      organizationId: org.id,
      actor: { id: user.id, email: user.email },
      name: "CI key",
      environment: "test",
      scopes: ["payments:read"],
    });

    const [stored] = await db.select().from(apiKeys).where(eq(apiKeys.organizationId, org.id));
    expect(stored?.keyHash).not.toContain(created.key);

    const request = new Request("https://app.test/api/v1/payments", {
      headers: { authorization: `Bearer ${created.key}` },
    });
    const auth = await authenticateApiKey(request);
    expect(auth.organizationId).toBe(org.id);
    expect(auth.scopes).toEqual(["payments:read"]);
    requireScope(auth, "payments:read");
    expect(() => requireScope(auth, "payouts:write")).toThrow();

    await expect(
      authenticateApiKey(new Request("https://app.test/api/v1/payments", { headers: { authorization: "Bearer lp_test_wrong" } })),
    ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await expect(authenticateApiKey(new Request("https://app.test/api/v1/payments"))).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
  });
});

describe("provider webhook settling", () => {
  it("settles only from a verified provider state and ignores replay", async () => {
    const user = await makeUser({ verified: true });
    const org = await makeOrganization(user);
    const link = await createPaymentLink({
      organizationId: org.id,
      actorId: user.id,
      actorEmail: user.email,
      data: {
        title: "Webhook test",
        allowVariableAmount: false,
        amountMinor: 5000,
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
      customerEmail: "webhook@example.test",
    });
    await setMockCheckoutOutcome(checkout.payment.internalReference, "succeeded");

    const first = await processProviderWebhook({
      provider: "mock",
      eventId: "evt_1",
      eventType: "charge.success",
      payload: { event: "charge.success", data: { reference: checkout.payment.internalReference, amount: 999999 } },
    });
    const replay = await processProviderWebhook({
      provider: "mock",
      eventId: "evt_1",
      eventType: "charge.success",
      payload: { event: "charge.success", data: { reference: checkout.payment.internalReference } },
    });

    expect(first.processed).toBe(true);
    expect(replay.duplicate).toBe(true);

    const [payment] = await db.select().from(payments).where(eq(payments.id, checkout.payment.id));
    expect(payment?.status).toBe("succeeded");
    // The payload's amount is ignored: settlement used the provider's own record.
    expect(payment?.amountMinor).toBe(5000);
    expect(await verifyAndSettlePayment(checkout.payment.internalReference).then((o) => o.reason)).toBe("already_settled");
  });
});

describe("mock provider guard", () => {
  it("is the active provider in tests and reports its capabilities", () => {
    const provider = defaultProvider();
    expect(provider.name).toBe("mock");
    expect(provider.capabilities.hostedCheckout).toBe(true);
    // A mock provider must never claim to be production-ready.
    expect(provider.displayName.toLowerCase()).toContain("test");
  });
});

describe("ledger integrity", () => {
  it("rejects unbalanced entries and keeps duplicate references idempotent", async () => {
    const user = await makeUser({ verified: true });
    const org = await makeOrganization(user);

    await expect(
      transaction(async (tx) =>
        postEntry(tx, {
          organizationId: org.id,
          currency: "NGN",
          reference: "test:unbalanced",
          description: "Should fail",
          sourceType: "payment",
          postings: [
            { code: "1000", direction: "debit", amountMinor: 500 },
            { code: "4000", direction: "credit", amountMinor: 400 },
          ],
        }),
      ),
    ).rejects.toMatchObject({ code: "UNSAFE_OPERATION" });

    const first = await transaction(async (tx) =>
      postEntry(tx, {
        organizationId: org.id,
        currency: "NGN",
        reference: "test:balanced",
        description: "Balanced",
        sourceType: "payment",
        postings: [
          { code: "1000", direction: "debit", amountMinor: 500 },
          { code: "4000", direction: "credit", amountMinor: 500 },
        ],
      }),
    );
    const second = await transaction(async (tx) =>
      postEntry(tx, {
        organizationId: org.id,
        currency: "NGN",
        reference: "test:balanced",
        description: "Retry",
        sourceType: "payment",
        postings: [
          { code: "1000", direction: "debit", amountMinor: 500 },
          { code: "4000", direction: "credit", amountMinor: 500 },
        ],
      }),
    );

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect((await verifyLedgerIntegrity(org.id)).balanced).toBe(true);
    const balances = await getBalances(org.id, "NGN");
    expect(balances.find((b) => b.code === "1000")?.balanceMinor).toBe(500);
  });
});

describe("provider webhook signatures", () => {
  it("rejects any signature when no provider secret is configured", () => {
    const body = JSON.stringify({ event: "charge.success", data: { reference: "x" } });
    const headers = new Headers({ "x-paystack-signature": hmacSignature(randomBytes(16).toString("hex"), 0, body) });
    const paystack = providerForName("paystack");
    // Without PAYSTACK_SECRET_KEY the adapter must fail closed rather than
    // accept an unverifiable payload.
    expect(paystack.verifyWebhook(body, headers).valid).toBe(false);
    expect(paystack.verifyWebhook(body, new Headers()).valid).toBe(false);
  });
});
