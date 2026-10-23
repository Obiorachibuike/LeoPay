"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createPaymentLinkAction, type LinkFormState } from "@/app/actions/payment-links";
import { Field, Input, Select, Textarea, Checkbox } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { CURRENCIES } from "@/lib/money";

const initial: LinkFormState = { ok: false, message: "" };

export function CreateLinkForm() {
  const [state, action, pending] = useActionState(createPaymentLinkAction, initial);
  const [variable, setVariable] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (state.ok && state.redirectTo) router.push(state.redirectTo);
  }, [state, router]);

  return (
    <form action={action} className="space-y-4">
      {state.message && !state.ok ? <Alert tone="danger">{state.message}</Alert> : null}
      <Field label="Title" htmlFor="title" error={state.errors?.title} hint="Shown on the checkout page, e.g. “Website design deposit”.">
        <Input id="title" name="title" required maxLength={120} />
      </Field>
      <Field label="Description" htmlFor="description" optional error={state.errors?.description}>
        <Textarea id="description" name="description" rows={3} maxLength={1000} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Currency" htmlFor="currency" error={state.errors?.currency}>
          <Select id="currency" name="currency" defaultValue="NGN">
            {Object.values(CURRENCIES)
              .filter((c) => c.enabled)
              .map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} — {c.name}
                </option>
              ))}
          </Select>
        </Field>
        <Field label="Expiry date" htmlFor="expiresAt" optional error={state.errors?.expiresAt}>
          <Input id="expiresAt" name="expiresAt" type="date" min={new Date().toISOString().slice(0, 10)} />
        </Field>
      </div>

      <label className="flex items-start gap-2.5 rounded-lg border border-border bg-surface-2/50 p-3 text-[13px]">
        <Checkbox name="allowVariableAmount" checked={variable} onChange={(e) => setVariable(e.target.checked)} />
        <span>
          <span className="font-medium text-foreground">Let the customer choose the amount</span>
          <span className="block text-[12px] text-muted">Useful for donations, dues or flexible deposits.</span>
        </span>
      </label>

      {variable ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Minimum amount" htmlFor="minAmount" error={state.errors?.minAmountMinor}>
            <Input id="minAmount" name="minAmount" type="number" step="0.01" min="1" required />
          </Field>
          <Field label="Maximum amount" htmlFor="maxAmount" error={state.errors?.maxAmountMinor}>
            <Input id="maxAmount" name="maxAmount" type="number" step="0.01" min="1" required />
          </Field>
        </div>
      ) : (
        <Field label="Amount" htmlFor="amount" error={state.errors?.amountMinor} hint="The customer pays exactly this amount.">
          <Input id="amount" name="amount" type="number" step="0.01" min="1" required />
        </Field>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Redirect after payment" htmlFor="successUrl" optional error={state.errors?.successUrl}>
          <Input id="successUrl" name="successUrl" placeholder="https://acme.ng/thank-you" />
        </Field>
        <Field label="Cancel URL" htmlFor="cancelUrl" optional error={state.errors?.cancelUrl}>
          <Input id="cancelUrl" name="cancelUrl" placeholder="https://acme.ng/pricing" />
        </Field>
      </div>

      <label className="flex items-center gap-2 text-[12.5px] text-muted">
        <Checkbox name="collectCustomerPhone" />
        Ask for the customer's phone number at checkout
      </label>

      <SubmitButton pending={pending} className="w-full sm:w-auto">
        Create payment link
      </SubmitButton>
    </form>
  );
}
