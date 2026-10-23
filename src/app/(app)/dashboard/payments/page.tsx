import Link from "next/link";
import { CreditCard, Download } from "lucide-react";
import { requirePermission } from "@/lib/auth/context";
import { getTransactionReport } from "@/services/analytics";
import { resolveRange } from "@/lib/dates";
import { formatDateTime } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { TableWrap, Th, Td, Tr } from "@/components/ui/table";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/feedback";
import { ButtonLink } from "@/components/ui/button";
import { cn, queryString } from "@/lib/utils";

const statuses = [
  { value: "all", label: "All" },
  { value: "succeeded", label: "Succeeded" },
  { value: "pending", label: "In progress" },
  { value: "failed", label: "Failed" },
  { value: "refunded", label: "Refunded" },
];

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; range?: string }>;
}) {
  const ctx = await requirePermission("payment:read");
  const params = await searchParams;
  const status = params.status ?? "all";
  const range = resolveRange("90d");
  const rows = await getTransactionReport({
    organizationId: ctx.organization.id,
    from: range.from,
    to: range.to,
    status,
    search: params.q,
    limit: 200,
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title="Payments"
        description="Every payment record for this workspace. A payment is only successful when the provider confirms it."
        actions={
          <ButtonLink href={`/api/exports/transactions?${queryString({ status, q: params.q })}`} variant="secondary" size="sm">
            <Download className="h-3.5 w-3.5" /> Export CSV
          </ButtonLink>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-surface p-1">
          {statuses.map((item) => (
            <Link
              key={item.value}
              href={`/dashboard/payments${queryString({ status: item.value, q: params.q })}`}
              className={cn(
                "rounded-md px-2.5 py-1.5 text-[12px] font-medium",
                status === item.value ? "bg-surface-3 text-foreground" : "text-muted hover:text-foreground",
              )}
            >
              {item.label}
            </Link>
          ))}
        </div>
        <form className="flex w-full gap-2 sm:w-auto" action="/dashboard/payments">
          <input type="hidden" name="status" value={status} />
          <input
            name="q"
            defaultValue={params.q}
            placeholder="Search reference, customer, provider ref"
            className="h-9 w-full rounded-lg border border-border bg-surface px-3 text-[12.5px] sm:w-72"
            aria-label="Search payments"
          />
          <button type="submit" className="rounded-lg border border-border bg-surface px-3 text-[12.5px] font-medium hover:bg-surface-2">
            Search
          </button>
        </form>
      </div>

      <Card>
        {rows.length === 0 ? (
          <EmptyState
            icon={<CreditCard className="h-5 w-5" />}
            title="No payments match"
            description="Payments appear here as soon as a customer starts checkout. Successful payments are verified with the provider before they are recorded."
            action={<ButtonLink href="/dashboard/payment-links/new">Create a payment link</ButtonLink>}
          />
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Reference</Th>
                <Th>Customer</Th>
                <Th>Status</Th>
                <Th>Method</Th>
                <Th>Provider</Th>
                <Th>Created</Th>
                <Th align="right">Amount</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <Tr key={row.id}>
                  <Td>
                    <Link href={`/dashboard/payments/${row.id}`} className="font-mono text-[11.5px] text-accent hover:underline">
                      {row.reference}
                    </Link>
                  </Td>
                  <Td className="max-w-[180px] truncate">{row.customer ?? "Guest"}</Td>
                  <Td>
                    <span className="flex items-center gap-1.5">
                      <StatusBadge status={row.status} />
                      {row.provider === "mock" ? <Badge tone="neutral" className="text-[9.5px]">TEST</Badge> : null}
                    </span>
                  </Td>
                  <Td className="capitalize text-muted">{row.method?.replaceAll("_", " ") ?? "—"}</Td>
                  <Td className="capitalize text-muted">{row.provider}</Td>
                  <Td className="whitespace-nowrap text-muted">{formatDateTime(row.createdAt)}</Td>
                  <Td align="right">
                    <span className="font-medium">{formatMoney(row.amountMinor, row.currency)}</span>
                    {row.feeMinor !== null && row.status === "succeeded" ? (
                      <span className="block text-[10.5px] text-muted">fee {formatMoney(row.feeMinor, row.currency)}</span>
                    ) : null}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>
      <p className="text-[11.5px] text-muted">
        Showing the most recent 200 records from the last 90 days. Use the transaction report for date-filtered exports.
      </p>
    </div>
  );
}
