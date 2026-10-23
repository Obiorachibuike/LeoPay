"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import {
  createOrganizationAction,
  updateBusinessDetailsAction,
  updatePayoutPolicyAction,
  type OrgFormState,
} from "@/app/actions/organization";
import { Field, Input, Select } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { CURRENCIES } from "@/lib/money";
import type { Organization } from "@/lib/db/schema";

const initial: OrgFormState = { ok: false, message: "" };

export function NewOrganizationForm() {
  const [state, action, pending] = useActionState(createOrganizationAction, initial);
  const router = useRouter();

  useEffect(() => {
    if (state.ok && state.redirectTo) router.push(state.redirectTo);
  }, [state, router]);

  return (
    <form action={action} className="space-y-4">
      {state.message && !state.ok ? <Alert tone="danger">{state.message}</Alert> : null}
      <Field label="Business name" htmlFor="name" error={state.errors?.name} hint="This appears on invoices and checkout pages.">
        <Input id="name" name="name" required placeholder="Acme Ventures Ltd" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Business email" htmlFor="businessEmail" error={state.errors?.businessEmail}>
          <Input id="businessEmail" name="businessEmail" type="email" placeholder="billing@acme.ng" />
        </Field>
        <Field label="Business phone" htmlFor="businessPhone" error={state.errors?.businessPhone}>
          <Input id="businessPhone" name="businessPhone" placeholder="+234 801 234 5678" />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Business type" htmlFor="businessType" error={state.errors?.businessType}>
          <Select id="businessType" name="businessType" defaultValue="sole_proprietorship">
            <option value="sole_proprietorship">Sole proprietorship</option>
            <option value="limited_company">Limited company</option>
            <option value="freelancer">Freelancer / individual</option>
            <option value="ngo">NGO / non-profit</option>
            <option value="other">Other</option>
          </Select>
        </Field>
        <Field label="Default currency" htmlFor="defaultCurrency" error={state.errors?.defaultCurrency}>
          <Select id="defaultCurrency" name="defaultCurrency" defaultValue="NGN">
            {Object.values(CURRENCIES)
              .filter((c) => c.enabled)
              .map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} — {c.name}
                </option>
              ))}
          </Select>
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Country" htmlFor="countryCode" error={state.errors?.countryCode}>
          <Select id="countryCode" name="countryCode" defaultValue="NG">
            <option value="NG">Nigeria</option>
          </Select>
        </Field>
        <Field label="Website" htmlFor="website" optional error={state.errors?.website}>
          <Input id="website" name="website" placeholder="https://acme.ng" />
        </Field>
      </div>
      <SubmitButton pending={pending} className="w-full sm:w-auto">
        Create workspace
      </SubmitButton>
    </form>
  );
}

export function BusinessDetailsForm({ organization }: { organization: Organization }) {
  const [state, action, pending] = useActionState(updateBusinessDetailsAction, initial);
  return (
    <form action={action} className="space-y-4">
      {state.message ? <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert> : null}
      <Field label="Business name" htmlFor="biz-name" error={state.errors?.name}>
        <Input id="biz-name" name="name" defaultValue={organization.name} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Business email" htmlFor="biz-email" error={state.errors?.businessEmail}>
          <Input id="biz-email" name="businessEmail" type="email" defaultValue={organization.businessEmail ?? ""} />
        </Field>
        <Field label="Business phone" htmlFor="biz-phone" error={state.errors?.businessPhone}>
          <Input id="biz-phone" name="businessPhone" defaultValue={organization.businessPhone ?? ""} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Business type" htmlFor="biz-type" error={state.errors?.businessType}>
          <Select id="biz-type" name="businessType" defaultValue={organization.businessType ?? "sole_proprietorship"}>
            <option value="sole_proprietorship">Sole proprietorship</option>
            <option value="limited_company">Limited company</option>
            <option value="freelancer">Freelancer / individual</option>
            <option value="ngo">NGO / non-profit</option>
            <option value="other">Other</option>
          </Select>
        </Field>
        <Field label="Website" htmlFor="biz-web" optional error={state.errors?.website}>
          <Input id="biz-web" name="website" defaultValue={organization.website ?? ""} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Settlement bank" htmlFor="biz-bank" optional error={state.errors?.settlementBankName}>
          <Input id="biz-bank" name="settlementBankName" defaultValue={organization.settlementBankName ?? ""} placeholder="GTBank" />
        </Field>
        <Field label="Account name" htmlFor="biz-acct-name" optional>
          <Input id="biz-acct-name" name="settlementAccountName" defaultValue={organization.settlementAccountName ?? ""} />
        </Field>
        <Field label="Account number" htmlFor="biz-acct-no" optional hint="Only the last 4 digits are stored.">
          <Input id="biz-acct-no" name="settlementAccountNumber" inputMode="numeric" placeholder="0123456789" />
        </Field>
      </div>
      <SubmitButton pending={pending}>Save business details</SubmitButton>
    </form>
  );
}

export function PayoutPolicyForm({ organization }: { organization: Organization }) {
  const [state, action, pending] = useActionState(updatePayoutPolicyAction, initial);
  return (
    <form action={action} className="space-y-4">
      {state.message ? <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Approval threshold"
          htmlFor="threshold"
          hint="Payouts at or above this amount need a second approver."
          error={state.errors?.threshold}
        >
          <Input
            id="threshold"
            name="approvalThreshold"
            type="number"
            step="0.01"
            min="0"
            defaultValue={(organization.payoutApprovalThresholdMinor / 100).toFixed(2)}
          />
        </Field>
        <Field label="24-hour payout limit" htmlFor="daily" hint="Maximum total payouts in any 24-hour window.">
          <Input
            id="daily"
            name="dailyLimit"
            type="number"
            step="0.01"
            min="0"
            defaultValue={(organization.payoutDailyLimitMinor / 100).toFixed(2)}
          />
        </Field>
      </div>
      <SubmitButton pending={pending} variant="secondary">
        Save payout policy
      </SubmitButton>
    </form>
  );
}
