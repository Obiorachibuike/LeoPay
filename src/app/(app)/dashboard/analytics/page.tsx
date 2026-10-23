import Link from "next/link";
import { requirePermission } from "@/lib/auth/context";
import { getCollectionsTimeseries, getMethodBreakdown, getOverviewMetrics, getPayoutHistory } from "@/services/analytics";
import { resolveRange, formatDate, formatDateTime } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/feedback";
import { CollectionsChart } from "@/components/charts/collections-chart";
import { cn, queryString } from "@/lib/utils";

const ranges = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
];

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const ctx = await requirePermission("report:read");
  const params = await searchParams;
  const rangeKey = (ranges.find((r) => r.value === params.range)?.value ?? "30d") as "today" | "7d" | "30d" | "90d";
  const range = resolveRange(rangeKey);
  const currency = ctx.organization.defaultCurrency;

  const [metrics, series, methods, payoutHistory] = await Promise.all([
    getOverviewMetrics({ organizationId: ctx.organization.id, currency, from: range.from, to: range.to }),
    getCollectionsTimeseries({ organizationId: ctx.organization.id, currency, from: range.from, to: range.to }),
    getMethodBreakdown({ organizationId: ctx.organization.id, currency, from: range.from, to: range.to }),
    getPayoutHistory(ctx.organization.id, 8),
  ]);

  const methodTotal = methods.reduce((sum, row) => sum + row.totalMinor, 0);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Analytics"
        description="Figures come from your persisted transactions for the selected period. Provider fees are only those reported by the provider."
        actions={
          <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-surface p-1">
            {ranges.map((item) => (
              <Link
                key={item.value}
                href={`/dashboard/analytics${queryString({ range: item.value })}`}
                className={cn(
                  "rounded-md px-2.5 py-1.5 text-[12px] font-medium",
                  rangeKey === item.value ? "bg-surface-3 text-foreground" : "text-muted hover:text-foreground",
                )}
              >
                {item.label}
              </Link>
            ))}
          </div>
        }
      />

      <p className="text-[11.5px] text-muted">
        {formatDate(range.from)} → {formatDate(range.to)}
      </p>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Gross collected" value={formatMoney(metrics.grossCollectedMinor, currency)} hint={`${metrics.successfulCount} successful payment(s)`} tone="accent" />
        <StatCard label="Net after fees & refunds" value={formatMoney(metrics.netCollectedMinor, currency)} hint={`Fees ${formatMoney(metrics.providerFeesMinor, currency)} · refunds ${formatMoney(metrics.refundedMinor, currency)}`} />
        <StatCard label="Success rate" value={`${metrics.successRate.toFixed(1)}%`} hint={`${metrics.failedCount} failed · ${metrics.pendingCount} pending`} />
        <StatCard label="Average payment" value={formatMoney(metrics.averagePaymentMinor, currency)} hint="Among successful payments" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <Card>
          <CardHeader title="Daily collections" description="Successful payments per day (settled value)." />
          <CardBody>
            {metrics.successfulCount === 0 ? (
              <p className="py-10 text-center text-[12.5px] text-muted">No successful payments in this period.</p>
            ) : (
              <CollectionsChart data={series} currency={currency} />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Payment methods" description="Share of collected value." />
          <CardBody className="space-y-3">
            {methods.length === 0 ? (
              <p className="text-[12.5px] text-muted">No successful payments in this period.</p>
            ) : (
              methods
                .slice()
                .sort((a, b) => b.totalMinor - a.totalMinor)
                .map((row) => {
                  const share = methodTotal > 0 ? (row.totalMinor / methodTotal) * 100 : 0;
                  return (
                    <div key={row.method}>
                      <div className="flex items-center justify-between text-[12.5px]">
                        <span className="capitalize">{row.method.replaceAll("_", " ")}</span>
                        <span className="tabular text-muted">{formatMoney(row.totalMinor, currency)}</span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
                        <div className="h-full rounded-full bg-[var(--brand)]" style={{ width: `${share}%` }} />
                      </div>
                      <p className="mt-1 text-[10.5px] text-muted">{row.count} payment(s) · {share.toFixed(1)}%</p>
                    </div>
                  );
                })
            )}
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Outstanding invoices" value={formatMoney(metrics.outstandingInvoiceMinor, currency)} hint="Issued and not fully paid" />
        <StatCard label="Payouts settled" value={formatMoney(metrics.payoutsSucceededMinor, currency)} />
        <StatCard label="Payouts pending" value={formatMoney(metrics.payoutsPendingMinor, currency)} hint="Requested or in flight" />
        <StatCard label="Customers" value={metrics.customerCount} hint={`${metrics.orderCount} order(s)`} />
      </div>

      <Card>
        <CardHeader title="Payout activity" description="Payouts are not collections — they are shown separately." />
        {payoutHistory.length === 0 ? (
          <CardBody>
            <EmptyState title="No payouts yet" description="Requested payouts will appear here with their provider status." />
          </CardBody>
        ) : (
          <CardBody className="divide-y divide-border">
            {payoutHistory.map((payout) => (
              <div key={payout.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-[12.5px]">
                <span className="font-mono text-[11.5px] text-muted">{payout.reference}</span>
                <span className="flex items-center gap-3">
                  <span className="text-muted">{formatDateTime(payout.createdAt)}</span>
                  <span className="tabular font-medium">{formatMoney(payout.amountMinor, payout.currency)}</span>
                  <StatusBadge status={payout.status} />
                </span>
              </div>
            ))}
          </CardBody>
        )}
      </Card>
    </div>
  );
}
