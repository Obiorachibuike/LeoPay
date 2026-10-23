import { randomBytes, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { organizations, users } from "@/lib/db/schema";
import { createOrganization } from "@/services/organizations";
import { registerUser } from "@/services/auth";
import type { Organization, User } from "@/lib/db/schema";

export async function makeUser(overrides: { name?: string; email?: string; verified?: boolean } = {}): Promise<User> {
  const email = overrides.email ?? `user-${randomUUID().slice(0, 8)}@example.test`;
  const { user } = await registerUser({
    name: overrides.name ?? "Test User",
    email,
    password: randomBytes(18).toString("base64url"),
  });
  if (overrides.verified) {
    await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, user.id));
    return (await db.select().from(users).where(eq(users.id, user.id)).limit(1))[0]!;
  }
  return user;
}

export async function makeOrganization(owner: User, name = "Acme Ventures"): Promise<Organization> {
  return createOrganization({
    userId: owner.id,
    userEmail: owner.email,
    userName: owner.name,
    data: {
      name: `${name} ${randomUUID().slice(0, 6)}`,
      businessEmail: owner.email,
      businessPhone: "+2348012345678",
      countryCode: "NG",
      defaultCurrency: "NGN",
      businessType: "limited_company",
      website: null,
    },
  });
}

export async function setOrgVerified(organizationId: string) {
  await db.update(organizations).set({ verificationStatus: "verified" }).where(eq(organizations.id, organizationId));
}
