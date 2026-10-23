"use client";

import { useActionState } from "react";
import { submitSupportAction, type SupportFormState } from "@/app/actions/support";
import { Field, Input, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";

const initial: SupportFormState = { ok: false, message: "" };

export function SupportForm({ defaultEmail, defaultName }: { defaultEmail?: string; defaultName?: string }) {
  const [state, action, pending] = useActionState(submitSupportAction, initial);
  return (
    <form action={action} className="space-y-3">
      {state.message ? <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert> : null}
      <Field label="Your name" htmlFor="support-name" error={state.errors?.name}>
        <Input id="support-name" name="name" defaultValue={defaultName} required />
      </Field>
      <Field label="Your email" htmlFor="support-email" error={state.errors?.email}>
        <Input id="support-email" name="email" type="email" defaultValue={defaultEmail} required />
      </Field>
      <Field label="Subject" htmlFor="support-subject" error={state.errors?.subject}>
        <Input id="support-subject" name="subject" required placeholder="Short summary" />
      </Field>
      <Field label="Related reference" htmlFor="support-reference" hint="Optional — a payment or payout reference." error={state.errors?.reference}>
        <Input id="support-reference" name="reference" placeholder="e.g. lp_pay_…" />
      </Field>
      <Field label="Details" htmlFor="support-message" error={state.errors?.message}>
        <Textarea id="support-message" name="message" rows={5} required placeholder="What happened? Include dates and steps to reproduce." />
      </Field>
      <SubmitButton pending={pending}>Send message</SubmitButton>
    </form>
  );
}
