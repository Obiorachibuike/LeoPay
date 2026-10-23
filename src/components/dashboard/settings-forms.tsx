"use client";

import { useActionState } from "react";
import { changePasswordAction } from "@/app/actions/settings";
import { Field, Input } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import type { ActionResult } from "@/lib/actions";

const initial: ActionResult = { ok: false, message: "" };

export function PasswordForm() {
  const [state, action, pending] = useActionState(changePasswordAction, initial);
  return (
    <form action={action} className="space-y-4">
      {state.message ? <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert> : null}
      <Field label="Current password" htmlFor="currentPassword" error={state.errors?.currentPassword}>
        <Input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" required />
      </Field>
      <Field
        label="New password"
        htmlFor="newPassword"
        hint="At least 10 characters, including letters and numbers."
        error={state.errors?.newPassword}
      >
        <Input id="newPassword" name="newPassword" type="password" autoComplete="new-password" required minLength={10} />
      </Field>
      <SubmitButton pending={pending} variant="secondary">
        Update password
      </SubmitButton>
    </form>
  );
}
