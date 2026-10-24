/**
 * Dashboard and reporting queries. Every number is derived from persisted
 * records scoped to one organization. Collections, provider fees, refunds,
 * payouts and ledger balances are reported separately — they are not
 * interchangeable and no figure here represents a withdrawable balance.
 */
import { and, count, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  invoices,
  payments,
  payoutEvents,
  payouts,
  paymentLinks,
  customers,
  orders,
  products,
  storefronts,
  type Payment,
} from "@/lib/db/schema";
import { getBalances } from "@/lib/ledger";

export type OverviewMetrics = {
  grossCollectedMinor: number;
  providerFeesMinor: number;
  netCollectedMinor: number;
  refundedMinor: number;
  successfulCount: number;
  pendingCount: number;
  failedCount: number;
  averagePaymentMinor: number;
  successRate: number;
  payoutsSucceededMinor: number;
  payoutsPendingMinor: number;
  outstandingInvoiceMinor: number;
  activePaymentLinks: number;
  customerCount: number;
  orderCount: number;
  productCount: number;
  storefrontPublished: boolean;
};

export async function getOverviewMetrics(input: {
  organizationId: string;
  currency: string;
  from: Date;
  to: Date;
}): Promise<OverviewMetrics> {
  const scope = and(
    eq(payments.organizationId, input.organizationId),
    eq(payments.currency, input.currency),
    gte(payments.createdAt, input.from),
    lte(payments.createdAt, input.to),
  );

  const [totals] = await db
    .select({
      gross: sql<number>`coalesce(sum(case when ${payments.status} = 'succeeded' then ${payments.amountMinor} else 0 end), 0)::bigint`,
      fees: sql<number>`coalesce(sum(case when ${payments.status} = 'succeeded' then coalesce(${payments.feeMinor}, 0) else 0 end), 0)::bigint`,
      succeeded: sql<number>`count(*) filter (where ${payments.status} = 'succeeded')::int`,
      pending: sql<number>`count(*) filter (where ${payments.status} in ('created','pending','processing'))::int`,
      failed: sql<number>`count(*) filter (where ${payments.status} in ('failed','cancelled','expired'))::int`,
    })
    .from(payments)
    .where(scope);

  const [refundsRow] = await db
    .select({
      total: sql<number>`coalesce(sum(${payments.amountMinor}), 0)::bigint`,
    })
    .from(payments)
    .where(
      and(
        eq(payments.organizationId, input.organizationId),
        eq(payments.currency, input.currency),
        sql`${payments.status} = 'refunded'`,
        gte(payments.createdAt, input.from),
        lte(payments.createdAt, input.to),
      ),
    );

  const [payoutRows] = await db
    .select({
      succeeded: sql<number>`coalesce(sum(case when ${payouts.status} = 'succeeded' then ${payouts.amountMinor} else 0 end), 0)::bigint`,
      pending: sql<number>`coalesce(sum(case when ${payouts.status} in ('requested','pending_approval','approved','processing') then ${payouts.amountMinor} else 0 end), 0)::bigint`,
    })
    .from(payouts)
    .where(
      and(
        eq(payouts.organizationId, input.organizationId),
        eq(payouts.currency, input.currency),
        gte(payouts.createdAt, input.from),
        lte(payouts.createdAt, input.to),
      ),
    );

  const [invoicesRow] = await db
    .select({
      outstanding: sql<number>`coalesce(sum(${invoices.totalMinor} - ${invoices.amountPaidMinor}), 0)::bigint`,
    })
    .from(invoices)
    .where(
      and(
        eq(invoices.organizationId, input.organizationId),
        eq(invoices.currency, input.currency),
        sql`${invoices.status} in ('issued','partially_paid','overdue')`,
      ),
    );

  const [linkRow] = await db
    .select({ value: count() })
    .from(paymentLinks)
    .where(and(eq(paymentLinks.organizationId, input.organizationId), eq(paymentLinks.status, "active")));

  const [customerRow] = await db
    .select({ value: count() })
    .from(customers)
    .where(eq(customers.organizationId, input.organizationId));

  const [orderRow] = await db
    .select({ value: count() })
    .from(orders)
    .where(and(eq(orders.organizationId, input.organizationId), eq(orders.status, "paid")));

  const [productRow] = await db
    .select({ value: count() })
    .from(products)
    .where(and(eq(products.organizationId, input.organizationId), eq(products.status, "active")));

  const [storefrontRow] = await db
    .select({ status: storefronts.status })
    .from(storefronts)
    .where(eq(storefronts.organizationId, input.organizationId))
    .limit(1);

  const gross = Number(totals?.gross ?? 0);
  const fees = Number(totals?.fees ?? 0);
  const succeeded = Number(totals?.succeeded ?? 0);
  const failed = Number(totals?.failed ?? 0);

  return {
    grossCollectedMinor: gross,
    providerFeesMinor: fees,
    netCollectedMinor: gross - fees,
    refundedMinor: Number(refundsRow?.total ?? 0),
    successfulCount: succeeded,
    pendingCount: Number(totals?.pending ?? 0),
    failedCount: failed,
    averagePaymentMinor: succeeded > 0 ? Math.round(gross / succeeded) : 0,
    successRate: succeeded + failed > 0 ? succeeded / (succeeded + failed) : 0,
    payoutsSucceededMinor: Number(payoutRows?.succeeded ?? 0),
    payoutsPendingMinor: Number(payoutRows?.pending ?? 0),
    outstandingInvoiceMinor: Number(invoicesRow?.outstanding ?? 0),
    activePaymentLinks: Number(linkRow?.value ?? 0),
    customerCount: Number(customerRow?.value ?? 0),
    orderCount: Number(orderRow?.value ?? 0),
    productCount: Number(productRow?.value ?? 0),
    storefrontPublished: storefrontRow?.status === "published",
  };
}

export type TimeseriesPoint = { date: string; collectedMinor: number; successfulCount: number };

/**
 * Daily collections series. Uses generate_series so empty days appear as zero.
 *
 * Timestamps are bound as ISO strings with an explicit cast: postgres.js only
 * serialises `Date` values inside its own query builder, so a `Date` bound into
 * a raw `sql` template would be handled by Node's Buffer conversion instead.
 * PGlite accepted it; a real PostgreSQL server does not.
 */
export async function getCollectionsTimeseries(input: {
  organizationId: string;
  currency: string;
  from: Date;
  to: Date;
}): Promise<TimeseriesPoint[]> {
  const rows = await db.execute<{ day: string; collected: string; successes: string }>(sql`
    with days as (
      select generate_series(
        date_trunc('day', ${input.from.toISOString()}::timestamptz),
        date_trunc('day', ${input.to.toISOString()}::timestamptz),
        interval '1 day'
      ) as day
    )
    select
      to_char(days.day, 'YYYY-MM-DD') as day,
      coalesce(sum(p.amount_minor) filter (where p.status = 'succeeded'), 0)::bigint as collected,
      coalesce(count(p.id) filter (where p.status = 'succeeded'), 0)::int as successes
    from days
    left join payments p
      on date_trunc('day', p.created_at) = days.day
      and p.organization_id = ${input.organizationId}
      and p.currency = ${input.currency}
    group by days.day
    order by days.day asc
  `);

  const list = ((rows as unknown as { rows?: unknown[] }).rows ?? (rows as unknown as unknown[])) as Array<{
    day: string;
    collected: string | number;
    successes: string | number;
  }>;

  return list.map((row) => ({
    date: row.day,
    collectedMinor: Number(row.collected),
    successfulCount: Number(row.successes),
  }));
}

export async function getMethodBreakdown(input: { organizationId: string; currency: string; from: Date; to: Date }) {
  const rows = await db
    .select({
      method: sql<string>`coalesce(${payments.paymentMethod}, 'unknown')`,
      total: sql<number>`coalesce(sum(${payments.amountMinor}), 0)::bigint`,
      count: sql<number>`count(*)::int`,
    })
    .from(payments)
    .where(
      and(
        eq(payments.organizationId, input.organizationId),
        eq(payments.currency, input.currency),
        sql`${payments.status} = 'succeeded'`,
        gte(payments.createdAt, input.from),
        lte(payments.createdAt, input.to),
      ),
    )
    .groupBy(sql`coalesce(${payments.paymentMethod}, 'unknown')`);

  return rows.map((r) => ({ method: r.method, totalMinor: Number(r.total), count: Number(r.count) }));
}

export async function getRecentPayments(organizationId: string, limit = 6): Promise<Payment[]> {
  return db
    .select()
    .from(payments)
    .where(eq(payments.organizationId, organizationId))
    .orderBy(desc(payments.createdAt))
    .limit(limit);
}

export async function getLedgerSummary(organizationId: string, currency: string) {
  const balances = await getBalances(organizationId, currency);
  return {
    accounts: balances,
    clearingMinor: balances.find((b) => b.code === "1000")?.balanceMinor ?? 0,
    revenueMinor: balances.find((b) => b.code === "4000")?.balanceMinor ?? 0,
    refundsMinor: balances.find((b) => b.code === "4010")?.balanceMinor ?? 0,
    feesMinor: balances.find((b) => b.code === "5000")?.balanceMinor ?? 0,
    payoutsMinor: balances.find((b) => b.code === "3100")?.balanceMinor ?? 0,
  };
}

export type ReportRow = {
  id: string;
  createdAt: Date;
  reference: string;
  customer: string | null;
  amountMinor: number;
  feeMinor: number | null;
  netMinor: number | null;
  currency: string;
  status: string;
  method: string | null;
  channel: string | null;
  provider: string;
};

export async function getTransactionReport(input: {
  organizationId: string;
  from: Date;
  to: Date;
  status?: string;
  currency?: string;
  search?: string;
  limit?: number;
}): Promise<ReportRow[]> {
  const conditions = [
    eq(payments.organizationId, input.organizationId),
    gte(payments.createdAt, input.from),
    lte(payments.createdAt, input.to),
  ];
  if (input.status && input.status !== "all") {
    if (input.status === "pending") {
      conditions.push(sql`${payments.status} in ('created','pending','processing')`);
    } else if (input.status === "failed") {
      conditions.push(sql`${payments.status} in ('failed','cancelled','expired')`);
    } else {
      conditions.push(sql`${payments.status} = ${input.status}`);
    }
  }
  if (input.currency && input.currency !== "all") {
    conditions.push(eq(payments.currency, input.currency));
  }
  if (input.search) {
    const term = `%${input.search.replace(/[%_]/g, "")}%`;
    conditions.push(
      sql`(${payments.internalReference} ilike ${term} or coalesce(${payments.customerEmail},'') ilike ${term} or coalesce(${payments.customerName},'') ilike ${term} or coalesce(${payments.providerReference},'') ilike ${term})`,
    );
  }

  const rows = await db
    .select({
      id: payments.id,
      createdAt: payments.createdAt,
      reference: payments.internalReference,
      customer: sql<string | null>`coalesce(${payments.customerName}, ${payments.customerEmail}, 'Guest')`,
      amountMinor: payments.amountMinor,
      feeMinor: payments.feeMinor,
      netMinor: payments.netMinor,
      currency: payments.currency,
      status: payments.status,
      method: payments.paymentMethod,
      channel: payments.channel,
      provider: payments.provider,
    })
    .from(payments)
    .where(and(...conditions))
    .orderBy(desc(payments.createdAt))
    .limit(input.limit ?? 1000);

  return rows as ReportRow[];
}

export async function getPayoutHistory(organizationId: string, limit = 5) {
  return db
    .select({
      id: payouts.id,
      reference: payouts.internalReference,
      amountMinor: payouts.amountMinor,
      currency: payouts.currency,
      status: payouts.status,
      createdAt: payouts.createdAt,
    })
    .from(payouts)
    .where(eq(payouts.organizationId, organizationId))
    .orderBy(desc(payouts.createdAt))
    .limit(limit);
}

export async function getPayoutActivity(organizationId: string, limit = 8) {
  return db
    .select({
      id: payoutEvents.id,
      type: payoutEvents.type,
      message: payoutEvents.message,
      createdAt: payoutEvents.createdAt,
      reference: payouts.internalReference,
    })
    .from(payoutEvents)
    .innerJoin(payouts, eq(payouts.id, payoutEvents.payoutId))
    .where(eq(payouts.organizationId, organizationId))
    .orderBy(desc(payoutEvents.createdAt))
    .limit(limit);
}
