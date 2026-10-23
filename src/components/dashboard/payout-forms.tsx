"use client";

import { useActionState, useState } from "react";
import { createBeneficiaryAction, requestPayoutAction } from "@/app/actions/payouts";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import type { ActionResult } from "@/lib/actions";
import { formatMoney } from "@/lib/money";

const initial: ActionResult = { ok: false, message: "" };

export function BeneficiaryForm({
  banks,
  banksAvailable,
}: {
  banks: Array<{ code: string; name: string }>;
  banksAvailable: boolean;
}) {
  const [state, action, pending] = useActionState(createBeneficiaryAction, initial);
  const [bankCode, setBankCode] = useState("");

  return (
    <form action={action} className="space-y-4">
      {state.message ? <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert> : null}
      {!banksAvailable ? (
        <Alert tone="warning" title="Provider not configured">
          Beneficiary verification and payouts require a configured payment provider with payout capability.
        </Alert>
      ) : null}
      <Field label="Beneficiary name" htmlFor="ben-name" error={state.errors?.name}>
        <Input id="ben-name" name="name" required placeholder="Ada Obi" />
      </Field>
      <Field label="Bank" htmlFor="ben-bank" error={state.errors?.bankCode}>
        <Select
          id="ben-bank"
          name="bankCode"
          required
          value={bankCode}
          onChange={(event) => setBankCode(event.target.value)}
        >
          <option value="" disabled>
            Select a bank
          </option>
          {banks.map((bank) => (
            <option key={bank.code} value={bank.code}>
              {bank.name}
            </option>
          ))}
        </Select>
      </Field>
      <input type="hidden" name="bankName" value={banks.find((b) => b.code === bankCode)?.name ?? ""} />
      <Field label="Account number" htmlFor="ben-account" error={state.errors?.accountNumber} hint="The account name is resolved with your provider before saving.">
        <Input id="ben-account" name="accountNumber" inputMode="numeric" pattern="\d{10}" maxLength={10} required />
      </Field>
      <SubmitButton pending={pending} disabled={!banksAvailable}>
        Verify and save beneficiary
      </SubmitButton>
    </form>
  );
}

export function PayoutRequestForm({
  beneficiaries,
  availableMinor,
  currency,
  approvalThresholdMinor,
  canRequest,
}: {
  beneficiaries: Array<{ id: string; name: string; accountName: string; last4: string; bankName: string }>;
  availableMinor: number;
  currency: string;
  approvalThresholdMinor: number;
  canRequest: boolean;
}) {
  const [state, action, pending] = useActionState(requestPayoutAction, initial);

  return (
    <form action={action} className="space-y-4">
      {state.message ? <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert> : null}
      <div className="rounded-lg border border-border bg-surface-2/50 p-3 text-[12.5px]">
        <div className="flex justify-between">
          <span className="text-muted">Available from settled collections</span>
          <span className="font-semibold tabular">{formatMoney(availableMinor, currency)}</span>
        </div>
        <p className="mt-1 text-[11.5px] text-muted">
          Estimate derived from verified transactions and the ledger — not a provider-confirmed balance. Provider
          settlement timing may differ.
        </p>
      </div>
      <Field label="Beneficiary" htmlFor="pay-ben" error={state.errors?.beneficiaryId}>
        <Select id="pay-ben" name="beneficiaryId" required defaultValue="">
          <option value="" disabled>
            Select a beneficiary
          </option>
          {beneficiaries.map((beneficiary) => (
            <option key={beneficiary.id} value={beneficiary.id}>
              {beneficiary.name} · {beneficiary.bankName} ····{beneficiary.last4}
            </option>
          ))}
        </Select>
      </Field>
      <Field
        label="Amount"
        htmlFor="pay-amount"
        error={state.errors?.amountMinor}
        hint={`Payouts of ${formatMoney(approvalThresholdMinor, currency)} or more need a second approver.`}
      >
        <Input id="pay-amount" name="amount" type="number" step="0.01" min="1" required />
      </Field>
      <input type="hidden" name="currency" value={currency} />
      <Field label="Reason" htmlFor="pay-reason" optional>
        <Textarea id="pay-reason" name="reason" rows={2} placeholder="Contractor payment — October" />
      </Field>
      <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
      <SubmitButton pending={pending} disabled={!canRequest || beneficiaries.length === 0}>
        Request payout
      </SubmitButton>
      {beneficiaries.length === 0 ? (
        <p className="text-[11.5px] text-muted">Add a verified beneficiary before requesting a payout.</p>
      ) : null}
    </form>
  );
}
