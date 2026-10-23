/**
 * Append-only, double-entry ledger.
 *
 * Postings are immutable: corrections are made with compensating entries and
 * entries are unique per organization reference, so retries cannot double-post.
 * Every entry is validated to balance before it is written.
 */
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { journalEntries, journalPostings, ledgerAccounts } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import type { Database } from "@/lib/db/client";

export type AccountCode =
  | "1000" // Provider clearing (asset): funds held at the payment provider
  | "2000" // Refunds payable (liability): refunds initiated but not yet settled
  | "3100" // Payouts (expense): funds withdrawn from the provider balance
  | "4000" // Sales revenue (revenue)
  | "4010" // Refunds (contra-revenue)
  | "5000"; // Provider processing fees (expense)

const CHART: Record<AccountCode, { name: string; type: "asset" | "liability" | "revenue" | "expense" | "equity" }> = {
  "1000": { name: "Provider clearing", type: "asset" },
  "2000": { name: "Refunds payable", type: "liability" },
  "3100": { name: "Payouts to beneficiaries", type: "expense" },
  "4000": { name: "Sales revenue", type: "revenue" },
  "4010": { name: "Refunds", type: "revenue" },
  "5000": { name: "Provider processing fees", type: "expense" },
};

export type Posting = { code: AccountCode; direction: "debit" | "credit"; amountMinor: number };

async function ensureAccount(tx: Database, organizationId: string, code: AccountCode, currency: string) {
  const [existing] = await tx
    .select()
    .from(ledgerAccounts)
    .where(
      and(
        eq(ledgerAccounts.organizationId, organizationId),
        eq(ledgerAccounts.code, code),
        eq(ledgerAccounts.currency, currency),
      ),
    )
    .limit(1);
  if (existing) return existing;
  const [created] = await tx
    .insert(ledgerAccounts)
    .values({
      organizationId,
      code,
      name: CHART[code].name,
      type: CHART[code].type,
      currency,
    })
    .returning();
  return created!;
}

/**
 * Posts a balanced journal entry. Throws if debits !== credits or if the
 * reference already exists (idempotent by reference).
 */
export async function postEntry(
  tx: Database,
  input: {
    organizationId: string;
    currency: string;
    reference: string;
    description: string;
    sourceType: "payment" | "refund" | "payout";
    sourceId?: string | null;
    occurredAt?: Date;
    postings: Posting[];
  },
): Promise<{ entryId: string; created: boolean }> {
  const debits = input.postings.filter((p) => p.direction === "debit").reduce((s, p) => s + p.amountMinor, 0);
  const credits = input.postings.filter((p) => p.direction === "credit").reduce((s, p) => s + p.amountMinor, 0);

  if (debits !== credits) {
    throw new AppError("UNSAFE_OPERATION", `Unbalanced journal entry: debits ${debits} != credits ${credits}`);
  }
  if (debits === 0) return { entryId: "", created: false };

  for (const posting of input.postings) {
    if (!Number.isInteger(posting.amountMinor) || posting.amountMinor <= 0) {
      throw new AppError("UNSAFE_OPERATION", "Journal posting amounts must be positive integers");
    }
  }

  const [existing] = await tx
    .select({ id: journalEntries.id })
    .from(journalEntries)
    .where(and(eq(journalEntries.organizationId, input.organizationId), eq(journalEntries.reference, input.reference)))
    .limit(1);
  if (existing) return { entryId: existing.id, created: false };

  const [entry] = await tx
    .insert(journalEntries)
    .values({
      organizationId: input.organizationId,
      currency: input.currency,
      reference: input.reference,
      description: input.description,
      sourceType: input.sourceType,
      sourceId: input.sourceId ?? null,
      occurredAt: input.occurredAt ?? new Date(),
    })
    .returning();

  for (const posting of input.postings) {
    const account = await ensureAccount(tx, input.organizationId, posting.code, input.currency);
    await tx.insert(journalPostings).values({
      entryId: entry!.id,
      accountId: account.id,
      direction: posting.direction,
      amountMinor: posting.amountMinor,
      currency: input.currency,
    });
  }

  return { entryId: entry!.id, created: true };
}

export type LedgerBalance = { code: string; name: string; type: string; balanceMinor: number };

/** Signed balances derived from postings (debit-normal vs credit-normal). */
export async function getBalances(organizationId: string, currency: string): Promise<LedgerBalance[]> {
  const rows = await db
    .select({
      code: ledgerAccounts.code,
      name: ledgerAccounts.name,
      type: ledgerAccounts.type,
      debits: sql<number>`coalesce(sum(case when ${journalPostings.direction} = 'debit' then ${journalPostings.amountMinor} else 0 end), 0)::bigint`,
      credits: sql<number>`coalesce(sum(case when ${journalPostings.direction} = 'credit' then ${journalPostings.amountMinor} else 0 end), 0)::bigint`,
    })
    .from(ledgerAccounts)
    .leftJoin(journalPostings, eq(journalPostings.accountId, ledgerAccounts.id))
    .where(and(eq(ledgerAccounts.organizationId, organizationId), eq(ledgerAccounts.currency, currency)))
    .groupBy(ledgerAccounts.code, ledgerAccounts.name, ledgerAccounts.type)
    .orderBy(ledgerAccounts.code);

  return rows.map((row) => {
    const debitNormal = row.type === "asset" || row.type === "expense";
    const debits = Number(row.debits);
    const credits = Number(row.credits);
    return {
      code: row.code,
      name: row.name,
      type: row.type,
      balanceMinor: debitNormal ? debits - credits : credits - debits,
    };
  });
}

/** Validates the whole ledger for an organization (used by tests and admin tools). */
export async function verifyLedgerIntegrity(organizationId: string): Promise<{ balanced: boolean; entries: number }> {
  const rows = await db
    .select({
      entryId: journalPostings.entryId,
      debits: sql<number>`coalesce(sum(case when ${journalPostings.direction} = 'debit' then ${journalPostings.amountMinor} else 0 end), 0)::bigint`,
      credits: sql<number>`coalesce(sum(case when ${journalPostings.direction} = 'credit' then ${journalPostings.amountMinor} else 0 end), 0)::bigint`,
    })
    .from(journalPostings)
    .innerJoin(journalEntries, eq(journalEntries.id, journalPostings.entryId))
    .where(eq(journalEntries.organizationId, organizationId))
    .groupBy(journalPostings.entryId);

  const balanced = rows.every((r) => Number(r.debits) === Number(r.credits));
  return { balanced, entries: rows.length };
}

/** Postings for a successful collection: gross in, fee out, net retained at provider. */
export function collectionPostings(input: { grossMinor: number; feeMinor: number }): Posting[] {
  const fee = Math.max(0, Math.min(input.feeMinor, input.grossMinor));
  const postings: Posting[] = [
    { code: "1000", direction: "debit", amountMinor: input.grossMinor },
    { code: "4000", direction: "credit", amountMinor: input.grossMinor },
  ];
  if (fee > 0) {
    postings.push(
      { code: "5000", direction: "debit", amountMinor: fee },
      { code: "1000", direction: "credit", amountMinor: fee },
    );
  }
  return postings;
}

export function refundPostings(amountMinor: number): Posting[] {
  return [
    { code: "4010", direction: "debit", amountMinor },
    { code: "1000", direction: "credit", amountMinor },
  ];
}

export function payoutPostings(amountMinor: number): Posting[] {
  return [
    { code: "3100", direction: "debit", amountMinor },
    { code: "1000", direction: "credit", amountMinor },
  ];
}
