/**
 * Contract tests for the Paystack adapter.
 *
 * The adapter talks to `https://api.paystack.co`, which is not reachable from
 * CI and would need live credentials anyway. These tests replay recorded
 * request/response shapes (captured from Paystack's documented API) through a
 * stubbed `fetch`, so every request we send and every field we read is
 * exercised without any network access or secrets.
 *
 * See docs/TESTING.md for how to refresh the fixtures against a sandbox
 * account. A green run proves we match the recorded contract; it does not
 * prove the sandbox account is funded or that the recorded responses are
 * still current — see docs/LIMITATIONS.md.
 */
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PaystackProvider } from "@/lib/providers/paystack";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";

type RecordedCall = { url: string; method: string; headers: Record<string, string>; body: unknown };

const FIXTURES = path.join(process.cwd(), "tests", "fixtures", "paystack");

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(path.join(FIXTURES, `${name}.json`), "utf8"));
}

/** Queue of responses the stubbed fetch will hand back, in order. */
let queue: Array<{ status?: number; body: unknown; raw?: string }> = [];
let calls: RecordedCall[] = [];
let originalSecret: string;

function respondWith(name: string, status = 200) {
  queue.push({ status, body: fixture(name) });
}

beforeEach(() => {
  originalSecret = env.paystackSecretKey;
  // Generated at runtime: no credential-shaped literal lives in the repo.
  env.paystackSecretKey = `sk_test_${createHmac("sha256", "leopay-tests").update(String(Date.now())).digest("hex").slice(0, 24)}`;
  queue = [];
  calls = [];
  vi.stubGlobal("fetch", async (input: string | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    calls.push({
      url,
      method: init?.method ?? "GET",
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    const next = queue.shift();
    if (!next) throw new Error(`Unexpected Paystack request: ${url}`);
    const text = next.raw ?? JSON.stringify(next.body);
    return new Response(text, {
      status: next.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  });
});

afterEach(() => {
  env.paystackSecretKey = originalSecret;
  vi.unstubAllGlobals();
  queue = [];
  calls = [];
});

describe("Paystack adapter contract: checkout initialisation", () => {
  it("posts amount, currency, reference and callback to /transaction/initialize", async () => {
    respondWith("initialize");
    const provider = new PaystackProvider();

    const result = await provider.initializePayment({
      reference: "LPPAY_0001",
      amountMinor: 500000,
      currency: "NGN",
      email: "buyer@example.test",
      callbackUrl: "https://leopay.example.test/pay/return",
      channels: ["card", "bank_transfer"],
      metadata: { organizationId: "org_1" },
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://api.paystack.co/transaction/initialize");
    expect(calls[0]!.method).toBe("POST");
    expect(calls[0]!.headers.authorization).toBe(`Bearer ${env.paystackSecretKey}`);
    expect(calls[0]!.headers["content-type"]).toBe("application/json");
    expect(calls[0]!.body).toMatchObject({
      email: "buyer@example.test",
      amount: 500000,
      currency: "NGN",
      reference: "LPPAY_0001",
      callback_url: "https://leopay.example.test/pay/return",
      channels: ["card", "bank_transfer"],
      metadata: { organizationId: "org_1" },
    });

    expect(result).toEqual({
      providerReference: "LPPAY_0001",
      authorizationUrl: "https://checkout.paystack.com/example-access-code",
      accessCode: "example_access_code",
    });
  });

  it("refuses currencies Paystack cannot settle for us before calling the API", async () => {
    const provider = new PaystackProvider();
    await expect(
      provider.initializePayment({
        reference: "LPPAY_0009",
        amountMinor: 1000,
        currency: "EUR",
        email: "buyer@example.test",
        callbackUrl: "https://leopay.example.test/pay/return",
      }),
    ).rejects.toMatchObject({ code: "PAYMENT_ERROR" });
    expect(calls).toHaveLength(0);
  });

  it("fails closed when no secret key is configured", async () => {
    env.paystackSecretKey = "";
    const provider = new PaystackProvider();
    expect(provider.isConfigured()).toBe(false);
    await expect(provider.verifyPayment("LPPAY_0001")).rejects.toMatchObject({
      code: "PROVIDER_NOT_CONFIGURED",
    });
    expect(calls).toHaveLength(0);
  });
});

describe("Paystack adapter contract: verification mapping", () => {
  it("maps a successful charge with amount, currency, channel and fees", async () => {
    respondWith("verify-success");
    const provider = new PaystackProvider();

    const result = await provider.verifyPayment("LPPAY_0001");

    expect(calls[0]!.url).toBe("https://api.paystack.co/transaction/verify/LPPAY_0001");
    expect(calls[0]!.method).toBe("GET");
    expect(result.status).toBe("succeeded");
    expect(result.amountMinor).toBe(500000);
    expect(result.currency).toBe("NGN");
    expect(result.channel).toBe("card");
    expect(result.feeMinor).toBe(7500);
    expect(result.paidAt?.toISOString()).toBe("2026-02-11T09:31:07.000Z");
    expect(result.failureCode).toBeNull();
    expect(result.raw).toMatchObject({ status: "success", channel: "card" });
  });

  it("maps an abandoned charge to cancelled and keeps the gateway reason", async () => {
    respondWith("verify-abandoned");
    const result = await new PaystackProvider().verifyPayment("LPPAY_0002");
    expect(result.status).toBe("cancelled");
    expect(result.paidAt).toBeNull();
    expect(result.feeMinor).toBe(0);
    expect(result.failureCode).toBe("abandoned");
    expect(result.failureMessage).toBe("The transaction was not completed");
  });

  it("maps a reversed charge to failed, never to succeeded", async () => {
    respondWith("verify-reversed");
    const result = await new PaystackProvider().verifyPayment("LPPAY_0003");
    expect(result.status).toBe("failed");
    expect(result.failureMessage).toBe("Reversed by bank");
  });

  it("maps an ongoing charge to processing, not succeeded", async () => {
    respondWith("verify-ongoing");
    const result = await new PaystackProvider().verifyPayment("LPPAY_0004");
    expect(result.status).toBe("processing");
    expect(result.failureCode).toBe("ongoing");
  });

  it("surfaces a provider error envelope as PROVIDER_ERROR with the provider message", async () => {
    respondWith("error-declined", 400);
    await expect(new PaystackProvider().verifyPayment("LPPAY_0404")).rejects.toMatchObject({
      code: "PROVIDER_ERROR",
      message: "Transaction reference not found",
    });
  });

  it("URL-encodes the reference so a hostile reference cannot change the path", async () => {
    respondWith("verify-success");
    await new PaystackProvider().verifyPayment("../../transfer");
    expect(calls[0]!.url).toBe("https://api.paystack.co/transaction/verify/..%2F..%2Ftransfer");
  });
});

describe("Paystack adapter contract: refunds, banks and account resolution", () => {
  it("queues a partial refund with the transaction reference and amount", async () => {
    respondWith("refund");
    const result = await new PaystackProvider().createRefund({
      providerReference: "LPPAY_0001",
      amountMinor: 125000,
      reason: "Customer requested a partial refund",
    });

    expect(calls[0]!.url).toBe("https://api.paystack.co/refund");
    expect(calls[0]!.body).toMatchObject({
      transaction: "LPPAY_0001",
      amount: 125000,
      merchant_note: "Customer requested a partial refund",
    });
    expect(result.status).toBe("pending");
    expect(result.providerReference).toBe("8712093");
  });

  it("lists NGN banks for the payout form", async () => {
    respondWith("banks");
    const banks = await new PaystackProvider().listBanks();
    expect(calls[0]!.url).toBe("https://api.paystack.co/bank?currency=NGN&country=nigeria");
    expect(banks).toEqual([
      { code: "058", name: "Guaranty Trust Bank" },
      { code: "044", name: "Access Bank" },
    ]);
  });

  it("resolves an account name and echoes the account number", async () => {
    respondWith("resolve-account");
    const resolved = await new PaystackProvider().resolveAccount({
      accountNumber: "0123456789",
      bankCode: "058",
    });
    expect(calls[0]!.url).toBe(
      "https://api.paystack.co/bank/resolve?account_number=0123456789&bank_code=058",
    );
    expect(resolved).toEqual({ accountName: "ADA LOVELACE", accountNumber: "0123456789" });
  });
});

describe("Paystack adapter contract: payouts", () => {
  it("creates a NUBAN recipient then a transfer, reusing the recipient afterwards", async () => {
    respondWith("transfer-recipient");
    respondWith("transfer");
    const provider = new PaystackProvider();
    const input = {
      reference: "LPPO_0001",
      amountMinor: 250000,
      currency: "NGN",
      beneficiary: { name: "Ada Lovelace", accountNumber: "0123456789", bankCode: "058" },
      reason: "Payout for invoice INV-1",
    };

    const result = await provider.createPayout(input);

    expect(calls.map((c) => c.url)).toEqual([
      "https://api.paystack.co/transferrecipient",
      "https://api.paystack.co/transfer",
    ]);
    expect(calls[0]!.body).toMatchObject({
      type: "nuban",
      name: "Ada Lovelace",
      account_number: "0123456789",
      bank_code: "058",
      currency: "NGN",
    });
    expect(calls[1]!.body).toMatchObject({
      source: "balance",
      amount: 250000,
      recipient: "RCP_example0001",
      reference: "LPPO_0001",
      currency: "NGN",
    });
    // A queued transfer is "processing": the service must reconcile it later,
    // never treat it as settled money.
    expect(result).toEqual({
      providerReference: "LPPO_0001",
      status: "processing",
      recipientReference: "RCP_example0001",
    });
  });

  it("skips recipient creation when the beneficiary is already registered", async () => {
    respondWith("transfer");
    const provider = new PaystackProvider();
    await provider.createPayout({
      reference: "LPPO_0003",
      amountMinor: 1000,
      currency: "NGN",
      beneficiary: {
        name: "Ada Lovelace",
        accountNumber: "0123456789",
        bankCode: "058",
        providerRecipientReference: "RCP_existing",
      },
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://api.paystack.co/transfer");
    expect(calls[0]!.body).toMatchObject({ recipient: "RCP_existing" });
  });

  it("reports a failed transfer with the failure reason", async () => {
    respondWith("transfer-verify-failed");
    const result = await new PaystackProvider().verifyPayout("LPPO_0002");
    expect(calls[0]!.url).toBe("https://api.paystack.co/transfer/verify/LPPO_0002");
    expect(result).toMatchObject({
      providerReference: "LPPO_0002",
      status: "failed",
      failureMessage: "Insufficient balance",
    });
  });

  it("reports a successful transfer as succeeded", async () => {
    respondWith("transfer-verify-success");
    const result = await new PaystackProvider().verifyPayout("LPPO_0001");
    expect(result.status).toBe("succeeded");
    expect(result.failureMessage).toBeUndefined();
  });
});

describe("Paystack adapter contract: webhook signatures", () => {
  const body = JSON.stringify({ event: "charge.success", data: { reference: "LPPAY_0001" } });

  it("accepts an HMAC-SHA512 signature over the raw body", () => {
    const provider = new PaystackProvider();
    const signature = createHmac("sha512", env.paystackSecretKey).update(body).digest("hex");
    expect(provider.verifyWebhook(body, new Headers({ "x-paystack-signature": signature }))).toEqual({
      valid: true,
    });
  });

  it("rejects a tampered body, a wrong secret and a missing header", () => {
    const provider = new PaystackProvider();
    const signature = createHmac("sha512", env.paystackSecretKey).update(body).digest("hex");
    const tampered = new Headers({ "x-paystack-signature": signature });
    expect(provider.verifyWebhook(`${body} `, tampered)).toEqual({
      valid: false,
      reason: "signature mismatch",
    });
    const foreign = createHmac("sha512", "not-our-secret").update(body).digest("hex");
    expect(provider.verifyWebhook(body, new Headers({ "x-paystack-signature": foreign })).valid).toBe(
      false,
    );
    expect(provider.verifyWebhook(body, new Headers())).toEqual({
      valid: false,
      reason: "missing x-paystack-signature",
    });
  });
});

describe("Paystack adapter contract: transport failures", () => {
  it("reports an unreachable provider as PROVIDER_ERROR instead of throwing raw", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("fetch failed");
    });
    const error = await new PaystackProvider()
      .verifyPayment("LPPAY_0001")
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ code: "PROVIDER_ERROR", message: "Unable to reach Paystack" });
  });

  it("reports a non-JSON body as PROVIDER_ERROR", async () => {
    queue.push({ status: 200, body: null, raw: "<html>gateway</html>" });
    await expect(new PaystackProvider().verifyPayment("LPPAY_0001")).rejects.toMatchObject({
      code: "PROVIDER_ERROR",
    });
  });
});
