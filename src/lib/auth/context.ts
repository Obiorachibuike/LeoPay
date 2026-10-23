import "server-only";
import { cache } from "react";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { memberships, organizations, type Membership, type Organization, type User } from "@/lib/db/schema";
import { AppError, forbidden, unauthenticated } from "@/lib/errors";
import { hasPermission, permissionsFor, type Permission, type Role, isRole } from "@/lib/auth/rbac";
import { getActiveOrganizationId, getSession } from "@/lib/auth/session";

export type OrgContext = {
  user: User;
  organization: Organization;
  membership: Membership;
  role: Role;
  sessionId: string;
  permissions: readonly Permission[];
};

/** Organizations the current user belongs to, for the workspace switcher. */
export const listUserOrganizations = cache(async () => {
  const session = await getSession();
  if (!session) return [];
  return db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      role: memberships.role,
      verificationStatus: organizations.verificationStatus,
    })
    .from(memberships)
    .innerJoin(organizations, eq(organizations.id, memberships.organizationId))
    .where(and(eq(memberships.userId, session.user.id), eq(memberships.status, "active")))
    .orderBy(asc(organizations.createdAt));
});

async function loadOrgContext(orgSlug?: string): Promise<OrgContext | null> {
  const session = await getSession();
  if (!session) return null;

  const cookieOrgId = orgSlug ? null : await getActiveOrganizationId();

  const rows = await db
    .select({ organization: organizations, membership: memberships })
    .from(memberships)
    .innerJoin(organizations, eq(organizations.id, memberships.organizationId))
    .where(
      orgSlug
        ? and(eq(memberships.userId, session.user.id), eq(memberships.status, "active"), eq(organizations.slug, orgSlug))
        : cookieOrgId
          ? and(eq(memberships.userId, session.user.id), eq(memberships.status, "active"), eq(organizations.id, cookieOrgId))
          : and(eq(memberships.userId, session.user.id), eq(memberships.status, "active")),
    )
    .orderBy(asc(memberships.createdAt))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  if (row.membership.status !== "active") return null;

  const role: Role = isRole(row.membership.role) ? row.membership.role : "viewer";
  return {
    user: session.user,
    organization: row.organization,
    membership: row.membership,
    role,
    sessionId: session.sessionId,
    permissions: permissionsFor(role),
  };
}

/** Current organization context, or null if the user has no workspace yet. */
export const getOrgContext = cache(async (orgSlug?: string): Promise<OrgContext | null> => loadOrgContext(orgSlug));

/** Requires authentication and an active membership in the given organization. */
export async function requireOrgContext(orgSlug?: string): Promise<OrgContext> {
  const session = await getSession();
  if (!session) throw unauthenticated();
  const ctx = await getOrgContext(orgSlug);
  if (!ctx) throw forbidden("You do not have access to this organization");
  if (ctx.organization.status === "suspended") {
    throw forbidden("This organization is suspended. Contact support for assistance.");
  }
  return ctx;
}

/** Requires a specific permission within the active organization. */
export async function requirePermission(permission: Permission, orgSlug?: string): Promise<OrgContext> {
  const ctx = await requireOrgContext(orgSlug);
  if (!hasPermission(ctx.role, permission)) {
    throw forbidden(`Your role (${ctx.role}) cannot perform this action`);
  }
  return ctx;
}

export async function requireUser(): Promise<User> {
  const session = await getSession();
  if (!session) throw unauthenticated();
  return session.user;
}

/** Platform administrators use a separate boundary from organization roles. */
export async function requirePlatformAdmin(): Promise<User> {
  const session = await getSession();
  if (!session) throw unauthenticated();
  if (session.user.platformRole !== "admin") {
    throw new AppError("FORBIDDEN", "Platform administrator access required");
  }
  return session.user;
}

export async function isPlatformAdmin(): Promise<boolean> {
  const session = await getSession();
  return session?.user.platformRole === "admin";
}

/** Loads a resource and asserts tenancy; throws NOT_FOUND rather than leaking existence. */
export function assertSameOrganization(resourceOrgId: string | null | undefined, ctx: OrgContext): void {
  if (!resourceOrgId || resourceOrgId !== ctx.organization.id) {
    throw new AppError("NOT_FOUND", "Resource not found");
  }
}
