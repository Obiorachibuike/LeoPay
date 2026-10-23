"use client";

import { useActionState } from "react";
import { inviteMemberAction, type InviteResult } from "@/app/actions/team";
import { Field, Input, Select } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { ROLE_DESCRIPTIONS, ROLES, ROLE_LABELS } from "@/lib/auth/rbac";
import { CopyButton } from "@/components/ui/copy-button";

const initial: InviteResult = { ok: false, message: "" };

export function InviteMemberForm() {
  const [state, action, pending] = useActionState(inviteMemberAction, initial);
  return (
    <form action={action} className="space-y-4">
      {state.message ? <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert> : null}
      {state.invitationUrl ? (
        <Alert tone="info" title="Development invitation link">
          <span className="break-all font-mono text-[11.5px]">{state.invitationUrl}</span>
          <div className="mt-2">
            <CopyButton value={state.invitationUrl} label="Copy invitation link" />
          </div>
        </Alert>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-[1fr_180px_auto] sm:items-end">
        <Field label="Email address" htmlFor="invite-email" error={state.errors?.email}>
          <Input id="invite-email" name="email" type="email" required placeholder="teammate@company.com" />
        </Field>
        <Field label="Role" htmlFor="invite-role">
          <Select id="invite-role" name="role" defaultValue="viewer">
            {ROLES.filter((role) => role !== "owner").map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}
              </option>
            ))}
          </Select>
        </Field>
        <SubmitButton pending={pending}>Send invitation</SubmitButton>
      </div>
      <div className="grid gap-2 rounded-lg border border-border bg-surface-2/40 p-3 sm:grid-cols-2">
        {ROLES.filter((role) => role !== "owner").map((role) => (
          <p key={role} className="text-[11.5px] text-muted">
            <span className="font-medium text-foreground">{ROLE_LABELS[role]}:</span> {ROLE_DESCRIPTIONS[role]}
          </p>
        ))}
      </div>
    </form>
  );
}
