"use server";

import { redirect } from "next/navigation";
import { enforceRateLimit } from "@/lib/rate-limit";
import { requestMeta } from "@/lib/auth/session";
import { startLinkCheckout } from "@/services/payment-links";
import { startInvoiceCheckout } from "@/services/invoices";
import { toErrorResponse } from "@/lib/actions";
import { checkoutFormSchema } from "@/lib/validation";
import { fieldErrorsApp } from "@/lib/actions";
import { AppError } from "@/lib/errors";
import { setMockCheckoutOutcome } from "@/lib/providers/mock";
import { env } from "@/lib/env";

export type CheckoutState = { ok: boolean; message: string; errors?: Record<string, string[]> };

/** Public: starts a hosted payment link checkout. */
export async function startLinkCheckoutAction(_prev: CheckoutState, formData: FormData): Promise<CheckoutState> {
  const reference = String(formData.get("reference") ?? "");
  try {
    const meta = await requestMeta();
    await enforceRateLimit({ bucket: `checkout:${meta.ip ?? "unknown"}`, limit: 20, windowSeconds: 300 });

    const rawAmount = String(formData.get("amount") ?? "").trim();
    const parsed = checkoutFormSchema.safeParse({
      amount: rawAmount || undefined,
      name: formData.get("name") || undefined,
      email: formData.get("email") || undefined,
      phone: formData.get("phone") || undefined,
    });
    if (!parsed.success) {
      return { ok: false, message: "Check your details.", errors: fieldErrorsApp(parsed.error) };
    }
    if (!parsed.data.email) return { ok: false, message: "Enter your email address to receive a receipt." };

    let amountMinor: number | null = null;
    if (rawAmount) {
      if (!/^\d+(\.\d{1,2})?$/.test(rawAmount)) return { ok: false, message: "Enter a valid amount" };
      amountMinor = Math.round(Number(rawAmount) * 100);
    }

    const checkout = await startLinkCheckout({
      reference,
      amountMinor,
      customerEmail: parsed.data.email,
      customerName: parsed.data.name,
      customerPhone: parsed.data.phone,
    });

    redirect(checkout.authorizationUrl);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error && String((error as { digest?: string }).digest).startsWith("NEXT_REDIRECT")) {
      throw error;
    }
    return { ok: false, message: toErrorResponse(error).message };
  }
}

/** Public: starts an invoice checkout for the outstanding balance. */
export async function startInvoiceCheckoutAction(_prev: CheckoutState, formData: FormData): Promise<CheckoutState> {
  const reference = String(formData.get("reference") ?? "");
  const email = String(formData.get("email") ?? "");
  try {
    const meta = await requestMeta();
    await enforceRateLimit({ bucket: `invoice-pay:${meta.ip ?? "unknown"}`, limit: 20, windowSeconds: 300 });
    const checkout = await startInvoiceCheckout(reference, email || undefined);
    redirect(checkout.authorizationUrl);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error && String((error as { digest?: string }).digest).startsWith("NEXT_REDIRECT")) {
      throw error;
    }
    return { ok: false, message: toErrorResponse(error).message };
  }
}

/**
 * Development-only: records the simulated outcome for a test checkout.
 * Gated by the mock provider's production guard.
 */
export async function mockCheckoutOutcomeAction(_prev: CheckoutState, formData: FormData): Promise<CheckoutState> {
  const reference = String(formData.get("reference") ?? "");
  const outcome = String(formData.get("outcome") ?? "");
  if (!["succeeded", "failed", "abandoned"].includes(outcome)) {
    return { ok: false, message: "Unknown outcome" };
  }
  try {
    if (env.isProduction && process.env.ALLOW_MOCK_PAYMENTS !== "true") {
      throw new AppError("FORBIDDEN", "Test payments are disabled");
    }
    await setMockCheckoutOutcome(reference, outcome as "succeeded" | "failed" | "abandoned");
    redirect(`/checkout/return?reference=${encodeURIComponent(reference)}`);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error && String((error as { digest?: string }).digest).startsWith("NEXT_REDIRECT")) {
      throw error;
    }
    return { ok: false, message: toErrorResponse(error).message };
  }
}
