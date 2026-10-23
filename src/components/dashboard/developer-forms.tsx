"use client";

import { useActionState } from "react";
import { createApiKeyAction, createWebhookAction, type ApiKeyResult, type WebhookResult } from "@/app/actions/developers";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { API_SCOPES } from "@/lib/auth/rbac";
import { MERCHANT_EVENT_TYPES } from "@/lib/events";
import { CopyButton } from "@/components/ui/copy-button";

const initialKey: ApiKeyResult = { ok: false, message: "" };
const initialHook: WebhookResult = { ok: false, message: "" };

export function ApiKeyForm() {
  const [state, action, pending] = useActionState(createApiKeyAction, initialKey);
  return (
    <form action={action} className="space-y-4">
      {state.message ? <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert> : null}
      {state.secret ? (
        <div className="rounded-lg border border-emerald-500/30 bg-accent-soft/60 p-3">
          <p className="text-[12px] font-semibold text-emerald-900 dark:text-emerald-100">
            Copy this key now. It is stored only as a hash and cannot be shown again.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="break-all rounded bg-surface px-2 py-1 font-mono text-[11.5px]">{state.secret}</code>
            <CopyButton value={state.secret} label="Copy key" />
          </div>
        </div>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-[1fr_160px_auto] sm:items-end">
        <Field label="Key name" htmlFor="key-name" error={state.errors?.name}>
          <Input id="key-name" name="name" required placeholder="Production server" />
        </Field>
        <Field label="Environment" htmlFor="key-env" error={state.errors?.environment}>
          <Select id="key-env" name="environment" defaultValue="test">
            <option value="test">Test</option>
            <option value="live">Live</option>
          </Select>
        </Field>
        <SubmitButton pending={pending}>Create key</SubmitButton>
      </div>
      <fieldset>
        <legend className="mb-2 text-[13px] font-medium">Scopes</legend>
        <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {API_SCOPES.map((scope) => (
            <label key={scope} className="flex items-center gap-2 text-[12px] text-muted-strong">
              <input type="checkbox" name="scopes" value={scope} className="h-3.5 w-3.5 accent-[var(--accent)]" />
              <code className="font-mono text-[11.5px]">{scope}</code>
            </label>
          ))}
        </div>
        {state.errors?.scopes ? <p className="mt-1 text-[12px] text-[var(--danger)]">{state.errors.scopes[0]}</p> : null}
      </fieldset>
    </form>
  );
}

export function WebhookForm() {
  const [state, action, pending] = useActionState(createWebhookAction, initialHook);
  return (
    <form action={action} className="space-y-4">
      {state.message ? <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert> : null}
      {state.secret ? (
        <div className="rounded-lg border border-emerald-500/30 bg-accent-soft/60 p-3">
          <p className="text-[12px] font-semibold text-emerald-900 dark:text-emerald-100">
            Signing secret — store it securely and verify every delivery.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="break-all rounded bg-surface px-2 py-1 font-mono text-[11.5px]">{state.secret}</code>
            <CopyButton value={state.secret} label="Copy secret" />
          </div>
        </div>
      ) : null}
      <Field label="Endpoint URL" htmlFor="hook-url" error={state.errors?.url} hint="HTTPS only in production. Private network destinations are rejected.">
        <Input id="hook-url" name="url" type="url" required placeholder="https://api.yourapp.com/leopay/webhook" />
      </Field>
      <Field label="Description" htmlFor="hook-desc" optional>
        <Textarea id="hook-desc" name="description" rows={2} placeholder="Production webhook handler" />
      </Field>
      <fieldset>
        <legend className="mb-2 text-[13px] font-medium">Subscribed events</legend>
        <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {MERCHANT_EVENT_TYPES.map((event) => (
            <label key={event} className="flex items-center gap-2 text-[12px] text-muted-strong">
              <input type="checkbox" name="eventTypes" value={event} className="h-3.5 w-3.5 accent-[var(--accent)]" />
              <code className="font-mono text-[11.5px]">{event}</code>
            </label>
          ))}
        </div>
        {state.errors?.eventTypes ? <p className="mt-1 text-[12px] text-[var(--danger)]">{state.errors.eventTypes[0]}</p> : null}
      </fieldset>
      <SubmitButton pending={pending}>Add endpoint</SubmitButton>
    </form>
  );
}
