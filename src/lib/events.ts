/** Merchant webhook event catalogue shared by server and client code. */
export const MERCHANT_EVENT_TYPES = [
  "payment.pending",
  "payment.succeeded",
  "payment.failed",
  "payment.refunded",
  "invoice.created",
  "invoice.paid",
  "payout.processing",
  "payout.succeeded",
  "payout.failed",
  "order.created",
  "order.paid",
] as const;

export type MerchantEventType = (typeof MERCHANT_EVENT_TYPES)[number];

export type MerchantEvent = {
  id: string;
  type: MerchantEventType;
  created_at: string;
  data: Record<string, unknown>;
};
