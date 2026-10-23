/**
 * Provider-independent payment interface. Business logic depends only on this
 * contract, so providers can be added without changing checkout or webhook
 * handling.
 */
export type ProviderName = "mock" | "paystack";

export type InitializePaymentInput = {
  reference: string;
  amountMinor: number;
  currency: string;
  email: string;
  customerName?: string;
  callbackUrl: string;
  metadata?: Record<string, unknown>;
  /** Provider-specific channels, e.g. ["card", "bank_transfer"]. */
  channels?: string[];
};

export type InitializePaymentResult = {
  providerReference: string;
  authorizationUrl: string;
  accessCode?: string;
};

export type VerifiedPaymentStatus = "succeeded" | "failed" | "pending" | "processing" | "cancelled";

export type VerifyPaymentResult = {
  providerReference: string;
  status: VerifiedPaymentStatus;
  amountMinor: number;
  currency: string;
  channel?: string | null;
  feeMinor?: number | null;
  paidAt?: Date | null;
  failureCode?: string | null;
  failureMessage?: string | null;
  /** Raw provider payload, stored for reconciliation (already contains no secrets). */
  raw?: Record<string, unknown>;
};

export type RefundInput = {
  providerReference: string;
  amountMinor: number;
  reason?: string;
};

export type RefundResult = {
  status: "pending" | "succeeded" | "failed";
  providerReference?: string;
  failureMessage?: string;
};

export type Bank = { code: string; name: string };

export type ResolveAccountInput = { accountNumber: string; bankCode: string };
export type ResolveAccountResult = { accountName: string; accountNumber: string };

export type PayoutInput = {
  reference: string;
  amountMinor: number;
  currency: string;
  beneficiary: {
    name: string;
    accountNumber: string;
    bankCode: string;
    providerRecipientReference?: string | null;
  };
  reason?: string;
  /** Idempotency/reference that must identify the transfer at the provider. */
  idempotencyKey?: string;
};

export type PayoutResult = {
  providerReference: string;
  status: "processing" | "succeeded" | "failed";
  failureMessage?: string;
  recipientReference?: string;
};

export type ProviderCapabilities = {
  /** Hosted checkout redirect flow. */
  hostedCheckout: boolean;
  refunds: boolean;
  payouts: boolean;
  accountResolution: boolean;
  webhooks: boolean;
  channels: string[];
};

export interface PaymentProvider {
  readonly name: ProviderName;
  readonly displayName: string;
  readonly capabilities: ProviderCapabilities;
  /** True when the provider has the credentials needed to operate. */
  isConfigured(): boolean;
  initializePayment(input: InitializePaymentInput): Promise<InitializePaymentResult>;
  verifyPayment(reference: string): Promise<VerifyPaymentResult>;
  createRefund(input: RefundInput): Promise<RefundResult>;
  listBanks(): Promise<Bank[]>;
  resolveAccount(input: ResolveAccountInput): Promise<ResolveAccountResult>;
  createPayout(input: PayoutInput): Promise<PayoutResult>;
  verifyPayout(reference: string): Promise<PayoutResult>;
  verifyWebhook(rawBody: string, headers: Headers): { valid: boolean; reason?: string };
}
