import { requirePermission } from "@/lib/auth/context";
import { getTransactionReport } from "@/services/analytics";
import { resolveRange } from "@/lib/dates";
import { fromMinorUnits } from "@/lib/money";
import { audit } from "@/lib/audit";
import { toErrorResponse } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  // Prevent spreadsheet formula injection from customer-supplied values.
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

/**
 * CSV export of transactions for the active organization. Requires an
 * authenticated session (not an API key) and the report:export permission.
 */
export async function GET(request: Request) {
  try {
    const ctx = await requirePermission("report:export");
    const url = new URL(request.url);
    const range = resolveRange("custom", url.searchParams.get("from") ?? undefined, url.searchParams.get("to") ?? undefined);
    const status = url.searchParams.get("status") ?? undefined;
    const search = url.searchParams.get("q") ?? undefined;

    const rows = await getTransactionReport({
      organizationId: ctx.organization.id,
      from: range.from,
      to: range.to,
      status,
      search,
      currency: ctx.organization.defaultCurrency,
      limit: 10_000,
    });

    const header = [
      "reference",
      "created_at",
      "status",
      "provider",
      "channel",
      "method",
      "customer",
      "amount_minor",
      "amount",
      "currency",
      "fee_minor",
      "net_minor",
    ].join(",");

    const body = rows
      .map((row) =>
        [
          csvCell(row.reference),
          csvCell(row.createdAt.toISOString()),
          csvCell(row.status),
          csvCell(row.provider),
          csvCell(row.channel),
          csvCell(row.method),
          csvCell(row.customer),
          csvCell(row.amountMinor),
          csvCell(fromMinorUnits(row.amountMinor, row.currency)),
          csvCell(row.currency),
          csvCell(row.feeMinor),
          csvCell(row.netMinor),
        ].join(","),
      )
      .join("\r\n");

    await audit({
      action: "transaction.exported",
      organizationId: ctx.organization.id,
      actorId: ctx.user.id,
      actorEmail: ctx.user.email,
      metadata: { count: rows.length, from: range.from.toISOString(), to: range.to.toISOString() },
    });

    const filename = `leopay-transactions-${range.from.toISOString().slice(0, 10)}-${range.to
      .toISOString()
      .slice(0, 10)}.csv`;

    return new Response(`${header}\r\n${body}\r\n`, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    const normalized = toErrorResponse(error);
    return Response.json({ error: { code: normalized.code, message: normalized.message } }, { status: normalized.status });
  }
}
