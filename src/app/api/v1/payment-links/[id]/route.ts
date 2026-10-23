import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { paymentLinks } from "@/lib/db/schema";
import { withApi, jsonResponse, apiError } from "@/lib/api";
import { serializePaymentLink } from "@/lib/api-serialize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withApi(request, "payment_links:read", async (ctx) => {
    const { id } = await params;
    const [link] = await db
      .select()
      .from(paymentLinks)
      .where(and(eq(paymentLinks.organizationId, ctx.organizationId), eq(paymentLinks.id, id)))
      .limit(1);
    if (!link) return apiError(404, "NOT_FOUND", "Payment link not found");
    return jsonResponse({ data: serializePaymentLink(link) });
  });
}
