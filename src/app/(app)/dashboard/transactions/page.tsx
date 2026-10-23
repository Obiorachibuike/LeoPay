import Link from "next/link";
import { Download, RefreshCw } from "lucide-react";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { reconciliationExceptions, reconciliationRuns } from "@/lib/db/schema";
import { requirePermission } from "@/lib/auth/context";
import { getTransactionReport } from "@/services/analytics";
import { resolveRange } from "@/lib/dates";
import { formatDateTime } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { TableWrap, Th, Td, Tr } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { ActionButton } from "@/components/ui/action-button";
import { runReconciliationAction, resolveExceptionAction } from "@/app/actions/payments";
import { queryString } from "@/lib/utils";

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; status?: string; q?: string }>;
}) {
  const ctx = await requirePermission("payment:read");
  const params = await searchParams;
  const range = resolveRange("custom", params.from, params.to);

  const rows = await getTransactionReport({
    organizationId: ctx.organization.id,
    from: range.from,
    to: range.to,
    status: params.status,
    search: params.q,
    limit: 500,
  });

  const exceptions = await db
    .select()
    .from(reconciliationExceptions)
    .where(and(eq(reconciliationExceptions.organizationId, ctx.organization.id), eq(reconciliationExceptions.status, "open")))
    .orderBy(desc(reconciliationExceptions.createdAt))
    .limit(20);

  const [lastRun] = await db
    .select()
    .from(reconciliationRuns)
    .where(eq(reconciliationRuns.organizationId, ctx.organization.id))
    .orderBy(desc(reconciliationRuns.startedAt))
    .limit(1);

  const exportUrl = `/api/exports/transactions${queryString({
    from: range.from.toISOString().slice(0, 10),
    to: range.to.toISOString().slice(0, 10),
    status: params.status,
    q: params.q,
  })}`;

  const totals = rows.reduce(
    (acc, row) => {
      if (row.status === "succeeded") {
        acc.gross += row.amountMinor;
        acc.fees += row.feeMinor ?? 0;
      }
      return acc;
    },
    { gross: 0, fees: 0 },
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Transactions & reconciliation"
        description="Searchable transaction history with exports scoped to your organization."
        actions={
          <ButtonLink href={exportUrl} variant="secondary" size="sm">
            <Download className="h-3.5 w-3.5" /> Export CSV
          </ButtonLink>
        }
      />

      <Card>
        <CardBody>
          <form className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto]" action="/dashboard/transactions">
            <label className="text-[12px] text-muted">
              From
              <input type="date" name="from" defaultValue={range.from.toISOString().slice(0, 10)} className="mt-1 h-9 w-full rounded-lg border border-border bg-surface px-2 text-[12.5px] text-foreground" />
            </label>
            <label className="text-[12px] text-muted">
              To
              <input type="date" name="to" defaultValue={range.to.toISOString().slice(0, 10)} className="mt-1 h-9 w-full rounded-lg border border-border bg-surface px-2 text-[12.5px] text-foreground" />
            </label>
            <label className="text-[12px] text-muted">
              Search
              <input name="q" defaultValue={params.q} placeholder="Reference, customer, provider ref" className="mt-1 h-9 w-full rounded-lg border border-border bg-surface px-2 text-[12.5px] text-foreground" />
            </label>
            <button type="submit" className="mt-auto h-9 rounded-lg bg-[var(--brand)] px-4 text-[12.5px] font-medium text-[var(--brand-foreground)]">
              Apply
            </button>
          </form>
          <div className="mt-3 flex flex-wrap gap-4 text-[12px] text-muted">
            <span>Records: <strong className="text-foreground">{rows.length}</strong></span>
            <span>Gross collected: <strong className="text-foreground tabular">{formatMoney(totals.gross, ctx.organization.defaultCurrency)}</strong></span>
            <span>Provider fees: <strong className="text-foreground tabular">{formatMoney(totals.fees, ctx.organization.defaultCurrency)}</strong></span>
          </div>
        </CardBody>
      </Card>

      <Card>
        <TableWrap>
          <thead>
            <tr><Th>Date</Th><Th>Reference</Th><Th>Customer</Th><Th>Status</Th><Th>Method</Th><Th align="right">Amount</Th><Th align="right">Fee</Th></tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><Td className="text-muted">No transactions in this range.</Td><Td /><Td /><Td /><Td /><Td /><Td /></tr>
            ) : (
              rows.map((row) => (
                <Tr key={row.id}>
                  <Td className="whitespace-nowrap text-muted">{formatDateTime(row.createdAt)}</Td>
                  <Td><Link href={`/dashboard/payments/${row.id}`} className="font-mono text-[11.5px] text-accent hover:underline">{row.reference}</Link></Td>
                  <Td className="max-w-[160px] truncate">{row.customer ?? "Guest"}</Td>
                  <Td><StatusBadge status={row.status} /></Td>
                  <Td className="capitalize text-muted">{row.method?.replaceAll("_", " ") ?? "—"}</Td>
                  <Td align="right">{formatMoney(row.amountMinor, row.currency)}</Td>
                  <Td align="right" className="text-muted">{row.feeMinor !== null ? formatMoney(row.feeMinor, row.currency) : "—"}</Td>
                </Tr>
              ))
            )}
          </tbody>
        </TableWrap>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader
            title="Reconciliation"
            description="Compares internal records, ledger postings and provider state."
            action={<span className="text-[11px] text-muted">{lastRun ? `Last run ${formatDateTime(lastRun.startedAt)}` : "Never run"}</span>}
          />
          <CardBody className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <ActionButton action={runReconciliationAction.bind(null, false)}>
                <RefreshCw className="h-3.5 w-3.5" /> Run internal checks
              </ActionButton>
              <ActionButton action={runReconciliationAction.bind(null, true)} confirm="This re-verifies in-flight payments with the provider (up to 25). Continue?">
                Verify in-flight with provider
              </ActionButton>
            </div>
            <p className="text-[11.5px] leading-relaxed text-muted">
              Reconciliation never rewrites financial records. It records exceptions for review; settlement still happens
              only through provider verification.
            </p>
            {lastRun ? (
              <div className="rounded-lg border border-border bg-surface-2/50 p-3 text-[12px]">
                <p>Status: <span className="font-medium capitalize">{lastRun.status}</span></p>
                <p className="text-muted">{lastRun.checkedCount} records checked · {lastRun.exceptionCount} exceptions</p>
              </div>
            ) : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Open exceptions" description={`${exceptions.length} open`} />
          <CardBody className="space-y-2">
            {exceptions.length === 0 ? (
              <p className="text-[12.5px] text-muted">No open exceptions. Run reconciliation to check for mismatches.</p>
            ) : (
              exceptions.map((exception) => (
                <div key={exception.id} className="rounded-lg border border-border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[12.5px] font-medium capitalize">{exception.type.replaceAll("_", " ")}</p>
                    <StatusBadge status={exception.severity} />
                  </div>
                  <p className="mt-1 text-[12px] text-muted">{exception.description}</p>
                  <div className="mt-2 flex gap-2">
                    <ActionButton action={resolveExceptionAction.bind(null, exception.id, "resolved")} size="sm">Resolve</ActionButton>
                    <ActionButton action={resolveExceptionAction.bind(null, exception.id, "ignored")} size="sm" variant="ghost">Ignore</ActionButton>
                  </div>
                </div>
              ))
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
