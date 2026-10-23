"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { createInvoiceAction, type InvoiceFormState } from "@/app/actions/invoices";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Button, SubmitButton } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { CURRENCIES, formatMoney, multiplyMinor } from "@/lib/money";

const initial: InvoiceFormState = { ok: false, message: "" };

type LineItem = { description: string; quantity: string; unitAmount: string };

export function InvoiceEditor() {
  const [state, action, pending] = useActionState(createInvoiceAction, initial);
  const router = useRouter();
  const [items, setItems] = useState<LineItem[]>([{ description: "", quantity: "1", unitAmount: "" }]);
  const [discount, setDiscount] = useState("0");
  const [taxRate, setTaxRate] = useState("0");
  const [currency, setCurrency] = useState("NGN");

  useEffect(() => {
    if (state.ok && state.redirectTo) router.push(state.redirectTo);
  }, [state, router]);

  const parsedItems = items.map((item) => ({
    description: item.description,
    quantity: Number(item.quantity) || 0,
    unitAmountMinor: Math.round((Number(item.unitAmount) || 0) * 100),
  }));

  const subtotal = parsedItems.reduce((sum, item) => sum + multiplyMinor(item.unitAmountMinor, item.quantity), 0);
  const discountMinor = Math.round((Number(discount) || 0) * 100);
  const taxable = Math.max(0, subtotal - discountMinor);
  const taxMinor = Math.round((taxable * (Number(taxRate) || 0)) / 100);
  const total = taxable + taxMinor;

  const today = new Date().toISOString().slice(0, 10);

  return (
    <form action={action} className="space-y-5">
      {state.message && !state.ok ? <Alert tone="danger">{state.message}</Alert> : null}
      <input type="hidden" name="items" value={JSON.stringify(parsedItems)} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Customer name" htmlFor="customerName" error={state.errors?.customerName}>
          <Input id="customerName" name="customerName" required maxLength={160} />
        </Field>
        <Field label="Customer email" htmlFor="customerEmail" error={state.errors?.customerEmail}>
          <Input id="customerEmail" name="customerEmail" type="email" placeholder="billing@customer.com" />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Currency" htmlFor="currency" error={state.errors?.currency}>
          <Select id="currency" name="currency" value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {Object.values(CURRENCIES)
              .filter((c) => c.enabled)
              .map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code}
                </option>
              ))}
          </Select>
        </Field>
        <Field label="Issue date" htmlFor="issueDate" error={state.errors?.issueDate}>
          <Input id="issueDate" name="issueDate" type="date" defaultValue={today} required />
        </Field>
        <Field label="Due date" htmlFor="dueDate" optional error={state.errors?.dueDate}>
          <Input id="dueDate" name="dueDate" type="date" defaultValue={new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10)} />
        </Field>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[13px] font-medium text-foreground">Line items</span>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setItems((prev) => [...prev, { description: "", quantity: "1", unitAmount: "" }])}
          >
            <Plus className="h-3.5 w-3.5" /> Add item
          </Button>
        </div>
        <div className="space-y-2">
          {items.map((item, index) => (
            <div key={index} className="grid gap-2 rounded-lg border border-border bg-surface-2/40 p-2.5 sm:grid-cols-[1fr_80px_130px_auto]">
              <Input
                aria-label={`Item ${index + 1} description`}
                placeholder="Description"
                value={item.description}
                onChange={(e) =>
                  setItems((prev) => prev.map((it, i) => (i === index ? { ...it, description: e.target.value } : it)))
                }
                required
              />
              <Input
                aria-label={`Item ${index + 1} quantity`}
                type="number"
                step="0.001"
                min="0.001"
                value={item.quantity}
                onChange={(e) => setItems((prev) => prev.map((it, i) => (i === index ? { ...it, quantity: e.target.value } : it)))}
                required
              />
              <Input
                aria-label={`Item ${index + 1} unit price`}
                type="number"
                step="0.01"
                min="0"
                placeholder="Unit price"
                value={item.unitAmount}
                onChange={(e) => setItems((prev) => prev.map((it, i) => (i === index ? { ...it, unitAmount: e.target.value } : it)))}
                required
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remove item ${index + 1}`}
                disabled={items.length === 1}
                onClick={() => setItems((prev) => prev.filter((_, i) => i !== index))}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
        {state.errors?.items ? <p className="mt-1 text-[12px] text-[var(--danger)]">{state.errors.items[0]}</p> : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Discount" htmlFor="discount" hint="Applied before tax." error={state.errors?.discountMinor}>
          <Input id="discount" name="discount" type="number" step="0.01" min="0" value={discount} onChange={(e) => setDiscount(e.target.value)} />
        </Field>
        <Field label="Tax rate (%)" htmlFor="taxRate" error={state.errors?.taxRateBps}>
          <Input id="taxRate" name="taxRate" type="number" step="0.01" min="0" max="50" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Notes" htmlFor="notes" optional>
          <Textarea id="notes" name="notes" rows={2} placeholder="Thank you for your business." />
        </Field>
        <Field label="Payment terms" htmlFor="terms" optional>
          <Textarea id="terms" name="terms" rows={2} placeholder="Payment due within 14 days." />
        </Field>
      </div>

      <div className="rounded-xl border border-border bg-surface-2/50 p-4 text-[13px]">
        <div className="flex justify-between py-0.5 text-muted">
          <span>Subtotal</span>
          <span className="tabular">{formatMoney(subtotal, currency)}</span>
        </div>
        <div className="flex justify-between py-0.5 text-muted">
          <span>Discount</span>
          <span className="tabular">−{formatMoney(discountMinor, currency)}</span>
        </div>
        <div className="flex justify-between py-0.5 text-muted">
          <span>Tax ({taxRate || 0}%)</span>
          <span className="tabular">{formatMoney(taxMinor, currency)}</span>
        </div>
        <div className="mt-2 flex justify-between border-t border-border pt-2 text-[14px] font-semibold">
          <span>Total</span>
          <span className="tabular">{formatMoney(total, currency)}</span>
        </div>
        <p className="mt-2 text-[11.5px] text-muted">Totals are recalculated and validated on the server before the invoice is saved.</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pending={pending} name="status" value="draft" variant="secondary">
          Save as draft
        </SubmitButton>
        <SubmitButton pending={pending} name="status" value="issued">
          Save and issue
        </SubmitButton>
        <p className="text-[11.5px] text-muted">Issuing makes the invoice payable and shareable.</p>
      </div>
    </form>
  );
}
