import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getInvoiceByPublicReference } from "@/services/invoices";
import { formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { InvoicePayForm } from "@/components/checkout/invoice-pay-form";
import { Alert } from "@/components/ui/feedback";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ reference: string }> }): Promise<Metadata> {
  const { reference } = await params;
  const data = await getInvoiceByPublicReference(reference);
  return { title: data ? `Invoice ${data.invoice.invoiceNumber}` : "Invoice", robots: { index: false, follow: false } };
}

export default async function PublicInvoicePage({ params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  const data = await getInvoiceByPublicReference(reference);
  if (!data) notFound();
  const { invoice, items } = data;
  const outstanding = Math.max(0, invoice.totalMinor - invoice.amountPaidMinor);
  const payable = outstanding > 0 && invoice.status !== "draft" && invoice.status !== "cancelled";

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[12px] uppercase tracking-[0.1em] text-muted">Invoice {invoice.invoiceNumber}</p>
          <h1 className="mt-1 text-[22px] font-semibold">{formatMoney(invoice.totalMinor, invoice.currency)}</h1>
          <p className="text-[12.5px] text-muted">Issued {formatDate(invoice.issueDate)} · Due {invoice.dueDate ? formatDate(invoice.dueDate) : "on receipt"}</p>
        </div>
        <StatusBadge status={invoice.status} />
      </div>

      <Card>
        <CardHeader title={`Bill to ${invoice.customerName ?? ""}`} description={invoice.customerEmail ?? undefined} />
        <CardBody className="space-y-4">
          <table className="w-full text-left text-[13px]">
            <thead className="text-[11px] uppercase tracking-[0.06em] text-muted">
              <tr><th className="py-2">Description</th><th className="py-2 text-right">Qty</th><th className="py-2 text-right">Amount</th></tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-t border-border">
                  <td className="py-2">{item.description}</td>
                  <td className="py-2 text-right tabular">{Number(item.quantity)}</td>
                  <td className="py-2 text-right tabular">{formatMoney(item.amountMinor, invoice.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="ml-auto max-w-xs space-y-1 text-[13px]">
            <div className="flex justify-between text-muted"><span>Subtotal</span><span className="tabular">{formatMoney(invoice.subtotalMinor, invoice.currency)}</span></div>
            {invoice.discountMinor > 0 ? (
              <div className="flex justify-between text-muted"><span>Discount</span><span className="tabular">−{formatMoney(invoice.discountMinor, invoice.currency)}</span></div>
            ) : null}
            <div className="flex justify-between text-muted"><span>Tax</span><span className="tabular">{formatMoney(invoice.taxMinor, invoice.currency)}</span></div>
            <div className="flex justify-between border-t border-border pt-1 font-semibold"><span>Total</span><span className="tabular">{formatMoney(invoice.totalMinor, invoice.currency)}</span></div>
            <div className="flex justify-between text-muted"><span>Paid</span><span className="tabular">{formatMoney(invoice.amountPaidMinor, invoice.currency)}</span></div>
            <div className="flex justify-between font-semibold"><span>Outstanding</span><span className="tabular">{formatMoney(outstanding, invoice.currency)}</span></div>
          </div>
          {invoice.notes ? <p className="border-t border-border pt-3 text-[12px] text-muted">{invoice.notes}</p> : null}
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          {invoice.status === "paid" ? (
            <Alert tone="success" title="Paid in full">Thank you — this invoice has been settled. A receipt has been emailed to {invoice.customerEmail ?? "the billing address"}.</Alert>
          ) : payable ? (
            <InvoicePayForm reference={invoice.publicReference} defaultEmail={invoice.customerEmail} />
          ) : (
            <Alert tone="warning" title="This invoice cannot be paid">
              It is either a draft, cancelled, or has no outstanding balance.
            </Alert>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
