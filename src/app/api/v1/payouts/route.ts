import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { apiKeys, beneficiaries, memberships, organizations, payouts } from "@/lib/db/schema";
import { withApi, jsonResponse, parsePagination, readJson, apiError } from "@/lib/api";
import { serializePayout } from "@/lib/api-serialize";
import { payoutRequestSchema } from "@/lib/validation";
import { fieldErrorsApp } from "@/lib/actions";
import { requestPayout, listBeneficiaries } from "@/services/payouts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return withApi(request, "payouts:read", async (ctx, url) => {
    const { limit, page } = parsePagination(url);
    const rows = await db
      .select({ payout: payouts, beneficiaryName: beneficiaries.name })
      .from(payouts)
      .innerJoin(beneficiaries, eq(beneficiaries.id, payouts.beneficiaryId))
      .where(eq(payouts.organizationId, ctx.organizationId))
      .orderBy(desc(payouts.createdAt))
      .limit(limit)
      .offset((page - 1) * limit);
    return jsonResponse({ data: rows.map((row) => serializePayout(row.payout, row.beneficiaryName)), meta: { page, limit } });
  });
}

/**
 * Creates a payout request. The approval threshold and daily limit still apply,
 * and the approved actor is the human who created the API key (or the owner),
 * never the key itself — so separation of duties is preserved.
 */
export async function POST(request: Request) {
  return withApi(request, "payouts:write", async (ctx) => {
    const body = await readJson(request);
    const parsed = payoutRequestSchema.safeParse({
      beneficiaryId: body.beneficiary_id,
      amountMinor: Number(body.amount_minor),
      currency: body.currency ?? "NGN",
      reason: body.reason ?? undefined,
      idempotencyKey: request.headers.get("idempotency-key") ?? undefined,
    });
    if (!parsed.success) {
      return apiError(422, "VALIDATION_ERROR", "Check the request body", fieldErrorsApp(parsed.error));
    }
    const [organization] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, ctx.organizationId))
      .limit(1);
    if (!organization) return apiError(404, "NOT_FOUND", "Organization not found");
    if (organization.verificationStatus !== "verified") {
      return apiError(403, "FORBIDDEN", "Payouts require a verified business");
    }

    const [key] = await db.select().from(apiKeys).where(eq(apiKeys.id, ctx.keyId)).limit(1);
    let actorId = key?.createdBy ?? null;
    let actorEmail = "api-key";
    if (!actorId) {
      const [owner] = await db
        .select({ userId: memberships.userId })
        .from(memberships)
        .where(and(eq(memberships.organizationId, ctx.organizationId), eq(memberships.role, "owner")))
        .limit(1);
      actorId = owner?.userId ?? null;
    }
    if (!actorId) return apiError(403, "FORBIDDEN", "No accountable user for this API key");
    actorEmail = key ? `api-key:${key.prefix}` : actorEmail;

    const available = await listBeneficiaries(ctx.organizationId);
    if (!available.some((b) => b.id === parsed.data.beneficiaryId)) {
      return apiError(404, "NOT_FOUND", "Beneficiary not found");
    }

    const result = await requestPayout({
      organizationId: ctx.organizationId,
      actor: { id: actorId, email: actorEmail },
      beneficiaryId: parsed.data.beneficiaryId,
      amountMinor: parsed.data.amountMinor,
      currency: parsed.data.currency,
      reason: parsed.data.reason,
      idempotencyKey: parsed.data.idempotencyKey,
      dailyLimitMinor: organization.payoutDailyLimitMinor,
      approvalThresholdMinor: organization.payoutApprovalThresholdMinor,
    });
    return jsonResponse(
      {
        data: {
          id: result.payoutId,
          status: result.status,
          requires_approval: result.requiresApproval,
        },
      },
      201,
    );
  });
}
