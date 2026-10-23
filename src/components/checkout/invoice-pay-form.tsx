"use client";

import { useActionState } from "react";
import { startInvoiceCheckoutAction, type CheckoutState } from "@/app/actions/checkout";
import { Field, Input } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";

const initial: CheckoutState = { ok: false, message: "" };

export function InvoicePayForm({ reference, defaultEmail }: { reference: string; defaultEmail?: string | null }) {
  const [state, action, pending] = useActionState(startInvoiceCheckoutAction, initial);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="reference" value={reference} />
      {state.message ? <Alert tone="danger">{state.message}</Alert> : null}
      <Field label="Email for the receipt" htmlFor="invoice-pay-email" error={state.errors?.email}>
        <Input id="invoice-pay-email" name="email" type="email" defaultValue={defaultEmail ?? ""} required />
      </Field>
      <SubmitButton pending={pending} className="w-full">
        {pending ? "Starting checkout…" : "Pay this invoice"}
      </SubmitButton>
    </form>
  );
}
