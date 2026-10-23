import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download, Mail, Send } from "lucide-react";
import { requirePermission } from "@/lib/auth/context";
import { hasPermission } from "@/lib/auth/rbac";
import { getInvoiceWithItems } from "@/services/invoices";
import { formatDate, formatDateTime } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { env } from "@/lib/env";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { CopyButton } from "@/components/ui/copy-button";
import { ActionButton } from "@/components/ui/action-button";
import { ButtonLink } from "@/components/ui/button";
import { sendInvoiceAction, setInvoiceStatusAction } from "@/app/actions/invoices";
import { InvoicePrintButton } from "@/components/dashboard/invoice-print-button";

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission("invoice:read");
  const { id } = await params;
  const data = await getInvoiceWithItems(ctx.organization.id, id);
  if (!data) notFound();
  const { invoice, items } = data;
  const canWrite = hasPermission(ctx.role, "invoice:write");
  const publicUrl = `${env.appUrl}/pay/invoice/${invoice.publicReference}`;
  const outstanding = Math.max(0, invoice.totalMinor - invoice.amountPaidMinor);

  return (
    <div className="space-y-5">
      <Link href="/dashboard/invoices" className="inline-flex items-center gap-1.5 text-[12.5px] text-muted hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Invoices
      </Link>
      <PageHeader
        eyebrow="Invoice"
        title={invoice.invoiceNumber}
        description={`${invoice.customerName ?? invoice.customerEmail ?? ""}`}
        actions={
          <>
            <StatusBadge status={invoice.status} />
            <a
              href={`/api/invoices/${invoice.id}/pdf`}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-[12.5px] font-medium hover:bg-surface-2"
            >
              <Download className="h-3.5 w-3.5" /> PDF
            </a>
            <InvoicePrintButton />
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <Card className="print-sheet">
          <CardBody className="space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.08em] text-muted">From</p>
                <p className="mt-1 text-[15px] font-semibold">{ctx.organization.name}</p>
                <p className="text-[12.5px] text-muted">{ctx.organization.businessEmail}</p>
                <p className="text-[12.5px] text-muted">{ctx.organization.businessPhone}</p>
              </div>
              <div className="text-right">
                <p className="text-[11px] uppercase tracking-[0.08em] text-muted">Invoice {invoice.invoiceNumber}</p>
                <p className="mt-1 text-[26px] font-semibold tabular">{formatMoney(invoice.totalMinor, invoice.currency)}</p>
                <p className="text-[12px] text-muted">Issued {formatDate(invoice.issueDate)}</p>
                <p className="text-[12px] text-muted">Due {invoice.dueDate ? formatDate(invoice.dueDate) : "On receipt"}</p>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-surface-2/40 p-3">
              <p className="text-[11px] uppercase tracking-[0.08em] text-muted">Bill to</p>
              <p className="mt-1 text-[13.5px] font-medium">{invoice.customerName}</p>
              {invoice.customerEmail ? <p className="text-[12.5px] text-muted">{invoice.customerEmail}</p> : null}
            </div>

            <table className="w-full text-left text-[13px]">
              <thead className="text-[11px] uppercase tracking-[0.06em] text-muted">
                <tr>
                  <th className="py-2">Description</th>
                  <th className="py-2 text-right">Qty</th>
                  <th className="py-2 text-right">Unit</th>
                  <th className="py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-t border-border">
                    <td className="py-2">{item.description}</td>
                    <td className="py-2 text-right tabular">{Number(item.quantity)}</td>
                    <td className="py-2 text-right tabular">{formatMoney(item.unitAmountMinor, invoice.currency)}</td>
                    <td className="py-2 text-right tabular">{formatMoney(item.amountMinor, invoice.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="ml-auto max-w-xs space-y-1 text-[13px]">
              <div className="flex justify-between text-muted"><span>Subtotal</span><span className="tabular">{formatMoney(invoice.subtotalMinor, invoice.currency)}</span></div>
              <div className="flex justify-between text-muted"><span>Discount</span><span className="tabular">−{formatMoney(invoice.discountMinor, invoice.currency)}</span></div>
              <div className="flex justify-between text-muted"><span>Tax ({invoice.taxRateBps / 100}%)</span><span className="tabular">{formatMoney(invoice.taxMinor, invoice.currency)}</span></div>
              <div className="flex justify-between border-t border-border pt-1 font-semibold"><span>Total</span><span className="tabular">{formatMoney(invoice.totalMinor, invoice.currency)}</span></div>
              <div className="flex justify-between text-muted"><span>Paid</span><span className="tabular">{formatMoney(invoice.amountPaidMinor, invoice.currency)}</span></div>
              <div className="flex justify-between font-semibold"><span>Outstanding</span><span className="tabular">{formatMoney(outstanding, invoice.currency)}</span></div>
            </div>

            {invoice.notes ? <p className="border-t border-border pt-3 text-[12.5px] text-muted">{invoice.notes}</p> : null}
            {invoice.terms ? <p className="text-[12px] text-muted">Terms: {invoice.terms}</p> : null}
          </CardBody>
        </Card>

        <div className="space-y-4 no-print">
          <Card>
            <CardHeader title="Share and send" />
            <CardBody className="space-y-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.06em] text-muted">Public payment page</p>
                <p className="mt-1 break-all rounded bg-surface-2 px-2 py-1.5 font-mono text-[11px]">{publicUrl}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <CopyButton value={publicUrl} label="Copy link" />
                  {invoice.status !== "draft" ? (
                    <ButtonLink href={`/pay/invoice/${invoice.publicReference}`} target="_blank" size="sm" variant="secondary">
                      Preview
                    </ButtonLink>
                  ) : null}
                </div>
              </div>
              {canWrite && invoice.status !== "paid" ? (
                <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                  <ActionButton action={sendInvoiceAction.bind(null, invoice.id, false)}>
                    <Mail className="h-3.5 w-3.5" /> Email invoice
                  </ActionButton>
                  {invoice.status !== "draft" ? (
                    <ActionButton action={sendInvoiceAction.bind(null, invoice.id, true)}>
                      <Send className="h-3.5 w-3.5" /> Send reminder
                    </ActionButton>
                  ) : null}
                </div>
              ) : null}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Status" description="Invoices become paid only through verified payment." />
            <CardBody className="space-y-2 text-[12.5px]">
              <p className="text-muted">Sent: {invoice.sentAt ? formatDateTime(invoice.sentAt) : "Not sent"}</p>
              <p className="text-muted">Last reminder: {invoice.lastReminderAt ? formatDateTime(invoice.lastReminderAt) : "None"}</p>
              {canWrite && invoice.status === "draft" ? (
                <ActionButton action={setInvoiceStatusAction.bind(null, invoice.id, "issued")} variant="primary">
                  Issue invoice
                </ActionButton>
              ) : null}
              {canWrite && invoice.status !== "paid" && invoice.status !== "cancelled" ? (
                <ActionButton
                  action={setInvoiceStatusAction.bind(null, invoice.id, "cancelled")}
                  variant="danger"
                  confirm="Cancel this invoice? This cannot be undone, and a paid invoice can never be cancelled."
                >
                  Cancel invoice
                </ActionButton>
              ) : null}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
