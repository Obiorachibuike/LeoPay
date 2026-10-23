import { db } from "@/lib/db/client";
import { runMigrations } from "@/lib/db/migrate";
import { sql } from "drizzle-orm";

let ready: Promise<void> | undefined;

/** Creates the schema once per test process (single in-memory Postgres). */
export function ensureSchema(): Promise<void> {
  ready ??= runMigrations(db);
  return ready;
}

/** Truncates every application table between tests. */
export async function resetDb(): Promise<void> {
  await ensureSchema();
  await db.execute(sql`
    truncate table
      journal_postings, journal_entries, ledger_accounts,
      reconciliation_exceptions, reconciliation_runs,
      payout_events, payouts, beneficiaries,
      inventory_movements, order_items, orders, products, storefronts,
      invoice_items, invoice_sequences, invoices,
      refunds, payments, payment_links, customers,
      webhook_deliveries, webhook_endpoints, webhook_events,
      idempotency_keys, api_keys, audit_logs, notifications, support_tickets,
      invitations, memberships, organizations, verification_tokens, sessions, users,
      rate_limits, platform_settings
    restart identity cascade
  `);
}
