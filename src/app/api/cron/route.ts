import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { toErrorResponse } from "@/lib/errors";
import { runJobTick, dispatchPendingWebhookDeliveries, dueDeliveryCount } from "@/services/jobs";
import { processEmailQueue, emailDeliveryStats } from "@/services/notifications";
import { expireStalePayments } from "@/services/payments";
import { cleanupRateLimits } from "@/lib/rate-limit";
import { refreshOverdueInvoices } from "@/services/invoices";
import { db } from "@/lib/db/client";
import { organizations } from "@/lib/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Durable background processing, invoked by a scheduler (Vercel Cron, a
 * container cron, or an external pinger) with `Authorization: Bearer $JOB_RUNNER_TOKEN`.
 *
 * Runs outside any request transaction so provider calls never hold row locks.
 */
async function handle(request: Request) {
  const token = env.jobRunnerToken;
  if (!token) {
    return Response.json({ error: "Job runner is not configured (JOB_RUNNER_TOKEN)" }, { status: 503 });
  }
  const provided = request.headers.get("authorization") ?? "";
  if (provided !== `Bearer ${token}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  try {
    const jobs = await runJobTick();
    const emails = await processEmailQueue(25);
    const expired = await expireStalePayments();
    const deliveries = await dispatchPendingWebhookDeliveries(25);

    const orgs = await db.select({ id: organizations.id }).from(organizations).limit(200);
    let overdue = 0;
    for (const org of orgs) {
      overdue += await refreshOverdueInvoices(org.id).catch(() => 0);
    }
    await cleanupRateLimits();

    const summary = {
      ok: true,
      durationMs: Date.now() - startedAt,
      jobs,
      emails,
      paymentsExpired: expired,
      webhookDeliveries: deliveries,
      invoicesMarkedOverdue: overdue,
      emailBacklog: await emailDeliveryStats(),
      dueDeliveries: await dueDeliveryCount(),
    };
    logger.info("Cron tick completed", summary);
    return Response.json(summary);
  } catch (error) {
    const normalized = toErrorResponse(error);
    logger.error("Cron tick failed", { message: normalized.message });
    return Response.json({ ok: false, error: normalized.message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
