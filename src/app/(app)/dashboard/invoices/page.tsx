import Link from "next/link";
import { FileText, Plus } from "lucide-react";
import { requirePermission } from "@/lib/auth/context";
import { listInvoices, refreshOverdueInvoices } from "@/services/invoices";
import { formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { TableWrap, Th, Td, Tr } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { cn, queryString } from "@/lib/utils";

const filters = [
  { value: "", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "issued", label: "Issued" },
  { value: "overdue", label: "Overdue" },
  { value: "paid", label: "Paid" },
];

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const ctx = await requirePermission("invoice:read");
  const params = await searchParams;
  await refreshOverdueInvoices(ctx.organization.id);
  const { rows, total } = await listInvoices(ctx.organization.id, { page: 1, pageSize: 100, status: params.status });

  return (
    <div className="space-y-5">
      <PageHeader
        title="Invoices"
        description="Itemised invoices with server-validated totals. An invoice becomes paid only when a payment is verified."
        actions={ctx.permissions.includes("invoice:write") ? <ButtonLink href="/dashboard/invoices/new" size="sm"><Plus className="h-3.5 w-3.5" /> New invoice</ButtonLink> : null}
      />
      <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-surface p-1">
        {filters.map((filter) => (
          <Link
            key={filter.label}
            href={`/dashboard/invoices${queryString({ status: filter.value })}`}
            className={cn(
              "rounded-md px-2.5 py-1.5 text-[12px] font-medium",
              (params.status ?? "") === filter.value ? "bg-surface-3 text-foreground" : "text-muted hover:text-foreground",
            )}
          >
            {filter.label}
          </Link>
        ))}
        <span className="ml-auto px-2 py-1.5 text-[11px] text-muted">{total} invoice(s)</span>
      </div>
      <Card>
        {rows.length === 0 ? (
          <EmptyState
            icon={<FileText className="h-5 w-5" />}
            title="No invoices yet"
            description="Create an invoice with line items, tax and payment terms. You can export it as PDF and email it to your customer."
            action={ctx.permissions.includes("invoice:write") ? <ButtonLink href="/dashboard/invoices/new">Create an invoice</ButtonLink> : undefined}
          />
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Invoice</Th>
                <Th>Customer</Th>
                <Th>Status</Th>
                <Th>Due</Th>
                <Th align="right">Total</Th>
                <Th align="right">Outstanding</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((invoice) => (
                <Tr key={invoice.id}>
                  <Td>
                    <Link href={`/dashboard/invoices/${invoice.id}`} className="font-medium text-foreground hover:text-accent">
                      {invoice.invoiceNumber}
                    </Link>
                    <span className="block text-[10.5px] text-muted">{formatDate(invoice.issueDate)}</span>
                  </Td>
                  <Td className="max-w-[180px] truncate">{invoice.customerName ?? invoice.customerEmail ?? "—"}</Td>
                  <Td><StatusBadge status={invoice.status} /></Td>
                  <Td className="whitespace-nowrap text-muted">{invoice.dueDate ? formatDate(invoice.dueDate) : "—"}</Td>
                  <Td align="right">{formatMoney(invoice.totalMinor, invoice.currency)}</Td>
                  <Td align="right">
                    {formatMoney(Math.max(0, invoice.totalMinor - invoice.amountPaidMinor), invoice.currency)}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>
    </div>
  );
}
