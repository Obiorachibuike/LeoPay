"use client";

import { useActionState } from "react";
import { mockCheckoutOutcomeAction, type CheckoutState } from "@/app/actions/checkout";
import { SubmitButton } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";

const initial: CheckoutState = { ok: false, message: "" };

export function MockOutcomeForm({ reference }: { reference: string }) {
  const [state, action, pending] = useActionState(mockCheckoutOutcomeAction, initial);
  return (
    <form action={action} className="space-y-3">
      {state.message ? <Alert tone="danger">{state.message}</Alert> : null}
      <input type="hidden" name="reference" value={reference} />
      <div className="grid gap-2 sm:grid-cols-2">
        <SubmitButton pending={pending} name="outcome" value="succeeded">
          Simulate successful payment
        </SubmitButton>
        <SubmitButton pending={pending} name="outcome" value="failed" variant="secondary">
          Simulate failure
        </SubmitButton>
      </div>
      <SubmitButton pending={pending} name="outcome" value="abandoned" variant="ghost" className="w-full">
        Simulate abandoned checkout
      </SubmitButton>
    </form>
  );
}
