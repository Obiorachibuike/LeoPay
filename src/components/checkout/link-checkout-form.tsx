"use client";

import { useActionState } from "react";
import { startLinkCheckoutAction, type CheckoutState } from "@/app/actions/checkout";
import { Field, Input } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { formatMoney } from "@/lib/money";

const initial: CheckoutState = { ok: false, message: "" };

export function LinkCheckoutForm({
  reference,
  currency,
  fixedAmountMinor,
  minAmountMinor,
  maxAmountMinor,
  collectPhone,
  collectName,
  disabledReason,
}: {
  reference: string;
  currency: string;
  fixedAmountMinor: number | null;
  minAmountMinor: number | null;
  maxAmountMinor: number | null;
  collectPhone: boolean;
  collectName: boolean;
  disabledReason?: string;
}) {
  const [state, action, pending] = useActionState(startLinkCheckoutAction, initial);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="reference" value={reference} />
      {state.message ? <Alert tone="danger">{state.message}</Alert> : null}
      {disabledReason ? <Alert tone="warning">{disabledReason}</Alert> : null}

      {fixedAmountMinor === null ? (
        <Field
          label="Amount"
          htmlFor="checkout-amount"
          hint={
            minAmountMinor || maxAmountMinor
              ? `Between ${minAmountMinor ? formatMoney(minAmountMinor, currency) : "no minimum"} and ${maxAmountMinor ? formatMoney(maxAmountMinor, currency) : "no maximum"}`
              : undefined
          }
          error={state.errors?.amount}
        >
          <Input id="checkout-amount" name="amount" inputMode="decimal" placeholder="0.00" required />
        </Field>
      ) : (
        <div className="rounded-lg border border-border bg-surface-2/50 p-4">
          <p className="text-[11px] uppercase tracking-[0.08em] text-muted">Amount due</p>
          <p className="mt-1 text-[26px] font-semibold tabular">{formatMoney(fixedAmountMinor, currency)}</p>
        </div>
      )}

      {collectName ? (
        <Field label="Full name" htmlFor="checkout-name" error={state.errors?.name}>
          <Input id="checkout-name" name="name" autoComplete="name" />
        </Field>
      ) : null}
      <Field label="Email address" htmlFor="checkout-email" hint="Your receipt is sent here." error={state.errors?.email}>
        <Input id="checkout-email" name="email" type="email" autoComplete="email" required />
      </Field>
      {collectPhone ? (
        <Field label="Phone number" htmlFor="checkout-phone" hint="Optional" error={state.errors?.phone}>
          <Input id="checkout-phone" name="phone" type="tel" autoComplete="tel" inputMode="tel" />
        </Field>
      ) : null}

      <SubmitButton pending={pending} className="w-full" disabled={Boolean(disabledReason)}>
        {pending ? "Starting secure checkout…" : "Continue to payment"}
      </SubmitButton>
      <p className="text-center text-[11px] leading-relaxed text-muted">
        You will be redirected to the merchant&apos;s payment provider. LeoPay never stores your card details.
      </p>
    </form>
  );
}
