import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { apiKeys, organizations, type ApiKey } from "@/lib/db/schema";
import { generateApiKey, hashToken } from "@/lib/crypto";
import { AppError } from "@/lib/errors";
import { env } from "@/lib/env";
import { audit } from "@/lib/audit";
import { API_SCOPES, type ApiScope } from "@/lib/auth/rbac";
import { logger } from "@/lib/logger";

export async function createApiKey(input: {
  organizationId: string;
  actor: { id: string; email: string };
  name: string;
  environment: "test" | "live";
  scopes: string[];
}): Promise<{ key: string; apiKey: ApiKey }> {
  const invalid = input.scopes.filter((s) => !(API_SCOPES as readonly string[]).includes(s));
  if (invalid.length) throw new AppError("VALIDATION_ERROR", `Unknown scopes: ${invalid.join(", ")}`);

  if (env.isProduction && input.environment === "test" && env.paymentProvider !== "mock") {
    throw new AppError(
      "UNSUPPORTED",
      "Test API keys are only available when the deployment is running the test payment provider.",
    );
  }

  const { key, prefix } = generateApiKey(input.environment);
  const [created] = await db
    .insert(apiKeys)
    .values({
      organizationId: input.organizationId,
      name: input.name,
      prefix: `${prefix}_${key.slice(-4)}`,
      keyHash: hashToken(key),
      environment: input.environment,
      scopes: input.scopes,
      createdBy: input.actor.id,
    })
    .returning();

  await audit({
    action: "api_key.created",
    organizationId: input.organizationId,
    actorId: input.actor.id,
    actorEmail: input.actor.email,
    targetType: "api_key",
    targetId: created!.id,
    metadata: { name: input.name, environment: input.environment, scopes: input.scopes },
  });

  // The raw key is returned exactly once and never persisted.
  return { key, apiKey: created! };
}

export async function listApiKeys(organizationId: string) {
  return db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      prefix: apiKeys.prefix,
      environment: apiKeys.environment,
      scopes: apiKeys.scopes,
      lastUsedAt: apiKeys.lastUsedAt,
      revokedAt: apiKeys.revokedAt,
      createdAt: apiKeys.createdAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.organizationId, organizationId))
    .orderBy(desc(apiKeys.createdAt));
}

export async function revokeApiKey(input: {
  organizationId: string;
  keyId: string;
  actor: { id: string; email: string };
}) {
  const [key] = await db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.id, input.keyId), eq(apiKeys.organizationId, input.organizationId)))
    .limit(1);
  if (!key) throw new AppError("NOT_FOUND", "API key not found");

  await db.update(apiKeys).set({ revokedAt: new Date() }).where(eq(apiKeys.id, input.keyId));
  await audit({
    action: "api_key.revoked",
    organizationId: input.organizationId,
    actorId: input.actor.id,
    actorEmail: input.actor.email,
    targetType: "api_key",
    targetId: input.keyId,
  });
}

export type ApiAuth = {
  organizationId: string;
  organizationName: string;
  keyId: string;
  environment: string;
  scopes: string[];
};

/**
 * Authenticates an API request from its bearer key.
 * Keys are stored only as SHA-256 hashes; the raw value is never recoverable.
 */
export async function authenticateApiKey(request: Request): Promise<ApiAuth> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  if (!token) throw new AppError("UNAUTHENTICATED", "Provide an API key using Authorization: Bearer <key>");

  const [row] = await db
    .select({ key: apiKeys, organization: organizations })
    .from(apiKeys)
    .innerJoin(organizations, eq(organizations.id, apiKeys.organizationId))
    .where(and(eq(apiKeys.keyHash, hashToken(token)), isNull(apiKeys.revokedAt)))
    .limit(1);

  if (!row) throw new AppError("UNAUTHENTICATED", "Invalid API key");
  if (row.organization.status !== "active") throw new AppError("FORBIDDEN", "This organization is suspended");
  if (row.key.environment === "test" && env.isProduction && env.paymentProvider !== "mock") {
    throw new AppError("FORBIDDEN", "Test API keys are disabled in this deployment. Use a live key.");
  }

  // Throttle last-used writes to once per minute to avoid write amplification.
  if (!row.key.lastUsedAt || Date.now() - row.key.lastUsedAt.getTime() > 60_000) {
    await db
      .update(apiKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiKeys.id, row.key.id))
      .catch((error) => logger.warn("Failed to update API key usage", { error: (error as Error).message }));
  }

  return {
    organizationId: row.key.organizationId,
    organizationName: row.organization.name,
    keyId: row.key.id,
    environment: row.key.environment,
    scopes: row.key.scopes,
  };
}

export function requireScope(auth: ApiAuth, scope: ApiScope): void {
  if (!auth.scopes.includes(scope)) {
    throw new AppError("FORBIDDEN", `This API key is missing the ${scope} scope`);
  }
}

/** Per-key request rate limit (120 requests / minute by default). */
export async function enforceApiRateLimit(auth: ApiAuth): Promise<void> {
  const { enforceRateLimit } = await import("@/lib/rate-limit");
  await enforceRateLimit({ bucket: `apikey:${auth.keyId}`, limit: 120, windowSeconds: 60 });
}

export async function countActiveKeys(organizationId: string): Promise<number> {
  const [row] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(apiKeys)
    .where(and(eq(apiKeys.organizationId, organizationId), isNull(apiKeys.revokedAt)));
  return Number(row?.value ?? 0);
}
