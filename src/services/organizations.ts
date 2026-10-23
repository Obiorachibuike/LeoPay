import { and, asc, count, desc, eq, isNull, sql } from "drizzle-orm";
import { db, transaction } from "@/lib/db/client";
import {
  auditLogs,
  invitations,
  memberships,
  organizations,
  users,
  type Organization,
} from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { generateToken, hashToken } from "@/lib/crypto";
import { slugify } from "@/lib/ids";
import { env } from "@/lib/env";
import { isRole, type Role } from "@/lib/auth/rbac";
import { audit } from "@/lib/audit";
import { queueEmail } from "@/services/notifications";
import { setActiveOrganization } from "@/lib/auth/session";
import type { z } from "zod";
import type { organizationSchema, businessDetailsSchema } from "@/lib/validation";

const SLUG_ATTEMPTS = 8;

export async function createOrganization(input: {
  userId: string;
  userEmail: string;
  userName: string;
  data: z.infer<typeof organizationSchema>;
}): Promise<Organization> {
  const baseSlug = slugify(input.data.name);

  for (let attempt = 0; attempt < SLUG_ATTEMPTS; attempt++) {
    const candidate = attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`;
    try {
      const org = await transaction(async (tx) => {
        const [created] = await tx
          .insert(organizations)
          .values({
            name: input.data.name,
            slug: candidate,
            businessEmail: input.data.businessEmail ?? input.userEmail,
            businessPhone: input.data.businessPhone ?? null,
            countryCode: input.data.countryCode.toUpperCase(),
            defaultCurrency: input.data.defaultCurrency,
            businessType: input.data.businessType,
            website: input.data.website ?? null,
          })
          .returning();

        await tx.insert(memberships).values({
          organizationId: created!.id,
          userId: input.userId,
          role: "owner",
          status: "active",
          joinedAt: new Date(),
        });

        return created!;
      });

      await setActiveOrganization(org.id);
      await audit({
        action: "org.created",
        organizationId: org.id,
        actorId: input.userId,
        actorEmail: input.userEmail,
        targetType: "organization",
        targetId: org.id,
        metadata: { name: org.name, slug: org.slug },
      });
      return org;
    } catch (error) {
      const message = (error as Error).message;
      if (message.includes("organizations_slug") || message.includes("duplicate key")) continue;
      throw error;
    }
  }

  throw new AppError("CONFLICT", "Could not reserve a workspace URL for this business name. Try another name.");
}

export async function updateBusinessDetails(input: {
  organizationId: string;
  actor: { id: string; email: string };
  data: z.infer<typeof businessDetailsSchema>;
}): Promise<Organization> {
  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input.data)) {
    if (value !== undefined && key !== "settlementAccountNumber") patch[key] = value;
  }
  if (input.data.settlementAccountNumber) {
    patch.settlementAccountNumberLast4 = input.data.settlementAccountNumber.slice(-4);
  }

  const [updated] = await db
    .update(organizations)
    .set({ ...patch, onboardingStep: "provider_setup" })
    .where(eq(organizations.id, input.organizationId))
    .returning();

  await audit({
    action: "org.updated",
    organizationId: input.organizationId,
    actorId: input.actor.id,
    actorEmail: input.actor.email,
    targetType: "organization",
    targetId: input.organizationId,
    metadata: { updatedFields: Object.keys(patch) },
  });

  return updated!;
}

export async function completeOnboarding(organizationId: string, actor: { id: string; email: string }) {
  await db
    .update(organizations)
    .set({ onboardingStep: "complete", onboardingCompletedAt: new Date() })
    .where(eq(organizations.id, organizationId));
  await audit({
    action: "org.updated",
    organizationId,
    actorId: actor.id,
    actorEmail: actor.email,
    targetType: "organization",
    targetId: organizationId,
    metadata: { onboarding: "complete" },
  });
}

export async function requestVerification(organizationId: string, actor: { id: string; email: string }) {
  const [org] = await db.select().from(organizations).where(eq(organizations.id, organizationId)).limit(1);
  if (!org) throw new AppError("NOT_FOUND", "Organization not found");
  if (!org.businessType || !org.businessEmail || !org.businessPhone) {
    throw new AppError("VALIDATION_ERROR", "Complete your business details before requesting verification");
  }
  if (org.verificationStatus === "verified") return;

  await db.update(organizations).set({ verificationStatus: "pending" }).where(eq(organizations.id, organizationId));
  await audit({
    action: "org.verification_requested",
    organizationId,
    actorId: actor.id,
    actorEmail: actor.email,
    targetType: "organization",
    targetId: organizationId,
  });
}

export async function updatePayoutPolicy(input: {
  organizationId: string;
  actor: { id: string; email: string };
  approvalThresholdMinor: number;
  dailyLimitMinor: number;
}) {
  if (input.approvalThresholdMinor < 0 || input.dailyLimitMinor <= 0) {
    throw new AppError("VALIDATION_ERROR", "Enter valid payout limits");
  }
  await db
    .update(organizations)
    .set({
      payoutApprovalThresholdMinor: input.approvalThresholdMinor,
      payoutDailyLimitMinor: input.dailyLimitMinor,
    })
    .where(eq(organizations.id, input.organizationId));

  await audit({
    action: "settings.updated",
    organizationId: input.organizationId,
    actorId: input.actor.id,
    actorEmail: input.actor.email,
    targetType: "organization",
    targetId: input.organizationId,
    metadata: { approvalThresholdMinor: input.approvalThresholdMinor, dailyLimitMinor: input.dailyLimitMinor },
  });
}

/* ------------------------------------------------------------------ team */

export async function listMembers(organizationId: string) {
  return db
    .select({
      membershipId: memberships.id,
      userId: users.id,
      name: users.name,
      email: users.email,
      role: memberships.role,
      status: memberships.status,
      joinedAt: memberships.joinedAt,
      lastLoginAt: users.lastLoginAt,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.organizationId, organizationId))
    .orderBy(asc(memberships.createdAt));
}

export async function listPendingInvitations(organizationId: string) {
  return db
    .select({
      id: invitations.id,
      email: invitations.email,
      role: invitations.role,
      createdAt: invitations.createdAt,
      expiresAt: invitations.expiresAt,
    })
    .from(invitations)
    .where(
      and(
        eq(invitations.organizationId, organizationId),
        isNull(invitations.acceptedAt),
        isNull(invitations.revokedAt),
        sql`${invitations.expiresAt} > now()`,
      ),
    )
    .orderBy(desc(invitations.createdAt));
}

export async function inviteMember(input: {
  organizationId: string;
  organizationName: string;
  actor: { id: string; email: string; name: string };
  email: string;
  role: Role;
  memberCount: number;
  existingMemberEmails: string[];
}): Promise<{ invitationUrl?: string }> {
  if (input.role === "owner") {
    throw new AppError("FORBIDDEN", "Ownership cannot be granted through an invitation");
  }
  if (input.existingMemberEmails.includes(input.email)) {
    throw new AppError("CONFLICT", "This person is already a member of the organization");
  }

  const token = generateToken(32);
  await db
    .update(invitations)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(invitations.organizationId, input.organizationId),
        eq(invitations.email, input.email),
        isNull(invitations.acceptedAt),
      ),
    );

  const [invitation] = await db
    .insert(invitations)
    .values({
      organizationId: input.organizationId,
      email: input.email,
      role: input.role,
      tokenHash: hashToken(token),
      invitedBy: input.actor.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    })
    .returning();

  const url = `${env.appUrl}/accept-invitation?token=${token}`;
  await queueEmail({
    to: input.email,
    template: "team_invitation",
    organizationId: input.organizationId,
    data: {
      organization: input.organizationName,
      inviter: input.actor.name,
      role: input.role,
      url,
    },
  }).catch(() => undefined);

  await audit({
    action: "member.invited",
    organizationId: input.organizationId,
    actorId: input.actor.id,
    actorEmail: input.actor.email,
    targetType: "invitation",
    targetId: invitation!.id,
    metadata: { email: input.email, role: input.role },
  });

  return { invitationUrl: env.isProduction ? undefined : url };
}

export async function acceptInvitation(input: { token: string; userId: string; userEmail: string }) {
  const [invitation] = await db
    .select()
    .from(invitations)
    .where(and(eq(invitations.tokenHash, hashToken(input.token)), isNull(invitations.acceptedAt), isNull(invitations.revokedAt)))
    .limit(1);

  if (!invitation) throw new AppError("VALIDATION_ERROR", "This invitation is invalid or has already been used");
  if (invitation.expiresAt.getTime() < Date.now()) {
    throw new AppError("VALIDATION_ERROR", "This invitation has expired. Ask an administrator to resend it.");
  }
  if (invitation.email.toLowerCase() !== input.userEmail.toLowerCase()) {
    throw new AppError("FORBIDDEN", "This invitation was sent to a different email address");
  }

  await transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(memberships)
      .where(and(eq(memberships.organizationId, invitation.organizationId), eq(memberships.userId, input.userId)))
      .limit(1);

    if (existing) {
      await tx
        .update(memberships)
        .set({ status: "active", role: existing.role === "owner" ? "owner" : invitation.role })
        .where(eq(memberships.id, existing.id));
    } else {
      await tx.insert(memberships).values({
        organizationId: invitation.organizationId,
        userId: input.userId,
        role: invitation.role,
        status: "active",
        invitedAt: invitation.createdAt,
        joinedAt: new Date(),
      });
    }

    await tx.update(invitations).set({ acceptedAt: new Date() }).where(eq(invitations.id, invitation.id));
  });

  await setActiveOrganization(invitation.organizationId);
  await audit({
    action: "member.invitation_accepted",
    organizationId: invitation.organizationId,
    actorId: input.userId,
    actorEmail: input.userEmail,
    targetType: "invitation",
    targetId: invitation.id,
  });

  return invitation.organizationId;
}

export async function revokeInvitation(input: {
  organizationId: string;
  invitationId: string;
  actor: { id: string; email: string };
}) {
  const [invitation] = await db
    .select()
    .from(invitations)
    .where(and(eq(invitations.id, input.invitationId), eq(invitations.organizationId, input.organizationId)))
    .limit(1);
  if (!invitation) throw new AppError("NOT_FOUND", "Invitation not found");

  await db.update(invitations).set({ revokedAt: new Date() }).where(eq(invitations.id, input.invitationId));
  await audit({
    action: "member.invitation_revoked",
    organizationId: input.organizationId,
    actorId: input.actor.id,
    actorEmail: input.actor.email,
    targetType: "invitation",
    targetId: input.invitationId,
  });
}

async function ownerCount(organizationId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(memberships)
    .where(
      and(eq(memberships.organizationId, organizationId), eq(memberships.role, "owner"), eq(memberships.status, "active")),
    );
  return Number(row?.value ?? 0);
}

export async function changeMemberRole(input: {
  organizationId: string;
  membershipId: string;
  role: Role;
  actor: { id: string; email: string; membershipId: string };
}) {
  if (!isRole(input.role)) throw new AppError("VALIDATION_ERROR", "Unknown role");

  const [membership] = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.id, input.membershipId), eq(memberships.organizationId, input.organizationId)))
    .limit(1);
  if (!membership) throw new AppError("NOT_FOUND", "Member not found");

  if (membership.role === "owner" && input.role !== "owner") {
    if ((await ownerCount(input.organizationId)) <= 1) {
      throw new AppError("CONFLICT", "The organization must keep at least one owner");
    }
  }
  if (input.role === "owner") {
    throw new AppError("FORBIDDEN", "Ownership transfer requires a dedicated owner transfer flow");
  }

  await db.update(memberships).set({ role: input.role }).where(eq(memberships.id, membership.id));
  await audit({
    action: "member.role_changed",
    organizationId: input.organizationId,
    actorId: input.actor.id,
    actorEmail: input.actor.email,
    targetType: "membership",
    targetId: membership.id,
    metadata: { from: membership.role, to: input.role },
  });
}

export async function removeMember(input: {
  organizationId: string;
  membershipId: string;
  actor: { id: string; email: string; membershipId: string };
}) {
  const [membership] = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.id, input.membershipId), eq(memberships.organizationId, input.organizationId)))
    .limit(1);
  if (!membership) throw new AppError("NOT_FOUND", "Member not found");
  if (membership.id === input.actor.membershipId) {
    throw new AppError("CONFLICT", "You cannot remove yourself. Ask another owner to update your access.");
  }
  if (membership.role === "owner" && (await ownerCount(input.organizationId)) <= 1) {
    throw new AppError("CONFLICT", "The organization must keep at least one owner");
  }

  await db.delete(memberships).where(eq(memberships.id, membership.id));
  await audit({
    action: "member.removed",
    organizationId: input.organizationId,
    actorId: input.actor.id,
    actorEmail: input.actor.email,
    targetType: "membership",
    targetId: membership.id,
  });
}

export async function listAuditLogs(organizationId: string, options: { limit?: number; page?: number } = {}) {
  const limit = options.limit ?? 50;
  const page = options.page ?? 1;
  return db
    .select()
    .from(auditLogs)
    .where(eq(auditLogs.organizationId, organizationId))
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit)
    .offset((page - 1) * limit);
}
