import { and, eq, or } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { payments, refunds } from "@/lib/db/schema";
import { withApi, jsonResponse, apiError } from "@/lib/api";
import { serializePayment } from "@/lib/api-serialize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withApi(request, "payments:read", async (ctx) => {
    const { id } = await params;
    const [payment] = await db
      .select()
      .from(payments)
      .where(
        and(
          eq(payments.organizationId, ctx.organizationId),
          or(eq(payments.id, id), eq(payments.internalReference, id)),
        ),
      )
      .limit(1);
    if (!payment) return apiError(404, "NOT_FOUND", "Payment not found");
    const refundRows = await db.select().from(refunds).where(eq(refunds.paymentId, payment.id));
    return jsonResponse({
      data: {
        ...serializePayment(payment),
        refunds: refundRows.map((refund) => ({
          id: refund.id,
          amount_minor: refund.amountMinor,
          status: refund.status,
          reason: refund.reason,
          created_at: refund.createdAt.toISOString(),
        })),
      },
    });
  });
}
