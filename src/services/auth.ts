import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users, verificationTokens, type User } from "@/lib/db/schema";
import { generateToken, hashPassword, hashToken, verifyPassword } from "@/lib/crypto";
import { AppError } from "@/lib/errors";
import { env } from "@/lib/env";
import { enforceRateLimit, clearRateLimit } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";
import { queueEmail } from "@/services/notifications";
import { createSession, destroySession, revokeAllSessions, requestMeta } from "@/lib/auth/session";
import { logger } from "@/lib/logger";

const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;

/** A pre-computed hash used to equalise timing when an email does not exist. */
let dummyHash: string | undefined;
async function getDummyHash(): Promise<string> {
  dummyHash ??= await hashPassword("leo-pay-timing-equalizer-value");
  return dummyHash;
}

export async function registerUser(input: { name: string; email: string; password: string }): Promise<{
  user: User;
  verificationUrl?: string;
}> {
  const email = input.email.toLowerCase().trim();

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = ${email}`)
    .limit(1);
  if (existing) {
    throw new AppError("CONFLICT", "This email address is already registered. Try signing in instead.");
  }

  const passwordHash = await hashPassword(input.password);
  const [user] = await db
    .insert(users)
    .values({ email, name: input.name.trim(), passwordHash, status: "active" })
    .returning();

  await audit({
    action: "auth.register",
    actorId: user!.id,
    actorEmail: user!.email,
    targetType: "user",
    targetId: user!.id,
  });

  const verificationUrl = await issueEmailVerification(user!.id);

  await queueEmail({
    to: user!.email,
    template: "welcome",
    data: { name: user!.name },
  }).catch((error) => logger.error("Welcome email could not be queued", { error: (error as Error).message }));

  return { user: user!, verificationUrl };
}

/**
 * Issues an email verification token and sends the link.
 * The raw link is returned to the caller only outside production so the local
 * developer/testing flow can complete without a mailbox. It is never returned
 * in production responses.
 */
export async function issueEmailVerification(userId: string): Promise<string | undefined> {
  const token = generateToken(32);
  await db.insert(verificationTokens).values({
    userId,
    type: "email_verify",
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + VERIFY_TTL_MS),
  });
  const url = `${env.appUrl}/verify-email?token=${token}`;
  const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
  if (user) {
    await queueEmail({
      to: user.email,
      template: "verify_email",
      data: { url, hours: 24 },
    }).catch((error) => logger.error("Verification email could not be queued", { error: (error as Error).message }));
  }
  return env.isProduction ? undefined : url;
}

export async function verifyEmailToken(token: string): Promise<void> {
  const rows = await db
    .update(verificationTokens)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(verificationTokens.tokenHash, hashToken(token)),
        eq(verificationTokens.type, "email_verify"),
        sql`${verificationTokens.usedAt} is null`,
        sql`${verificationTokens.expiresAt} > now()`,
      ),
    )
    .returning({ userId: verificationTokens.userId });

  const row = rows[0];
  if (!row) throw new AppError("VALIDATION_ERROR", "This verification link is invalid or has expired");

  await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, row.userId));
  await audit({
    action: "auth.email_verified",
    actorId: row.userId,
    targetType: "user",
    targetId: row.userId,
  });
}

export async function login(input: { email: string; password: string; ip?: string | null }): Promise<User> {
  const email = input.email.toLowerCase().trim();
  const ip = input.ip ?? "unknown";
  await enforceRateLimit({ bucket: `login:${email}`, limit: 5, windowSeconds: 900 });
  await enforceRateLimit({ bucket: `login-ip:${ip}`, limit: 20, windowSeconds: 900 });

  const [user] = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = ${email}`)
    .limit(1);

  const hash = user?.passwordHash ?? (await getDummyHash());
  const valid = await verifyPassword(input.password, hash);

  if (!user || !valid) {
    await audit({
      action: "auth.login_failed",
      actorId: user?.id ?? null,
      actorEmail: email,
      targetType: "user",
      metadata: { reason: user ? "invalid_password" : "unknown_account" },
    });
    throw new AppError("UNAUTHENTICATED", "Incorrect email or password");
  }

  if (user.status !== "active") {
    throw new AppError("FORBIDDEN", "This account is suspended. Contact support for assistance.");
  }

  const meta = await requestMeta();
  await createSession(user.id, meta);
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
  await clearRateLimit(`login:${email}`);

  await audit({
    action: "auth.login",
    actorId: user.id,
    actorEmail: user.email,
    targetType: "user",
    targetId: user.id,
  });

  return user;
}

export async function logout(): Promise<void> {
  const session = await import("@/lib/auth/session").then((m) => m.getSession());
  await destroySession();
  if (session) {
    await audit({
      action: "auth.logout",
      actorId: session.user.id,
      actorEmail: session.user.email,
      targetType: "user",
      targetId: session.user.id,
    });
  }
}

export async function requestPasswordReset(emailInput: string): Promise<string | undefined> {
  const email = emailInput.toLowerCase().trim();
  await enforceRateLimit({ bucket: `reset:${email}`, limit: 3, windowSeconds: 900 });

  const [user] = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = ${email}`)
    .limit(1);

  // Always behave identically whether or not the account exists.
  if (!user) return undefined;

  const token = generateToken(32);
  await db.insert(verificationTokens).values({
    userId: user.id,
    type: "password_reset",
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + RESET_TTL_MS),
  });

  const url = `${env.appUrl}/reset-password?token=${token}`;
  await queueEmail({ to: user.email, template: "password_reset", data: { url } }).catch(() =>
    logger.error("Password reset email could not be queued"),
  );

  await audit({
    action: "auth.password_reset_requested",
    actorId: user.id,
    actorEmail: user.email,
    targetType: "user",
    targetId: user.id,
  });

  return env.isProduction ? undefined : url;
}

export async function resetPassword(input: { token: string; password: string }): Promise<void> {
  await enforceRateLimit({ bucket: `reset-submit:${hashToken(input.token).slice(0, 16)}`, limit: 5, windowSeconds: 900 });

  const rows = await db
    .update(verificationTokens)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(verificationTokens.tokenHash, hashToken(input.token)),
        eq(verificationTokens.type, "password_reset"),
        sql`${verificationTokens.usedAt} is null`,
        sql`${verificationTokens.expiresAt} > now()`,
      ),
    )
    .returning({ userId: verificationTokens.userId });

  const row = rows[0];
  if (!row) throw new AppError("VALIDATION_ERROR", "This reset link is invalid or has expired");

  const passwordHash = await hashPassword(input.password);
  await db.update(users).set({ passwordHash }).where(eq(users.id, row.userId));

  // All existing sessions are invalidated after a password reset.
  await revokeAllSessions(row.userId);

  await audit({
    action: "auth.password_reset_completed",
    actorId: row.userId,
    targetType: "user",
    targetId: row.userId,
  });

  const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, row.userId)).limit(1);
  if (user) {
    await queueEmail({
      to: user.email,
      template: "security_alert",
      data: { message: "Your LeoPay password was changed. All other sessions were signed out." },
    }).catch(() => undefined);
  }
}

export async function changePassword(input: {
  userId: string;
  currentPassword: string;
  newPassword: string;
  keepSessionId: string;
}): Promise<void> {
  const [user] = await db.select().from(users).where(eq(users.id, input.userId)).limit(1);
  if (!user?.passwordHash) throw new AppError("VALIDATION_ERROR", "Password change is unavailable for this account");

  const valid = await verifyPassword(input.currentPassword, user.passwordHash);
  if (!valid) throw new AppError("VALIDATION_ERROR", "Your current password is incorrect", { status: 400 });

  await db.update(users).set({ passwordHash: await hashPassword(input.newPassword) }).where(eq(users.id, user.id));
  await revokeAllSessions(user.id, input.keepSessionId);

  await queueEmail({
    to: user.email,
    template: "security_alert",
    data: { message: "Your LeoPay password was changed from your account settings." },
  }).catch(() => undefined);
}

export async function findUserByEmail(email: string): Promise<User | null> {
  const [user] = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = ${email.toLowerCase().trim()}`)
    .limit(1);
  return user ?? null;
}
