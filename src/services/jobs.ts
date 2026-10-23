/**
 * Durable background jobs.
 *
 * Merchant webhook deliveries are written as outbox rows in the same database
 * transaction as the business state change. A worker (cron endpoint
 * /api/jobs/tick, or the in-process ticker in development) claims due rows and
 * delivers them. Nothing is kept in memory, so restarts never lose events.
 */
import { and, eq, lte, or, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { webhookDeliveries, webhookEndpoints } from "@/lib/db/schema";
import { hmacSignature } from "@/lib/crypto";
import { logger } from "@/lib/logger";
import { assertSafeDestination } from "@/lib/ssrf";
import { processEmailQueue } from "@/services/notifications";
import { env } from "@/lib/env";
import type { MerchantEvent, MerchantEventType } from "@/lib/events";

export { MERCHANT_EVENT_TYPES } from "@/lib/events";
export type { MerchantEventType, MerchantEvent } from "@/lib/events";

const MAX_ATTEMPTS = 6;
const BACKOFF_SECONDS = [30, 120, 600, 3600, 21600, 86400];

/** Creates outbox rows for every active endpoint subscribed to the event. */
export async function enqueueMerchantEvent(
  tx: typeof db,
  input: { organizationId: string; type: MerchantEventType; data: Record<string, unknown>; eventId?: string },
): Promise<number> {
  const endpoints = await tx
    .select()
    .from(webhookEndpoints)
    .where(and(eq(webhookEndpoints.organizationId, input.organizationId), eq(webhookEndpoints.status, "active")));

  const matching = endpoints.filter(
    (endpoint) => endpoint.eventTypes.length === 0 || endpoint.eventTypes.includes(input.type),
  );
  if (!matching.length) return 0;

  const event: MerchantEvent = {
    id: input.eventId ?? crypto.randomUUID(),
    type: input.type,
    created_at: new Date().toISOString(),
    data: input.data,
  };

  await tx.insert(webhookDeliveries).values(
    matching.map((endpoint) => ({
      organizationId: input.organizationId,
      endpointId: endpoint.id,
      eventType: input.type,
      payload: event as unknown,
      status: "pending",
      nextAttemptAt: new Date(),
    })),
  );

  return matching.length;
}

function signatureHeader(secret: string, timestamp: number, body: string): string {
  return `t=${timestamp},v1=${hmacSignature(secret, timestamp, body)}`;
}

/**
 * Delivers due webhooks. Uses `SKIP LOCKED` so concurrent workers never
 * deliver the same event twice.
 */
export async function dispatchPendingWebhookDeliveries(limit = 20): Promise<{ delivered: number; failed: number }> {
  const claimed = await db.execute<{
    id: string;
    endpoint_id: string;
    payload: unknown;
    event_type: string;
    attempts: number;
    url: string;
    secret: string;
    organization_id: string;
  }>(sql`
    with due as (
      select id from webhook_deliveries
      where status = 'pending' and next_attempt_at <= now()
      order by next_attempt_at asc
      limit ${limit}
      for update skip locked
    )
    update webhook_deliveries d
    set attempts = d.attempts + 1, last_attempt_at = now()
    from due
    where d.id = due.id
    returning d.id, d.endpoint_id, d.payload, d.event_type, d.attempts, d.organization_id
  `);

  const rows = (claimed as unknown as { rows?: unknown[] }).rows ?? (claimed as unknown as unknown[]);
  const deliveries = rows as Array<{
    id: string;
    endpoint_id: string;
    payload: unknown;
    event_type: string;
    attempts: number;
    organization_id: string;
  }>;
  if (!deliveries.length) return { delivered: 0, failed: 0 };

  let delivered = 0;
  let failed = 0;

  for (const delivery of deliveries) {
    const [endpoint] = await db
      .select()
      .from(webhookEndpoints)
      .where(eq(webhookEndpoints.id, delivery.endpoint_id))
      .limit(1);

    if (!endpoint || endpoint.status !== "active") {
      await db
        .update(webhookDeliveries)
        .set({ status: "dead", error: "Endpoint disabled or removed" })
        .where(eq(webhookDeliveries.id, delivery.id));
      continue;
    }

    const body = JSON.stringify(delivery.payload);
    const timestamp = Math.floor(Date.now() / 1000);
    let responseStatus: number | null = null;
    let responseBody = "";
    let errorMessage: string | null = null;

    try {
      await assertSafeDestination(endpoint.url);
      const response = await fetch(endpoint.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "LeoPay-Webhooks/1.0",
          "LeoPay-Event": delivery.event_type,
          "LeoPay-Delivery": delivery.id,
          "LeoPay-Signature": signatureHeader(endpoint.secret, timestamp, body),
          "LeoPay-Timestamp": String(timestamp),
        },
        body,
        redirect: "manual",
        signal: AbortSignal.timeout(10_000),
      });
      responseStatus = response.status;
      responseBody = (await response.text()).slice(0, 1000);
      if (response.status < 200 || response.status >= 300) {
        errorMessage = `Endpoint responded with ${response.status}`;
      }
    } catch (error) {
      errorMessage = (error as Error).message.slice(0, 300);
    }

    const attempts = delivery.attempts;
    const succeeded = errorMessage === null;

    if (succeeded) {
      delivered += 1;
      await db
        .update(webhookDeliveries)
        .set({ status: "succeeded", responseStatus, responseBody, error: null })
        .where(eq(webhookDeliveries.id, delivery.id));
      await db
        .update(webhookEndpoints)
        .set({ failureCount: 0, lastDeliveryAt: new Date() })
        .where(eq(webhookEndpoints.id, endpoint.id));
    } else {
      failed += 1;
      const dead = attempts >= MAX_ATTEMPTS;
      const backoff = BACKOFF_SECONDS[Math.min(attempts - 1, BACKOFF_SECONDS.length - 1)] ?? 86400;
      await db
        .update(webhookDeliveries)
        .set({
          status: dead ? "dead" : "pending",
          responseStatus,
          responseBody: responseBody || null,
          error: errorMessage,
          nextAttemptAt: new Date(Date.now() + backoff * 1000),
        })
        .where(eq(webhookDeliveries.id, delivery.id));
      await db
        .update(webhookEndpoints)
        .set({ failureCount: sql`${webhookEndpoints.failureCount} + 1`, lastDeliveryAt: new Date() })
        .where(eq(webhookEndpoints.id, endpoint.id));
      logger.warn("Webhook delivery failed", { deliveryId: delivery.id, attempts, error: errorMessage });
    }
  }

  return { delivered, failed };
}

export async function redeliverWebhook(deliveryId: string, organizationId: string): Promise<void> {
  const [delivery] = await db
    .select()
    .from(webhookDeliveries)
    .where(and(eq(webhookDeliveries.id, deliveryId), eq(webhookDeliveries.organizationId, organizationId)))
    .limit(1);
  if (!delivery) throw new Error("Delivery not found");
  await db
    .update(webhookDeliveries)
    .set({ status: "pending", nextAttemptAt: new Date(), error: null })
    .where(eq(webhookDeliveries.id, deliveryId));
}

/** Single tick of all background work. */
export async function runJobTick(): Promise<{
  webhooks: { delivered: number; failed: number };
  emails: { sent: number; failed: number };
}> {
  const [webhooks, emails] = await Promise.all([dispatchPendingWebhookDeliveries(), processEmailQueue()]);
  return { webhooks, emails };
}

let ticker: ReturnType<typeof setInterval> | undefined;

/**
 * Development convenience: processes the outbox every few seconds so webhook
 * deliveries appear without a separate worker process. Production should use a
 * cron/scheduler hitting /api/jobs/tick with JOB_RUNNER_TOKEN.
 */
export function startInlineJobRunner(): void {
  if (!env.enableInlineJobs || ticker) return;
  ticker = setInterval(() => {
    runJobTick().catch((error) => logger.error("Job tick failed", { error: (error as Error).message }));
  }, 10_000);
  if (typeof ticker.unref === "function") ticker.unref();
  logger.info("Inline background job runner started");
}

export async function pendingWebhookStats(organizationId?: string) {
  const conditions = organizationId ? eq(webhookDeliveries.organizationId, organizationId) : undefined;
  const rows = await db
    .select({ status: webhookDeliveries.status, count: sql<number>`count(*)::int` })
    .from(webhookDeliveries)
    .where(conditions)
    .groupBy(webhookDeliveries.status);
  return Object.fromEntries(rows.map((r) => [r.status, Number(r.count)])) as Record<string, number>;
}

export async function dueDeliveryCount(): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(webhookDeliveries)
    .where(and(eq(webhookDeliveries.status, "pending"), or(lte(webhookDeliveries.nextAttemptAt, new Date()))));
  return Number(row?.count ?? 0);
}
