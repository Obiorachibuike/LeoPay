"use client";

import { useActionState } from "react";
import { submitSupportAction, type SupportFormState } from "@/app/actions/support";
import { Field, Input, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";

const initial: SupportFormState = { ok: false, message: "" };

export function ContactForm({ signedInEmail }: { signedInEmail?: string }) {
  const [state, action, pending] = useActionState(submitSupportAction, initial);

  if (state.ok) {
    return (
      <Alert tone="success" title="Message received">
        {state.message}
      </Alert>
    );
  }

  return (
    <form action={action} className="space-y-4">
      {state.message && !state.ok ? <Alert tone="danger">{state.message}</Alert> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Your name" htmlFor="name" error={state.errors?.name}>
          <Input id="name" name="name" autoComplete="name" required aria-invalid={Boolean(state.errors?.name)} />
        </Field>
        <Field label="Email address" htmlFor="email" error={state.errors?.email}>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            defaultValue={signedInEmail}
            required
            aria-invalid={Boolean(state.errors?.email)}
          />
        </Field>
      </div>
      <Field label="Subject" htmlFor="subject" error={state.errors?.subject}>
        <Input id="subject" name="subject" required aria-invalid={Boolean(state.errors?.subject)} />
      </Field>
      <Field
        label="Message"
        htmlFor="message"
        hint="Include a payment reference if your question relates to a transaction. Do not share passwords, API keys or one-time codes."
        error={state.errors?.message}
      >
        <Textarea id="message" name="message" rows={6} required aria-invalid={Boolean(state.errors?.message)} />
      </Field>
      <Field label="Payment reference" htmlFor="reference" optional error={state.errors?.reference}>
        <Input id="reference" name="reference" placeholder="pay_…" />
      </Field>
      <SubmitButton pending={pending}>Send message</SubmitButton>
    </form>
  );
}
