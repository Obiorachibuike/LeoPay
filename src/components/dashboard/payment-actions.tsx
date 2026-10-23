"use client";

import { useActionState } from "react";
import { refundPaymentAction, verifyPaymentAction } from "@/app/actions/payments";
import { Field, Input, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { ActionButton } from "@/components/ui/action-button";
import type { ActionResult } from "@/lib/actions";

const initial: ActionResult = { ok: false, message: "" };

export function VerifyPaymentButton({ reference }: { reference: string }) {
  return <ActionButton action={verifyPaymentAction.bind(null, reference)}>Verify with provider</ActionButton>;
}

export function RefundForm({
  paymentId,
  refundableMinor,
  currency,
}: {
  paymentId: string;
  refundableMinor: number;
  currency: string;
}) {
  const [state, action, pending] = useActionState(refundPaymentAction, initial);
  const max = (refundableMinor / 100).toFixed(2);
  return (
    <form action={action} className="space-y-3">
      {state.message ? <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert> : null}
      <input type="hidden" name="paymentId" value={paymentId} />
      <Field label={`Refund amount (${currency})`} htmlFor="refund-amount" hint={`Maximum refundable: ${max}`}>
        <Input id="refund-amount" name="amount" type="number" step="0.01" min="0.01" max={max} required />
      </Field>
      <Field label="Reason" htmlFor="refund-reason" optional>
        <Textarea id="refund-reason" name="reason" rows={2} placeholder="Customer requested cancellation" />
      </Field>
      <SubmitButton pending={pending} variant="danger" size="sm">
        Submit refund
      </SubmitButton>
      <p className="text-[11px] leading-relaxed text-muted">
        Refunds are processed by the provider and can fail. Your record updates only when the provider confirms the
        refund.
      </p>
    </form>
  );
}
