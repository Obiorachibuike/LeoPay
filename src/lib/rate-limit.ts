import "server-only";
import { and, eq, gt, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { rateLimits } from "@/lib/db/schema";

export type RateLimitResult = { allowed: boolean; remaining: number; retryAfterSeconds: number };

/**
 * Fixed-window rate limit persisted in PostgreSQL, so limits survive restarts
 * and work across serverless instances. The upsert is atomic.
 */
export async function rateLimit(input: {
  bucket: string;
  limit: number;
  windowSeconds: number;
}): Promise<RateLimitResult> {
  const now = new Date();
  const rows = await db
    .insert(rateLimits)
    .values({ bucket: input.bucket, windowStart: now, count: 1 })
    .onConflictDoUpdate({
      target: rateLimits.bucket,
      set: {
        count: sql`case when ${rateLimits.windowStart} > now() - (${input.windowSeconds} * interval '1 second')
                       then ${rateLimits.count} + 1 else 1 end`,
        windowStart: sql`case when ${rateLimits.windowStart} > now() - (${input.windowSeconds} * interval '1 second')
                             then ${rateLimits.windowStart} else now() end`,
      },
    })
    .returning({ count: rateLimits.count, windowStart: rateLimits.windowStart });

  const row = rows[0]!;
  const windowEnd = row.windowStart.getTime() + input.windowSeconds * 1000;
  const retryAfterSeconds = Math.max(1, Math.ceil((windowEnd - Date.now()) / 1000));
  return {
    allowed: row.count <= input.limit,
    remaining: Math.max(0, input.limit - row.count),
    retryAfterSeconds,
  };
}

/** Throws RATE_LIMITED when the bucket is exhausted. */
export async function enforceRateLimit(input: { bucket: string; limit: number; windowSeconds: number }): Promise<void> {
  const result = await rateLimit(input);
  if (!result.allowed) {
    const { AppError } = await import("@/lib/errors");
    throw new AppError("RATE_LIMITED", `Too many attempts. Try again in ${result.retryAfterSeconds} seconds.`, {
      status: 429,
    });
  }
}

export async function clearRateLimit(bucket: string): Promise<void> {
  await db.delete(rateLimits).where(eq(rateLimits.bucket, bucket));
}

export async function cleanupRateLimits(olderThanSeconds = 86400): Promise<void> {
  await db
    .delete(rateLimits)
    .where(and(sql`${rateLimits.windowStart} < now() - (${olderThanSeconds} * interval '1 second')`, gt(rateLimits.count, 0)));
}
