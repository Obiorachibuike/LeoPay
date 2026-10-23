/**
 * Platform administration. A separate permission boundary from organization
 * roles: only users with `platformRole = 'admin'` reach these functions, and
 * every sensitive decision is audited.
 */
import { and, count, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  auditLogs,
  memberships,
  organizations,
  payments,
  payouts,
  reconciliationExceptions,
  users,
  webhookDeliveries,
  webhookEvents,
} from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { emailDeliveryStats } from "@/services/notifications";

export async function platformStats() {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [[orgs], [userCount], [payments30], [payouts24], [exceptions], [webhookFailures], emails] = await Promise.all([
    db.select({ value: count() }).from(organizations),
    db.select({ value: count() }).from(users),
    db
      .select({
        count: sql<number>`count(*)::int`,
        volume: sql<number>`coalesce(sum(case when ${payments.status} = 'succeeded' then ${payments.amountMinor} else 0 end), 0)::bigint`,
      })
      .from(payments)
      .where(gte(payments.createdAt, since)),
    db
      .select({ value: count() })
      .from(payouts)
      .where(gte(payouts.createdAt, new Date(Date.now() - 24 * 60 * 60 * 1000))),
    db
      .select({ value: count() })
      .from(reconciliationExceptions)
      .where(eq(reconciliationExceptions.status, "open")),
    db
      .select({ value: count() })
      .from(webhookEvents)
      .where(eq(webhookEvents.status, "failed")),
    emailDeliveryStats(),
  ]);

  return {
    organizations: Number(orgs?.value ?? 0),
    users: Number(userCount?.value ?? 0),
    payments30d: Number(payments30?.count ?? 0),
    volume30dMinor: Number(payments30?.volume ?? 0),
    payouts24h: Number(payouts24?.value ?? 0),
    openExceptions: Number(exceptions?.value ?? 0),
    failedProviderEvents: Number(webhookFailures?.value ?? 0),
    emails,
  };
}

export async function listOrganizationsForAdmin(options: { search?: string; limit?: number } = {}) {
  const search = options.search?.trim();
  const rows = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      status: organizations.status,
      verificationStatus: organizations.verificationStatus,
      defaultCurrency: organizations.defaultCurrency,
      createdAt: organizations.createdAt,
      members: sql<number>`(select count(*)::int from ${memberships} where ${memberships.organizationId} = ${organizations.id})`,
    })
    .from(organizations)
    .where(search ? sql`(${organizations.name} ilike ${`%${search}%`} or ${organizations.slug} ilike ${`%${search}%`})` : undefined)
    .orderBy(desc(organizations.createdAt))
    .limit(options.limit ?? 50);
  return rows;
}

export async function setOrganizationStatus(input: {
  organizationId: string;
  status: "active" | "suspended";
  admin: { id: string; email: string };
}) {
  await db.update(organizations).set({ status: input.status }).where(eq(organizations.id, input.organizationId));
  await audit({
    action: "admin.org_suspended",
    organizationId: input.organizationId,
    actorId: input.admin.id,
    actorEmail: input.admin.email,
    targetType: "organization",
    targetId: input.organizationId,
    metadata: { status: input.status },
  });
}

export async function decideVerification(input: {
  organizationId: string;
  decision: "verified" | "rejected";
  admin: { id: string; email: string };
}) {
  const [org] = await db.select().from(organizations).where(eq(organizations.id, input.organizationId)).limit(1);
  if (!org) throw new AppError("NOT_FOUND", "Organization not found");
  if (org.verificationStatus !== "pending") {
    throw new AppError("CONFLICT", "This organization has no pending verification request");
  }

  await db
    .update(organizations)
    .set({ verificationStatus: input.decision })
    .where(eq(organizations.id, input.organizationId));

  await audit({
    action: input.decision === "verified" ? "admin.org_verified" : "org.verification_decided",
    organizationId: input.organizationId,
    actorId: input.admin.id,
    actorEmail: input.admin.email,
    targetType: "organization",
    targetId: input.organizationId,
    metadata: { decision: input.decision },
  });
}

export async function listUsersForAdmin(limit = 100) {
  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      status: users.status,
      platformRole: users.platformRole,
      emailVerifiedAt: users.emailVerifiedAt,
      lastLoginAt: users.lastLoginAt,
      createdAt: users.createdAt,
      organizations: sql<number>`(select count(*)::int from ${memberships} where ${memberships.userId} = ${users.id})`,
    })
    .from(users)
    .orderBy(desc(users.createdAt))
    .limit(limit);
}

export async function setUserStatus(input: {
  userId: string;
  status: "active" | "suspended";
  admin: { id: string; email: string };
}) {
  if (input.userId === input.admin.id) {
    throw new AppError("CONFLICT", "You cannot change the status of your own administrator account");
  }
  await db.update(users).set({ status: input.status }).where(eq(users.id, input.userId));
  await audit({
    action: "admin.org_suspended",
    actorId: input.admin.id,
    actorEmail: input.admin.email,
    targetType: "user",
    targetId: input.userId,
    metadata: { status: input.status },
  });
}

export async function listOpenExceptions(limit = 100) {
  return db
    .select({
      id: reconciliationExceptions.id,
      organizationId: reconciliationExceptions.organizationId,
      organizationName: organizations.name,
      type: reconciliationExceptions.type,
      severity: reconciliationExceptions.severity,
      description: reconciliationExceptions.description,
      status: reconciliationExceptions.status,
      createdAt: reconciliationExceptions.createdAt,
    })
    .from(reconciliationExceptions)
    .innerJoin(organizations, eq(organizations.id, reconciliationExceptions.organizationId))
    .where(eq(reconciliationExceptions.status, "open"))
    .orderBy(desc(reconciliationExceptions.createdAt))
    .limit(limit);
}

export async function listWebhookFailures(limit = 50) {
  const providerEvents = await db
    .select()
    .from(webhookEvents)
    .where(eq(webhookEvents.status, "failed"))
    .orderBy(desc(webhookEvents.receivedAt))
    .limit(limit);

  const merchantDeliveries = await db
    .select({
      id: webhookDeliveries.id,
      organizationId: webhookDeliveries.organizationId,
      eventType: webhookDeliveries.eventType,
      status: webhookDeliveries.status,
      attempts: webhookDeliveries.attempts,
      responseStatus: webhookDeliveries.responseStatus,
      error: webhookDeliveries.error,
      createdAt: webhookDeliveries.createdAt,
    })
    .from(webhookDeliveries)
    .where(sql`${webhookDeliveries.status} in ('failed','dead')`)
    .orderBy(desc(webhookDeliveries.createdAt))
    .limit(limit);

  return { providerEvents, merchantDeliveries };
}

export async function listPlatformAudit(limit = 100) {
  return db
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      organizationId: auditLogs.organizationId,
      actorEmail: auditLogs.actorEmail,
      targetType: auditLogs.targetType,
      targetId: auditLogs.targetId,
      metadata: auditLogs.metadata,
      createdAt: auditLogs.createdAt,
    })
    .from(auditLogs)
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit);
}

export async function failedWebhookDeliveryCount(): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(webhookDeliveries)
    .where(and(sql`${webhookDeliveries.status} in ('failed','dead')`));
  return Number(row?.value ?? 0);
}
