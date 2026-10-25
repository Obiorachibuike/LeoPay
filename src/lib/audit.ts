import "server-only";
import { headers } from "next/headers";
import { db } from "@/lib/db/client";
import { auditLogs } from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import { env } from "@/lib/env";

export type AuditAction =
  | "auth.register"
  | "auth.login"
  | "auth.login_failed"
  | "auth.logout"
  | "auth.password_reset_requested"
  | "auth.password_reset_completed"
  | "auth.email_verified"
  | "auth.mfa_enabled"
  | "auth.mfa_disabled"
  | "auth.mfa_failed"
  | "auth.mfa_recovery_used"
  | "auth.mfa_recovery_regenerated"
  | "auth.mfa_challenge_issued"
  | "org.created"
  | "org.updated"
  | "org.verification_requested"
  | "org.verification_decided"
  | "org.mfa_policy_changed"
  | "member.invited"
  | "member.invitation_accepted"
  | "member.invitation_revoked"
  | "member.role_changed"
  | "member.removed"
  | "payment_link.created"
  | "payment_link.updated"
  | "payment_link.disabled"
  | "payment.initialized"
  | "payment.succeeded"
  | "payment.failed"
  | "payment.refunded"
  | "payment.refund_requested"
  | "invoice.created"
  | "invoice.updated"
  | "invoice.sent"
  | "invoice.paid"
  | "invoice.reminder_sent"
  | "product.created"
  | "product.updated"
  | "storefront.updated"
  | "order.created"
  | "order.paid"
  | "beneficiary.created"
  | "beneficiary.verified"
  | "payout.requested"
  | "payout.approved"
  | "payout.rejected"
  | "payout.initiated"
  | "payout.failed"
  | "api_key.created"
  | "api_key.revoked"
  | "webhook_endpoint.created"
  | "webhook_endpoint.updated"
  | "webhook_endpoint.deleted"
  | "settings.updated"
  | "admin.org_suspended"
  | "admin.org_verified"
  | "admin.reconciliation_resolved"
  | "transaction.exported"
  | "customer.created"
  | "support.ticket_created";

export type AuditInput = {
  action: AuditAction;
  organizationId?: string | null;
  actorId?: string | null;
  actorEmail?: string | null;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  ip?: string | null;
  userAgent?: string | null;
};

/** Writes an immutable audit record. Never include secrets in metadata. */
export async function audit(input: AuditInput): Promise<void> {
  try {
    let ip = input.ip;
    let userAgent = input.userAgent;
    if (ip === undefined || userAgent === undefined) {
      let h: Awaited<ReturnType<typeof headers>> | null = null;
      try {
        h = await headers();
      } catch {
        h = null;
      }
      const forwarded = h?.get("x-forwarded-for");
      const realIp = h?.get("x-real-ip");
      ip = ip ?? (env.trustProxy ? (forwarded?.split(",")[0]?.trim() ?? realIp) : realIp);
      userAgent = userAgent ?? h?.get("user-agent")?.slice(0, 400) ?? null;
    }
    await db.insert(auditLogs).values({
      action: input.action,
      organizationId: input.organizationId ?? null,
      actorId: input.actorId ?? null,
      actorEmail: input.actorEmail ?? null,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      metadata: input.metadata ?? {},
      ip: ip ?? null,
      userAgent: userAgent ?? null,
    });
  } catch (error) {
    // Audit failures must be visible but must not break the business operation
    // after the fact; the primary record is already committed.
    logger.error("Failed to write audit log", { action: input.action, error: (error as Error).message });
  }
}
