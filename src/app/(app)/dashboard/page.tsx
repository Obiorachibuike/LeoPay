import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Banknote,
  ChartNoAxesCombined,
  CreditCard,
  FileText,
  Link2,
  Plus,
  ShieldAlert,
  Wallet,
} from "lucide-react";
import { and, count, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { invoices, paymentLinks, payments } from "@/lib/db/schema";
import { requireOrgContext } from "@/lib/auth/context";
import { hasPermission } from "@/lib/auth/rbac";
import { getCollectionsTimeseries, getLedgerSummary, getMethodBreakdown, getOverviewMetrics, getRecentPayments } from "@/services/analytics";
import { formatMoney } from "@/lib/money";
import { resolveRange, type RangeKey } from "@/lib/dates";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat";
import { CollectionsChart } from "@/components/charts/collections-chart";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { TableWrap, Th, Td, Tr } from "@/components/ui/table";
import { EmptyState, Alert } from "@/components/ui/feedback";
import { OnboardingChecklist } from "@/components/dashboard/onboarding-checklist";
import { providerStatus } from "@/lib/providers";
import { timeAgo } from "@/lib/dates";
import { cn } from "@/lib/utils";

const ranges: Array<{ key: RangeKey; label: string }> = [
  { key: "today", label: "Today" },
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "90d", label: "90 days" },
];

export default async function OverviewPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const ctx = await requireOrgContext();
  const params = await searchParams;
  const rangeKey = (["today", "7d", "30d", "90d"].includes(params.range ?? "") ? params.range : "30d") as RangeKey;
  const range = resolveRange(rangeKey);
  const currency = ctx.organization.defaultCurrency;

  const [metrics, series, methods, recent, ledger, linkCount, invoiceCount] = await Promise.all([
    getOverviewMetrics({ organizationId: ctx.organization.id, currency, from: range.from, to: range.to }),
    getCollectionsTimeseries({ organizationId: ctx.organization.id, currency, from: range.from, to: range.to }),
    getMethodBreakdown({ organizationId: ctx.organization.id, currency, from: range.from, to: range.to }),
    getRecentPayments(ctx.organization.id, 6),
    getLedgerSummary(ctx.organization.id, currency),
    db.select({ value: count() }).from(paymentLinks).where(eq(paymentLinks.organizationId, ctx.organization.id)),
    db.select({ value: count() }).from(invoices).where(eq(invoices.organizationId, ctx.organization.id)),
  ]);

  const provider = providerStatus().find((p) => p.active);
  const hasActivity = Number(linkCount[0]?.value ?? 0) > 0 || Number(invoiceCount[0]?.value ?? 0) > 0;
  const canWritePayments = hasPermission(ctx.role, "payment:write");
  const canWriteInvoices = hasPermission(ctx.role, "invoice:write");
  const canReadPayouts = hasPermission(ctx.role, "payout:read");

  const [pendingPayments] = await db
    .select({ value: count() })
    .from(payments)
    .where(and(eq(payments.organizationId, ctx.organization.id), sql`${payments.status} in ('created','pending','processing')`));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={ctx.organization.name}
        title="Overview"
        description="A verified view of what you collected, what it cost and what is still outstanding."
        actions={
          <>
            {canWritePayments ? (
              <ButtonLink href="/dashboard/payment-links/new" size="sm">
                <Plus className="h-3.5 w-3.5" /> New payment link
              </ButtonLink>
            ) : null}
            {canWriteInvoices ? (
              <ButtonLink href="/dashboard/invoices/new" size="sm" variant="secondary">
                <FileText className="h-3.5 w-3.5" /> New invoice
              </ButtonLink>
            ) : null}
          </>
        }
      />

      {provider?.name === "mock" ? (
        <Alert tone="warning" title="Test payments mode">
          This deployment is using the test payment provider. Payments created now are clearly marked test transactions
          and are never presented as live money. Configure a live provider in Settings → Payments before accepting real
          payments.
        </Alert>
      ) : null}

      {!ctx.user.emailVerifiedAt ? (
        <Alert tone="info" title="Verify your email address">
          Verify your email to create API keys and enable payout flows.{" "}
          <Link href="/dashboard/settings#security" className="font-medium underline">
            Resend verification
          </Link>
        </Alert>
      ) : null}

      {ctx.organization.status === "active" && ctx.organization.verificationStatus !== "verified" ? (
        <Alert tone="info" title="Business verification not completed">
          Live payment capability depends on your payment provider&apos;s approval of your business.{" "}
          <Link href="/dashboard/settings#business" className="font-medium underline">
            Review business details
          </Link>
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center gap-1 rounded-lg border border-border bg-surface p-1">
        {ranges.map((item) => (
          <Link
            key={item.key}
            href={`/dashboard?range=${item.key}`}
            className={cn(
              "rounded-md px-3 py-1.5 text-[12.5px] font-medium transition-colors",
              rangeKey === item.key ? "bg-surface-3 text-foreground" : "text-muted hover:text-foreground",
            )}
          >
            {item.label}
          </Link>
        ))}
        <span className="ml-auto hidden px-2 text-[11px] text-muted sm:block">
          All metrics computed from verified records in {currency}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Gross collected"
          value={formatMoney(metrics.grossCollectedMinor, currency)}
          hint={`${metrics.successfulCount} successful payment${metrics.successfulCount === 1 ? "" : "s"}`}
          icon={<Banknote className="h-4 w-4" />}
          tone="accent"
        />
        <StatCard
          label="Net after provider fees"
          value={formatMoney(metrics.netCollectedMinor, currency)}
          hint={`Fees ${formatMoney(metrics.providerFeesMinor, currency)}`}
          icon={<CreditCard className="h-4 w-4" />}
        />
        <StatCard
          label="Awaiting payment"
          value={formatMoney(metrics.outstandingInvoiceMinor, currency)}
          hint="Issued, partially paid and overdue invoices"
          icon={<FileText className="h-4 w-4" />}
          tone="warning"
        />
        <StatCard
          label="Success rate"
          value={`${(metrics.successRate * 100).toFixed(1)}%`}
          hint={`${metrics.failedCount} failed or cancelled · ${Number(pendingPayments?.value ?? 0)} in progress`}
          icon={<ChartNoAxesCombined className="h-4 w-4" />}
        />
      </div>

      {!hasActivity ? (
        <Card>
          <CardBody className="p-0">
            <EmptyState
              icon={<Link2 className="h-5 w-5" />}
              title="No payments yet"
              description="Create your first payment link or invoice to start collecting. Your dashboard will fill in as soon as a payment is verified — nothing here is fabricated."
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  {canWritePayments ? <ButtonLink href="/dashboard/payment-links/new">Create payment link</ButtonLink> : null}
                  {canWriteInvoices ? (
                    <ButtonLink href="/dashboard/invoices/new" variant="secondary">
                      Create invoice
                    </ButtonLink>
                  ) : null}
                </div>
              }
            />
          </CardBody>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
            <Card>
              <CardHeader
                title="Collections"
                description={`${ranges.find((r) => r.key === rangeKey)?.label} · successful payments only`}
                action={<Badge tone="neutral">{formatMoney(metrics.grossCollectedMinor, currency)}</Badge>}
              />
              <CardBody className="pt-4">
                <CollectionsChart data={series} currency={currency} />
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Payment methods" description="Verified successful payments in this period" />
              <CardBody className="space-y-3">
                {methods.length === 0 ? (
                  <p className="text-[13px] text-muted">No successful payments in this period.</p>
                ) : (
                  methods.map((method) => {
                    const total = methods.reduce((sum, m) => sum + m.totalMinor, 0);
                    const share = total ? (method.totalMinor / total) * 100 : 0;
                    return (
                      <div key={method.method}>
                        <div className="flex items-baseline justify-between text-[12.5px]">
                          <span className="capitalize text-muted-strong">{method.method.replaceAll("_", " ")}</span>
                          <span className="tabular font-medium">{formatMoney(method.totalMinor, currency)}</span>
                        </div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
                          <div className="h-full rounded-full bg-accent" style={{ width: `${share}%` }} />
                        </div>
                      </div>
                    );
                  })
                )}
                <div className="mt-4 space-y-2 border-t border-border pt-3 text-[12px]">
                  <div className="flex justify-between">
                    <span className="text-muted">Refunds</span>
                    <span className="tabular">{formatMoney(metrics.refundedMinor, currency)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted">Average payment</span>
                    <span className="tabular">{formatMoney(metrics.averagePaymentMinor, currency)}</span>
                  </div>
                </div>
              </CardBody>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
            <Card>
              <CardHeader
                title="Recent payments"
                action={
                  <Link href="/dashboard/payments" className="text-[12.5px] font-medium text-accent hover:underline">
                    View all
                  </Link>
                }
              />
              <TableWrap>
                <thead>
                  <tr>
                    <Th>Reference</Th>
                    <Th>Customer</Th>
                    <Th>Status</Th>
                    <Th align="right">Amount</Th>
                  </tr>
                </thead>
                <tbody>
                  {recent.length === 0 ? (
                    <tr>
                      <Td className="text-center text-muted" align="left">
                        No payments yet.
                      </Td>
                      <Td />
                      <Td />
                      <Td />
                    </tr>
                  ) : (
                    recent.map((payment) => (
                      <Tr key={payment.id}>
                        <Td>
                          <Link href={`/dashboard/payments/${payment.id}`} className="font-mono text-[11.5px] text-accent hover:underline">
                            {payment.internalReference.slice(0, 16)}…
                          </Link>
                          <span className="ml-2 text-[11px] text-muted">{timeAgo(payment.createdAt)}</span>
                        </Td>
                        <Td className="max-w-[160px] truncate">{payment.customerName ?? payment.customerEmail ?? "Guest"}</Td>
                        <Td>
                          <StatusBadge status={payment.status} />
                        </Td>
                        <Td align="right">{formatMoney(payment.amountMinor, payment.currency)}</Td>
                      </Tr>
                    ))
                  )}
                </tbody>
              </TableWrap>
            </Card>

            <div className="space-y-4">
              <OnboardingChecklist
                organization={ctx.organization}
                emailVerified={Boolean(ctx.user.emailVerifiedAt)}
                paymentLinks={Number(linkCount[0]?.value ?? 0)}
                invoices={Number(invoiceCount[0]?.value ?? 0)}
                providerConfigured={provider?.configured ?? false}
                providerConfiguredLabel={provider?.displayName ?? "Payment provider"}
              />
              <Card>
                <CardHeader title="Ledger summary" description="Balanced double-entry postings" />
                <CardBody className="space-y-2 text-[12.5px]">
                  {[
                    { label: "Provider clearing", value: ledger.clearingMinor, hint: "Settled, not yet paid out" },
                    { label: "Revenue", value: ledger.revenueMinor, hint: "Gross sales recognised" },
                    { label: "Provider fees", value: ledger.feesMinor, hint: "Expense" },
                    { label: "Refunds", value: ledger.refundsMinor, hint: "Contra-revenue" },
                    { label: "Payouts", value: ledger.payoutsMinor, hint: "Settled transfers" },
                  ].map((row) => (
                    <div key={row.label} className="flex items-baseline justify-between gap-3">
                      <span className="text-muted">
                        {row.label}
                        <span className="block text-[10.5px]">{row.hint}</span>
                      </span>
                      <span className="tabular font-medium">{formatMoney(row.value, currency)}</span>
                    </div>
                  ))}
                  <p className="border-t border-border pt-2 text-[11px] leading-relaxed text-muted">
                    Clearing is not a withdrawable balance. Payout eligibility is calculated separately from verified
                    collections and provider settlement.
                  </p>
                </CardBody>
              </Card>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              {
                icon: <Plus className="h-4 w-4" />,
                title: "Create payment link",
                href: "/dashboard/payment-links/new",
                show: canWritePayments,
              },
              { icon: <FileText className="h-4 w-4" />, title: "Create invoice", href: "/dashboard/invoices/new", show: canWriteInvoices },
              { icon: <Wallet className="h-4 w-4" />, title: "Request payout", href: "/dashboard/payouts", show: canReadPayouts },
              { icon: <BadgeCheck className="h-4 w-4" />, title: "Review business", href: "/dashboard/settings#business", show: true },
            ]
              .filter((action) => action.show)
              .map((action) => (
                <Link
                  key={action.title}
                  href={action.href}
                  className="surface-card group flex items-center justify-between p-4 transition-colors hover:border-border-strong"
                >
                  <span className="flex items-center gap-2.5 text-[13px] font-medium">
                    <span className="text-accent">{action.icon}</span>
                    {action.title}
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 text-muted transition-transform group-hover:translate-x-0.5" />
                </Link>
              ))}
          </div>
        </>
      )}

      {!provider?.configured ? (
        <Alert tone="warning" title="Payments are not configured">
          <span className="inline-flex items-start gap-2">
            <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            Checkout is disabled until a payment provider is configured. LeoPay will never simulate a successful live
            payment. See <Link href="/dashboard/settings#payments" className="underline">Settings → Payments</Link> and
            the deployment guide for environment variables.
          </span>
        </Alert>
      ) : null}
    </div>
  );
}
