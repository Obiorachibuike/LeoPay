"use client";

import { useState, useTransition } from "react";
import { KeyRound, ShieldCheck, ShieldOff } from "lucide-react";
import {
  confirmMfaEnrollmentAction,
  disableMfaAction,
  regenerateRecoveryCodesAction,
  startMfaEnrollmentAction,
  type EnrollmentResult,
  type RecoveryResult,
} from "@/app/actions/mfa";
import { useActionState } from "react";
import { Field, Input } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { CopyButton } from "@/components/ui/copy-button";
import { Badge } from "@/components/ui/badge";

const initialResult = { ok: false, message: "" } as RecoveryResult;

function RecoveryCodes({ codes }: { codes: string[] }) {
  if (!codes.length) return null;
  return (
    <div className="rounded-lg border border-border bg-surface-2/60 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[12px] font-medium">Recovery codes — shown once</p>
        <CopyButton value={codes.join("\n")} label="Copy all" />
      </div>
      <ul className="grid grid-cols-2 gap-1 font-mono text-[12px] sm:grid-cols-3">
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] text-muted">
        Each code signs you in once if you lose your authenticator. Store them offline.
      </p>
    </div>
  );
}

export function MfaPanel({
  enabled,
  remainingRecoveryCodes,
  email,
}: {
  enabled: boolean;
  remainingRecoveryCodes: number;
  email: string;
}) {
  const [enrollment, setEnrollment] = useState<EnrollmentResult | null>(null);
  const [starting, startTransition] = useTransition();
  const [confirmState, confirmAction, confirming] = useActionState(confirmMfaEnrollmentAction, initialResult);
  const [disableState, disableAction, disabling] = useActionState(disableMfaAction, initialResult);
  const [regenState, regenAction, regenerating] = useActionState(regenerateRecoveryCodesAction, initialResult);

  const begin = () => {
    startTransition(async () => {
      const result = await startMfaEnrollmentAction();
      setEnrollment(result);
    });
  };

  if (!enabled) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
          <span className="text-muted">Status:</span>
          <Badge tone="warning">Off</Badge>
        </div>
        <p className="max-w-lg text-[12.5px] leading-relaxed text-muted">
          Add a second step at sign-in with any TOTP authenticator app. You will be asked for a
          6-digit code after your password; sessions are not created until it is verified.
        </p>

        {confirmState.recoveryCodes?.length ? (
          <RecoveryCodes codes={confirmState.recoveryCodes} />
        ) : null}
        {confirmState.message ? (
          <Alert tone={confirmState.ok ? "success" : "danger"}>{confirmState.message}</Alert>
        ) : null}

        {!enrollment?.ok ? (
          <button
            type="button"
            onClick={begin}
            disabled={starting}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[var(--brand)] px-3.5 text-[12.5px] font-medium text-[var(--brand-foreground)] disabled:opacity-60"
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            {starting ? "Preparing…" : "Set up two-factor authentication"}
          </button>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border border-border p-3">
              <p className="text-[12px] font-medium">1. Add this account to your authenticator</p>
              <p className="mt-1 text-[11.5px] text-muted">
                Scan the QR code with your authenticator app, or enter the secret by hand. Account: {email}
              </p>
              {enrollment.qrDataUrl ? (
                <div className="mt-3 flex items-center gap-3">
                  {/* Generated on the server from the otpauth URI; never sent to a third party. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={enrollment.qrDataUrl}
                    alt="QR code for authenticator setup"
                    width={132}
                    height={132}
                    className="rounded-md border border-border bg-white p-1"
                  />
                  <p className="text-[11px] text-muted">
                    Can&apos;t scan? Use the secret below — it works in any TOTP app.
                  </p>
                </div>
              ) : null}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <code className="break-all rounded bg-surface-2 px-2 py-1 font-mono text-[11.5px]">{enrollment.secret}</code>
                <CopyButton value={enrollment.secret ?? ""} label="Copy secret" />
              </div>
              <p className="mt-2 break-all text-[10.5px] text-muted">
                Secret only, for manual entry: <span className="font-mono">{enrollment.secret}</span>
              </p>
            </div>
            <form action={confirmAction} className="space-y-3">
              <p className="text-[12px] font-medium">2. Enter the 6-digit code to confirm</p>
              <Field label="Authentication code" htmlFor="mfa-confirm-code">
                <Input
                  id="mfa-confirm-code"
                  name="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  required
                  placeholder="123456"
                />
              </Field>
              <SubmitButton pending={confirming}>Enable two-factor authentication</SubmitButton>
            </form>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
        <span className="text-muted">Status:</span>
        <Badge tone="success">On</Badge>
        <span className="text-muted">
          · {remainingRecoveryCodes} recovery code{remainingRecoveryCodes === 1 ? "" : "s"} remaining
        </span>
      </div>
      {regenState.recoveryCodes?.length ? <RecoveryCodes codes={regenState.recoveryCodes} /> : null}
      {regenState.message ? <Alert tone={regenState.ok ? "success" : "danger"}>{regenState.message}</Alert> : null}
      {disableState.message ? <Alert tone={disableState.ok ? "success" : "danger"}>{disableState.message}</Alert> : null}

      <details className="rounded-lg border border-border p-3">
        <summary className="cursor-pointer text-[12.5px] font-medium">Regenerate recovery codes</summary>
        <form action={regenAction} className="mt-3 space-y-3">
          <Field label="Authenticator code" htmlFor="regen-code">
            <Input id="regen-code" name="code" inputMode="numeric" maxLength={6} pattern="[0-9]{6}" required />
          </Field>
          <SubmitButton pending={regenerating} variant="secondary">
            <KeyRound className="h-3.5 w-3.5" /> Generate new codes
          </SubmitButton>
        </form>
      </details>

      <details className="rounded-lg border border-border p-3">
        <summary className="cursor-pointer text-[12.5px] font-medium text-red-700 dark:text-red-400">
          Turn off two-factor authentication
        </summary>
        <form action={disableAction} className="mt-3 space-y-3">
          <Field label="Current password" htmlFor="disable-password">
            <Input id="disable-password" name="password" type="password" autoComplete="current-password" required />
          </Field>
          <Field label="Authenticator or recovery code" htmlFor="disable-code" hint="Proves you still hold the second factor.">
            <Input id="disable-code" name="code" required />
          </Field>
          <SubmitButton pending={disabling} variant="danger">
            <ShieldOff className="h-3.5 w-3.5" /> Turn off
          </SubmitButton>
        </form>
      </details>
    </div>
  );
}
