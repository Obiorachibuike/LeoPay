import { withApi, jsonResponse, parsePagination } from "@/lib/api";
import { serializeOrder } from "@/lib/api-serialize";
import { listOrders } from "@/services/storefront";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return withApi(request, "orders:read", async (ctx, url) => {
    const { limit, page } = parsePagination(url);
    const { rows, total } = await listOrders(ctx.organizationId, { page, pageSize: limit });
    return jsonResponse({ data: rows.map(serializeOrder), meta: { page, limit, total } });
  });
}
