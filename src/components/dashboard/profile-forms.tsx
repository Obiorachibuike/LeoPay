"use client";

import { useActionState } from "react";
import { useTransition } from "react";
import { removeAvatarAction, removeLogoAction, uploadAvatarAction, uploadLogoAction } from "@/app/actions/uploads";
import type { ActionResult } from "@/lib/actions";
import { Field, Input } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";

const initial: ActionResult = { ok: false, message: "" };

const accept = "image/png,image/jpeg,image/webp,image/gif";
const fileClasses =
  "file:mr-3 file:rounded-md file:border-0 file:bg-surface-2 file:px-3 file:py-1.5 file:text-[12px] file:text-foreground";

export function LogoUploadForm({ logoUrl, name }: { logoUrl: string | null; name: string }) {
  const [state, action, pending] = useActionState(uploadLogoAction, initial);
  const [removing, startRemove] = useTransition();

  return (
    <div className="space-y-3">
      {state.message ? <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert> : null}
      <div className="flex items-center gap-3">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt={`${name} logo`} className="h-14 w-14 rounded-lg border border-border object-contain bg-white" />
        ) : (
          <div className="flex h-14 w-14 items-center justify-center rounded-lg border border-dashed border-border text-[11px] text-muted">
            No logo
          </div>
        )}
        <div className="text-[11.5px] text-muted">
          <p>Shown on invoices, receipts and your storefront.</p>
          <p>PNG, JPEG, WebP or GIF up to 4 MB.</p>
        </div>
      </div>
      <form action={action} className="flex flex-wrap items-end gap-3">
        <Field label="Upload logo" htmlFor="logo-file" optional className="min-w-[220px] flex-1">
          <Input id="logo-file" name="logo" type="file" accept={accept} required className={fileClasses} />
        </Field>
        <SubmitButton pending={pending} variant="secondary">
          Save logo
        </SubmitButton>
      </form>
      {logoUrl ? (
        <button
          type="button"
          className="text-[12px] text-muted underline underline-offset-2 hover:text-danger disabled:opacity-50"
          disabled={removing}
          onClick={() =>
            startRemove(async () => {
              await removeLogoAction();
            })
          }
        >
          Remove logo
        </button>
      ) : null}
    </div>
  );
}

export function AvatarUploadForm({ avatarUrl, name }: { avatarUrl: string | null; name: string }) {
  const [state, action, pending] = useActionState(uploadAvatarAction, initial);
  const [removing, startRemove] = useTransition();

  return (
    <div className="space-y-3">
      {state.message ? <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert> : null}
      <div className="flex items-center gap-3">
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt={`${name} avatar`} className="h-12 w-12 rounded-full border border-border object-cover" />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-[13px] font-medium text-muted">
            {name.slice(0, 1).toUpperCase()}
          </div>
        )}
        <p className="text-[11.5px] text-muted">
          Your profile photo inside LeoPay. It is visible to teammates who share a workspace with you.
        </p>
      </div>
      <form action={action} className="flex flex-wrap items-end gap-3">
        <Field label="Upload photo" htmlFor="avatar-file" optional className="min-w-[220px] flex-1">
          <Input id="avatar-file" name="avatar" type="file" accept={accept} required className={fileClasses} />
        </Field>
        <SubmitButton pending={pending} variant="secondary">
          Save photo
        </SubmitButton>
      </form>
      {avatarUrl ? (
        <button
          type="button"
          className="text-[12px] text-muted underline underline-offset-2 hover:text-danger disabled:opacity-50"
          disabled={removing}
          onClick={() =>
            startRemove(async () => {
              await removeAvatarAction();
            })
          }
        >
          Remove photo
        </button>
      ) : null}
    </div>
  );
}
