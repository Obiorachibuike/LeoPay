"use client";

import { resendVerificationFromSettingsAction } from "@/app/actions/settings";
import { ActionButton } from "@/components/ui/action-button";
import { Alert } from "@/components/ui/feedback";

export function VerifyEmailPanel({ email }: { email: string }) {
  return (
    <div className="space-y-2">
      <Alert tone="warning" title="Your email is not verified">
        Some actions (API keys, live payments) require a verified email. We can send a verification link to {email}.
      </Alert>
      <ActionButton action={resendVerificationFromSettingsAction}>Send verification email</ActionButton>
    </div>
  );
}
