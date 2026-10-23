import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { organizations, type Payment } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { startCheckout } from "@/services/payments";
import { startLinkCheckout } from "@/services/payment-links";
import {
  jsonResponse,
  withApi,
  apiError,
  beginIdempotentRequest,
  completeIdempotentRequest,
  releaseIdempotentRequest,
} from "@/lib/api";
import { fromMinorUnits, isCurrencyCode } from "@/lib/money";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ENDPOINT = "checkout.sessions.create";

function sessionPayload(payment: Payment, url: string) {
  return {
    data: {
      id: payment.id,
      reference: payment.internalReference,
      status: payment.status,
      amount_minor: payment.amountMinor,
      amount: fromMinorUnits(payment.amountMinor, payment.currency),
      currency: payment.currency,
      authorization_url: url,
      channel: payment.channel,
    },
  };
}

/**
 * Creates a hosted checkout session. Amounts supplied here belong to the
 * authenticated merchant; customer-supplied input never sets a price. Payment
 * links enforce their own fixed/min/max rules server-side.
 */
export async function POST(request: Request) {
  return withApi(request, "payments:write", async (ctx) => {
    const rawBody = await request.text();
    const idempotencyKey = request.headers.get("idempotency-key");
    const replay = await beginIdempotentRequest({ auth: ctx, key: idempotencyKey, endpoint: ENDPOINT, rawBody });
    if (replay) return jsonResponse(replay.body, replay.status);

    const fail = async (status: number, code: string, message: string) => {
      await releaseIdempotentRequest({ auth: ctx, key: idempotencyKey, endpoint: ENDPOINT });
      return apiError(status, code, message);
    };

    let body: Record<string, unknown> = {};
    if (rawBody) {
      try {
        const parsed = JSON.parse(rawBody);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("shape");
        body = parsed as Record<string, unknown>;
      } catch {
        return fail(422, "VALIDATION_ERROR", "Request body must be a JSON object");
      }
    }

    const customer = (body.customer ?? {}) as Record<string, unknown>;
    const email = typeof customer.email === "string" ? customer.email.trim() : "";
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return fail(422, "VALIDATION_ERROR", "A valid customer.email is required");
    }

    const [organization] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, ctx.organizationId))
      .limit(1);
    if (!organization) return fail(404, "NOT_FOUND", "Organization not found");
    if (organization.status !== "active") return fail(403, "FORBIDDEN", "This organization is suspended");
    if (ctx.environment === "live" && organization.verificationStatus !== "verified") {
      return fail(403, "FORBIDDEN", "Live payments require business verification");
    }

    let result: { payment: Payment; authorizationUrl: string };
    try {
      if (typeof body.payment_link === "string" && body.payment_link) {
        const amountMinor = body.amount_minor === undefined ? null : Number(body.amount_minor);
        if (amountMinor !== null && !Number.isInteger(amountMinor)) {
          return fail(422, "VALIDATION_ERROR", "amount_minor must be an integer number of minor units");
        }
        result = await startLinkCheckout({
          reference: body.payment_link,
          amountMinor,
          customerEmail: email,
          customerName: typeof customer.name === "string" ? customer.name : undefined,
          customerPhone: typeof customer.phone === "string" ? customer.phone : undefined,
        });
      } else {
        const amountMinor = Number(body.amount_minor);
        const currency = String(body.currency ?? "NGN");
        if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
          return fail(422, "VALIDATION_ERROR", "amount_minor must be a positive integer");
        }
        if (!isCurrencyCode(currency)) return fail(422, "VALIDATION_ERROR", "Unsupported currency");
        const metadata =
          body.metadata && typeof body.metadata === "object"
            ? (body.metadata as Record<string, unknown>)
            : {};
        if (typeof body.description === "string") metadata.description = body.description.slice(0, 300);
        result = await startCheckout({
          organizationId: ctx.organizationId,
          amountMinor,
          currency,
          customerEmail: email,
          customerName: typeof customer.name === "string" ? customer.name : null,
          channel: "api",
          metadata,
        });
      }
    } catch (error) {
      await releaseIdempotentRequest({ auth: ctx, key: idempotencyKey, endpoint: ENDPOINT });
      if (error instanceof AppError) return apiError(error.status, error.code, error.message);
      throw error;
    }

    const payload = sessionPayload(result.payment, result.authorizationUrl);
    await completeIdempotentRequest({ auth: ctx, key: idempotencyKey, endpoint: ENDPOINT, status: 201, body: payload });
    return jsonResponse(payload, 201);
  });
}
