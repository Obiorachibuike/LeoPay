"use client";

import Link from "next/link";
import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  acceptInvitationAction,
  forgotPasswordAction,
  loginAction,
  registerAction,
  verifyMfaLoginAction,
  resetPasswordAction,
  type FormState,
} from "@/app/actions/auth";
import { Field, Input } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";

const initial: FormState = { ok: false, message: "" };

function useRedirect(state: FormState) {
  const router = useRouter();
  useEffect(() => {
    if (state.ok && state.redirectTo) router.push(state.redirectTo);
  }, [state, router]);
}

export function LoginForm({ redirectTo }: { redirectTo?: string }) {
  const [state, action, pending] = useActionState(loginAction, initial);
  useRedirect(state);

  return (
    <form action={action} className="space-y-4">
      {state.message && !state.ok ? <Alert tone="danger">{state.message}</Alert> : null}
      <input type="hidden" name="redirectTo" value={redirectTo ?? ""} />
      <Field label="Email address" htmlFor="email" error={state.errors?.email}>
        <Input id="email" name="email" type="email" autoComplete="email" required aria-invalid={Boolean(state.errors?.email)} />
      </Field>
      <Field label="Password" htmlFor="password" error={state.errors?.password}>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={Boolean(state.errors?.password)}
        />
      </Field>
      <div className="flex items-center justify-between">
        <Link href="/forgot-password" className="text-[12.5px] font-medium text-accent hover:underline">
          Forgot your password?
        </Link>
      </div>
      <SubmitButton pending={pending} className="w-full">
        Sign in
      </SubmitButton>
    </form>
  );
}

export function MfaChallengeForm({ redirectTo }: { redirectTo?: string }) {
  const [state, action, pending] = useActionState(verifyMfaLoginAction, initial);
  const router = useRouter();

  useEffect(() => {
    if (state.redirectTo && !state.ok) router.push(state.redirectTo);
  }, [state, router]);
  useRedirect(state);

  return (
    <form action={action} className="space-y-4">
      {state.message && !state.ok ? <Alert tone="danger">{state.message}</Alert> : null}
      <input type="hidden" name="redirectTo" value={redirectTo ?? "/dashboard"} />
      <Field
        label="Authentication code"
        htmlFor="mfa-code"
        hint="6-digit code, or a recovery code such as abcd-efgh."
      >
        <Input
          id="mfa-code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          required
          placeholder="123456"
          pattern="[0-9A-Za-z-]{6,20}"
        />
      </Field>
      <SubmitButton pending={pending} className="w-full">
        {pending ? "Verifying…" : "Verify and sign in"}
      </SubmitButton>
      <p className="text-center text-[11.5px] leading-relaxed text-muted">
        Lost your authenticator? Use a recovery code — each one works once.
      </p>
    </form>
  );
}

export function RegisterForm() {
  const [state, action, pending] = useActionState(registerAction, initial);
  useRedirect(state);

  return (
    <form action={action} className="space-y-4">
      {state.message && !state.ok ? <Alert tone="danger">{state.message}</Alert> : null}
      <Field label="Full name" htmlFor="name" error={state.errors?.name}>
        <Input id="name" name="name" autoComplete="name" required aria-invalid={Boolean(state.errors?.name)} />
      </Field>
      <Field label="Work email" htmlFor="email" error={state.errors?.email}>
        <Input id="email" name="email" type="email" autoComplete="email" required aria-invalid={Boolean(state.errors?.email)} />
      </Field>
      <Field
        label="Password"
        htmlFor="password"
        hint="At least 10 characters, including letters and numbers."
        error={state.errors?.password}
      >
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={10}
          aria-invalid={Boolean(state.errors?.password)}
        />
      </Field>
      <label className="flex items-start gap-2.5 text-[12.5px] leading-relaxed text-muted">
        <input type="checkbox" name="acceptTerms" className="mt-0.5 h-4 w-4 rounded border-border-strong accent-[var(--accent)]" />
        <span>
          I agree to the <Link href="/legal/terms" className="font-medium text-accent underline">terms of service</Link> and{" "}
          <Link href="/legal/privacy" className="font-medium text-accent underline">privacy policy</Link>.
        </span>
      </label>
      {state.errors?.acceptTerms ? <p className="text-[12px] text-[var(--danger)]">{state.errors.acceptTerms[0]}</p> : null}
      <SubmitButton pending={pending} className="w-full">
        Create account
      </SubmitButton>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(forgotPasswordAction, initial);
  return (
    <form action={action} className="space-y-4">
      {state.message ? (
        <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>
      ) : null}
      <Field label="Email address" htmlFor="email" error={state.errors?.email}>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <SubmitButton pending={pending} className="w-full">
        Send reset link
      </SubmitButton>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetPasswordAction, initial);
  useRedirect(state);
  return (
    <form action={action} className="space-y-4">
      {state.message ? <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert> : null}
      <input type="hidden" name="token" value={token} />
      <Field
        label="New password"
        htmlFor="password"
        hint="At least 10 characters, including letters and numbers."
        error={state.errors?.password}
      >
        <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={10} />
      </Field>
      <SubmitButton pending={pending} className="w-full">
        Update password
      </SubmitButton>
    </form>
  );
}

export function AcceptInvitationButton({ token }: { token: string }) {
  const [state, action, pending] = useActionState(acceptInvitationAction, initial);
  useRedirect(state);
  return (
    <form action={action} className="space-y-4">
      {state.message ? <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert> : null}
      <input type="hidden" name="token" value={token} />
      <SubmitButton pending={pending} className="w-full">
        Accept invitation
      </SubmitButton>
    </form>
  );
}
