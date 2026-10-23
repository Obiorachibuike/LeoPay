import { and, asc, eq, inArray, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { notifications } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { emailTemplates, type EmailTemplate } from "@/lib/email/templates";

export type QueueEmailInput = {
  to: string;
  template: EmailTemplate;
  data: Record<string, string | number>;
  organizationId?: string | null;
};

/**
 * Records an email in the outbox. Delivery happens in `processEmailQueue`, so a
 * provider outage or slow SMTP call never blocks a payment transaction.
 */
export async function queueEmail(input: QueueEmailInput): Promise<void> {
  const content = emailTemplates[input.template](input.data);
  await db.insert(notifications).values({
    organizationId: input.organizationId ?? null,
    toEmail: input.to,
    template: input.template,
    subject: content.subject,
    body: content.html,
    provider: env.emailProvider,
    status: "queued",
  });
}

async function sendWithResend(to: string, subject: string, html: string): Promise<void> {
  const response = await fetch(`${env.emailApiBase}/emails`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.emailApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: env.emailFrom, to: [to], subject, html }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`Email provider rejected the message (${response.status}): ${detail}`);
  }
}

/** Sends due emails. Returns counts for observability. */
export async function processEmailQueue(limit = 25): Promise<{ sent: number; failed: number }> {
  const due = await db
    .select()
    .from(notifications)
    .where(and(eq(notifications.status, "queued"), lt(notifications.attempts, 5)))
    .orderBy(asc(notifications.createdAt))
    .limit(limit);

  let sent = 0;
  let failed = 0;

  for (const message of due) {
    try {
      if (env.emailProvider === "log" || !env.emailApiKey) {
        if (env.isProduction) {
          throw new Error("EMAIL_PROVIDER is not configured for production delivery");
        }
        logger.info("Email (log provider, not delivered)", {
          to: message.toEmail,
          subject: message.subject,
          template: message.template,
        });
        await db
          .update(notifications)
          .set({ status: "logged", attempts: message.attempts + 1, sentAt: new Date() })
          .where(eq(notifications.id, message.id));
        sent += 1;
        continue;
      }

      await sendWithResend(message.toEmail, message.subject, message.body);
      await db
        .update(notifications)
        .set({ status: "sent", attempts: message.attempts + 1, sentAt: new Date(), error: null })
        .where(eq(notifications.id, message.id));
      sent += 1;
    } catch (error) {
      const attempts = message.attempts + 1;
      await db
        .update(notifications)
        .set({
          status: attempts >= 5 ? "failed" : "queued",
          attempts,
          error: (error as Error).message.slice(0, 500),
        })
        .where(eq(notifications.id, message.id));
      failed += 1;
      logger.error("Email delivery failed", { id: message.id, error: (error as Error).message });
    }
  }

  return { sent, failed };
}

export async function retryFailedEmails(ids: string[]): Promise<void> {
  if (!ids.length) return;
  await db
    .update(notifications)
    .set({ status: "queued", attempts: 0, error: null })
    .where(and(inArray(notifications.id, ids), eq(notifications.status, "failed")));
}

export async function emailDeliveryStats(): Promise<{ queued: number; failed: number; sent: number }> {
  const rows = await db
    .select({ status: notifications.status, count: sql<number>`count(*)::int` })
    .from(notifications)
    .groupBy(notifications.status);
  const map = Object.fromEntries(rows.map((r) => [r.status, Number(r.count)]));
  return { queued: map.queued ?? 0, failed: map.failed ?? 0, sent: (map.sent ?? 0) + (map.logged ?? 0) };
}
