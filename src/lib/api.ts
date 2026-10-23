/**
 * Shared plumbing for the public API (v1).
 *
 * Everything that touches money is authorized by API-key scope, then by the
 * same server-side service used by the dashboard. Responses never include
 * internal identifiers that are not already public, secrets or raw provider
 * payloads.
 */
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { idempotencyKeys } from "@/lib/db/schema";
import { authenticateApiKey, enforceApiRateLimit, requireScope, type ApiAuth } from "@/services/api-keys";
import { toErrorResponse, type ErrorCode } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { sha256 } from "@/lib/crypto";
import type { ApiScope } from "@/lib/auth/rbac";

export const API_VERSION = "2026-01-01";

export type ApiContext = ApiAuth & { requestId: string };

export function jsonResponse(body: unknown, status = 200, extraHeaders?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "leopay-version": API_VERSION,
      ...extraHeaders,
    },
  });
}

export function apiError(status: number, code: ErrorCode | string, message: string, details?: unknown): Response {
  return jsonResponse({ error: { type: code.toLowerCase(), code, message, details } }, status);
}

/**
 * Wraps a route handler: authenticates the key, enforces rate limits and
 * scope, and converts thrown AppErrors into stable JSON errors.
 */
export async function withApi(
  request: Request,
  scope: ApiScope,
  handler: (ctx: ApiContext, url: URL) => Promise<Response>,
): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    const auth = await authenticateApiKey(request);
    await enforceApiRateLimit(auth);
    requireScope(auth, scope);
    const response = await handler({ ...auth, requestId }, new URL(request.url));
    response.headers.set("x-request-id", requestId);
    return response;
  } catch (error) {
    const normalized = toErrorResponse(error);
    if (normalized.status >= 500) {
      logger.error("API request failed", { requestId, code: normalized.code, message: normalized.message });
    }
    const response = apiError(normalized.status, normalized.code, normalized.message, normalized.details);
    response.headers.set("x-request-id", requestId);
    return response;
  }
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text();
  if (!text) return {};
  if (text.length > 200_000) {
    throw new (await import("@/lib/errors")).AppError("VALIDATION_ERROR", "Request body is too large");
  }
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("not an object");
    }
    return parsed as Record<string, unknown>;
  } catch {
    const { AppError } = await import("@/lib/errors");
    throw new AppError("VALIDATION_ERROR", "Request body must be a JSON object");
  }
}

export type IdempotentReplay = { status: number; body: unknown } | null;

/**
 * Idempotency for unsafe requests. The same key with a different body is a
 * conflict, so a retry cannot silently create a second payment.
 */
export async function beginIdempotentRequest(input: {
  auth: ApiContext;
  key: string | null;
  endpoint: string;
  rawBody: string;
}): Promise<IdempotentReplay> {
  if (!input.key) return null;
  if (input.key.length < 8 || input.key.length > 200) {
    const { AppError } = await import("@/lib/errors");
    throw new AppError("VALIDATION_ERROR", "Idempotency-Key must be between 8 and 200 characters");
  }
  const requestHash = sha256(input.rawBody || "");
  const [existing] = await db
    .select()
    .from(idempotencyKeys)
    .where(
      and(
        eq(idempotencyKeys.organizationId, input.auth.organizationId),
        eq(idempotencyKeys.key, input.key),
        eq(idempotencyKeys.endpoint, input.endpoint),
      ),
    )
    .limit(1);

  if (existing) {
    if (existing.requestHash !== requestHash) {
      const { AppError } = await import("@/lib/errors");
      throw new AppError("CONFLICT", "This Idempotency-Key was used with a different request body");
    }
    if (existing.responseBody) {
      return { status: existing.responseStatus ?? 200, body: existing.responseBody };
    }
    return { status: 409, body: { error: { code: "CONFLICT", message: "A request with this key is in progress" } } };
  }

  await db.insert(idempotencyKeys).values({
    organizationId: input.auth.organizationId,
    key: input.key,
    endpoint: input.endpoint,
    requestHash,
  });
  return null;
}

export async function completeIdempotentRequest(input: {
  auth: ApiContext;
  key: string | null;
  endpoint: string;
  status: number;
  body: unknown;
}): Promise<void> {
  if (!input.key) return;
  await db
    .update(idempotencyKeys)
    .set({ responseStatus: input.status, responseBody: input.body })
    .where(
      and(
        eq(idempotencyKeys.organizationId, input.auth.organizationId),
        eq(idempotencyKeys.key, input.key),
        eq(idempotencyKeys.endpoint, input.endpoint),
      ),
    );
}

/** Removes a reservation when the request failed before producing a result. */
export async function releaseIdempotentRequest(input: {
  auth: ApiContext;
  key: string | null;
  endpoint: string;
}): Promise<void> {
  if (!input.key) return;
  await db
    .delete(idempotencyKeys)
    .where(
      and(
        eq(idempotencyKeys.organizationId, input.auth.organizationId),
        eq(idempotencyKeys.key, input.key),
        eq(idempotencyKeys.endpoint, input.endpoint),
      ),
    );
}

export function parsePagination(url: URL): { limit: number; page: number } {
  const limitRaw = Number(url.searchParams.get("limit") ?? 20);
  const pageRaw = Number(url.searchParams.get("page") ?? 1);
  const limit = Number.isFinite(limitRaw) ? Math.min(100, Math.max(1, Math.trunc(limitRaw))) : 20;
  const page = Number.isFinite(pageRaw) ? Math.max(1, Math.trunc(pageRaw)) : 1;
  return { limit, page };
}
