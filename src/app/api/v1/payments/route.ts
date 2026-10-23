import { and, count, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { payments } from "@/lib/db/schema";
import { withApi, jsonResponse, parsePagination } from "@/lib/api";
import { serializePayment } from "@/lib/api-serialize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return withApi(request, "payments:read", async (ctx, url) => {
    const { limit, page } = parsePagination(url);
    const status = url.searchParams.get("status");
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const conditions = [eq(payments.organizationId, ctx.organizationId)];
    if (status) conditions.push(sql`${payments.status} = ${status}`);
    if (from) {
      const parsed = new Date(from);
      if (!Number.isNaN(parsed.getTime())) conditions.push(gte(payments.createdAt, parsed));
    }
    if (to) {
      const parsed = new Date(to);
      if (!Number.isNaN(parsed.getTime())) conditions.push(lte(payments.createdAt, parsed));
    }
    const where = and(...conditions);
    const [rows, total] = await Promise.all([
      db.select().from(payments).where(where).orderBy(desc(payments.createdAt)).limit(limit).offset((page - 1) * limit),
      db.select({ value: count() }).from(payments).where(where),
    ]);
    return jsonResponse({ data: rows.map(serializePayment), meta: { page, limit, total: Number(total[0]?.value ?? 0) } });
  });
}
