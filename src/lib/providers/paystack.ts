/**
 * Paystack adapter, implemented against the documented REST API
 * (https://paystack.com/docs/api). Amounts are in the currency's minor unit,
 * which matches LeoPay's internal representation.
 *
 * IMPORTANT: this adapter is exercised only against Paystack's documented
 * request/response shapes in automated tests. It has not been run against a
 * live Paystack account in this environment because no credentials are
 * configured. See DEPLOYMENT.md for the go-live checklist.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
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

const BASE_URL = "https://api.paystack.co";
const TIMEOUT_MS = 20_000;
const SUPPORTED_CURRENCIES = ["NGN", "GHS", "ZAR", "KES", "USD"];

type PaystackEnvelope<T> = { status: boolean; message: string; data: T };

export class PaystackProvider implements PaymentProvider {
  readonly name = "paystack" as const;
  readonly displayName = "Paystack";
  readonly capabilities: ProviderCapabilities = {
    hostedCheckout: true,
    refunds: true,
    payouts: true,
    accountResolution: true,
    webhooks: true,
    channels: ["card", "bank", "ussd", "bank_transfer", "qr", "mobile_money"],
  };

  isConfigured(): boolean {
    return Boolean(env.paystackSecretKey);
  }

  private secretKey(): string {
    if (!env.paystackSecretKey) {
      throw new AppError(
        "PROVIDER_NOT_CONFIGURED",
        "Paystack is not configured. Add PAYSTACK_SECRET_KEY to enable card and bank payments.",
      );
    }
    return env.paystackSecretKey;
  }

  private async request<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(`${BASE_URL}${path}`, {
        method: init?.method ?? "GET",
        headers: {
          Authorization: `Bearer ${this.secretKey()}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: init?.body ? JSON.stringify(init.body) : undefined,
        signal: controller.signal,
        cache: "no-store",
      });
      const text = await response.text();
      let parsed: PaystackEnvelope<T> | null = null;
      try {
        parsed = text ? (JSON.parse(text) as PaystackEnvelope<T>) : null;
      } catch {
        parsed = null;
      }
      if (!response.ok || !parsed?.status) {
        const message = parsed?.message || `Paystack request failed with status ${response.status}`;
        logger.warn("Paystack API error", { path, status: response.status, message });
        throw new AppError("PROVIDER_ERROR", message, {
          status: 502,
          expose: true,
        });
      }
      return parsed.data;
    } catch (error) {
      if (error instanceof AppError) throw error;
      const message = error instanceof Error && error.name === "AbortError" ? "Paystack request timed out" : "Unable to reach Paystack";
      logger.error("Paystack request failed", { path, error: (error as Error).message });
      throw new AppError("PROVIDER_ERROR", message, { status: 502 });
    } finally {
      clearTimeout(timer);
    }
  }

  async initializePayment(input: InitializePaymentInput): Promise<InitializePaymentResult> {
    if (!SUPPORTED_CURRENCIES.includes(input.currency)) {
      throw new AppError("PAYMENT_ERROR", `Paystack does not support ${input.currency} in this integration`);
    }
    const data = await this.request<{
      authorization_url: string;
      access_code: string;
      reference: string;
    }>("/transaction/initialize", {
      method: "POST",
      body: {
        email: input.email,
        amount: input.amountMinor,
        currency: input.currency,
        reference: input.reference,
        callback_url: input.callbackUrl,
        channels: input.channels,
        metadata: input.metadata ?? {},
      },
    });
    return {
      providerReference: data.reference,
      authorizationUrl: data.authorization_url,
      accessCode: data.access_code,
    };
  }

  async verifyPayment(reference: string): Promise<VerifyPaymentResult> {
    const data = await this.request<{
      status: string;
      reference: string;
      amount: number;
      currency: string;
      channel?: string;
      fees?: number;
      paid_at?: string | null;
      gateway_response?: string;
      status_reason?: string;
    }>(`/transaction/verify/${encodeURIComponent(reference)}`);

    const statusMap: Record<string, VerifyPaymentResult["status"]> = {
      success: "succeeded",
      failed: "failed",
      abandoned: "cancelled",
      reversed: "failed",
      pending: "pending",
      ongoing: "processing",
      processing: "processing",
      queued: "processing",
    };

    return {
      providerReference: data.reference,
      status: statusMap[data.status] ?? "pending",
      amountMinor: Number(data.amount),
      currency: data.currency,
      channel: data.channel ?? null,
      feeMinor: typeof data.fees === "number" ? data.fees : null,
      paidAt: data.paid_at ? new Date(data.paid_at) : null,
      failureCode: data.status !== "success" ? data.status : null,
      failureMessage: data.status !== "success" ? (data.gateway_response ?? null) : null,
      raw: {
        status: data.status,
        channel: data.channel,
        fees: data.fees,
        gateway_response: data.gateway_response,
        status_reason: data.status_reason,
      },
    };
  }

  async createRefund(input: RefundInput): Promise<RefundResult> {
    const data = await this.request<{ status: string; id: number }>("/refund", {
      method: "POST",
      body: {
        transaction: input.providerReference,
        amount: input.amountMinor,
        merchant_note: input.reason,
      },
    });
    return {
      status: data.status === "processed" ? "succeeded" : data.status === "failed" ? "failed" : "pending",
      providerReference: String(data.id),
      failureMessage: data.status === "failed" ? "Paystack rejected the refund" : undefined,
    };
  }

  async listBanks(): Promise<Bank[]> {
    const data = await this.request<Array<{ code: string; name: string }>>("/bank?currency=NGN&country=nigeria");
    return data.map((b) => ({ code: b.code, name: b.name }));
  }

  async resolveAccount(input: ResolveAccountInput): Promise<ResolveAccountResult> {
    const data = await this.request<{ account_name: string; account_number: string }>(
      `/bank/resolve?account_number=${encodeURIComponent(input.accountNumber)}&bank_code=${encodeURIComponent(input.bankCode)}`,
    );
    return { accountName: data.account_name, accountNumber: data.account_number };
  }

  private async ensureRecipient(input: PayoutInput): Promise<string> {
    if (input.beneficiary.providerRecipientReference) return input.beneficiary.providerRecipientReference;
    const data = await this.request<{ recipient_code: string }>("/transferrecipient", {
      method: "POST",
      body: {
        type: "nuban",
        name: input.beneficiary.name,
        account_number: input.beneficiary.accountNumber,
        bank_code: input.beneficiary.bankCode,
        currency: input.currency,
      },
    });
    return data.recipient_code;
  }

  async createPayout(input: PayoutInput): Promise<PayoutResult> {
    const recipient = await this.ensureRecipient(input);
    const data = await this.request<{ reference: string; status: string }>("/transfer", {
      method: "POST",
      body: {
        source: "balance",
        amount: input.amountMinor,
        recipient,
        reason: input.reason,
        reference: input.reference,
        currency: input.currency,
      },
    });
    return {
      providerReference: data.reference,
      status: data.status === "success" ? "succeeded" : data.status === "failed" ? "failed" : "processing",
      recipientReference: recipient,
    };
  }

  async verifyPayout(reference: string): Promise<PayoutResult> {
    const data = await this.request<{ reference: string; status: string; failures?: { reason?: string } | null }>(
      `/transfer/verify/${encodeURIComponent(reference)}`,
    );
    const status = data.status === "success" ? "succeeded" : data.status === "failed" || data.status === "reversed" ? "failed" : "processing";
    return {
      providerReference: data.reference,
      status,
      failureMessage: data.failures?.reason,
    };
  }

  /**
   * Paystack signs webhook bodies with HMAC-SHA512 of the raw request body
   * using the account secret key, sent in `x-paystack-signature`.
   */
  verifyWebhook(rawBody: string, headers: Headers): { valid: boolean; reason?: string } {
    const signature = headers.get("x-paystack-signature");
    if (!signature) return { valid: false, reason: "missing x-paystack-signature" };
    let secret: string;
    try {
      secret = this.secretKey();
    } catch {
      return { valid: false, reason: "provider not configured" };
    }
    const expected = createHmac("sha512", secret).update(rawBody).digest("hex");
    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(signature, "utf8");
    const valid = a.length === b.length && timingSafeEqual(a, b);
    return valid ? { valid: true } : { valid: false, reason: "signature mismatch" };
  }
}
