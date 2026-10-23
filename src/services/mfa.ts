/**
 * Two-factor authentication (TOTP) for user accounts.
 *
 * Invariants:
 * - a session is only created after the second factor succeeds;
 * - the TOTP secret is stored encrypted (AES-256-GCM), never in plain text;
 * - recovery codes are stored as hashes, shown once, and consumed atomically;
 * - challenges are single-use, expire after 10 minutes and allow 5 attempts.
 */
import { and, eq, isNull, lt } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { mfaChallenges, organizations, users, type User } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { decryptField, encryptField, generateToken, hashToken, sha256 } from "@/lib/crypto";
import { generateRecoveryCodes, generateTotpSecret, normalizeRecoveryCode, otpauthUri, verifyTotp } from "@/lib/totp";
import { enforceRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

const CHALLENGE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

export const MFA_CHALLENGE_COOKIE = "leopay_mfa";

function recoveryHash(code: string): string {
  return sha256(`mfa-recovery:${normalizeRecoveryCode(code)}`);
}

/**
 * Starts enrollment. The secret is stored encrypted but MFA stays disabled
 * until the user proves they can generate a code with it.
 */
export async function startMfaEnrollment(input: { userId: string; email: string }) {
  const [user] = await db.select().from(users).where(eq(users.id, input.userId)).limit(1);
  if (!user) throw new AppError("NOT_FOUND", "User not found");
  if (user.mfaEnabled) throw new AppError("CONFLICT", "Two-factor authentication is already enabled");

  const secret = generateTotpSecret();
  await db.update(users).set({ mfaSecretEncrypted: encryptField(secret), mfaEnabled: false }).where(eq(users.id, user.id));

  return {
    secret,
    uri: otpauthUri({ secret, accountName: user.email || input.email }),
  };
}

/** Confirms enrollment with a code, enables MFA and returns recovery codes once. */
export async function confirmMfaEnrollment(input: { userId: string; code: string }): Promise<{ recoveryCodes: string[] }> {
  const [user] = await db.select().from(users).where(eq(users.id, input.userId)).limit(1);
  if (!user) throw new AppError("NOT_FOUND", "User not found");
  if (user.mfaEnabled) throw new AppError("CONFLICT", "Two-factor authentication is already enabled");
  if (!user.mfaSecretEncrypted) throw new AppError("CONFLICT", "Start enrollment before confirming it");

  const secret = decryptField(user.mfaSecretEncrypted);
  if (!verifyTotp(secret, input.code)) {
    throw new AppError("VALIDATION_ERROR", "That code is not valid. Check your authenticator app and try again.");
  }

  const recoveryCodes = generateRecoveryCodes();
  await db
    .update(users)
    .set({
      mfaEnabled: true,
      mfaEnabledAt: new Date(),
      mfaRecoveryCodeHashes: recoveryCodes.map(recoveryHash),
    })
    .where(eq(users.id, user.id));

  await audit({
    action: "auth.mfa_enabled",
    actorId: user.id,
    actorEmail: user.email,
    targetType: "user",
    targetId: user.id,
  });

  return { recoveryCodes };
}

/** Issues a single-use challenge token after a correct password. */
export async function createMfaChallenge(input: { userId: string; ip?: string | null }): Promise<string> {
  const token = generateToken(32);
  const now = new Date();
  await db.insert(mfaChallenges).values({
    userId: input.userId,
    tokenHash: hashToken(token),
    expiresAt: new Date(now.getTime() + CHALLENGE_TTL_MS),
    ip: input.ip ?? null,
  });
  // Opportunistic cleanup of abandoned challenges.
  await db.delete(mfaChallenges).where(lt(mfaChallenges.expiresAt, new Date(now.getTime() - 60_000)));
  return token;
}

export async function pendingChallenge(token: string | undefined) {
  if (!token) return null;
  const [row] = await db
    .select({ challenge: mfaChallenges, user: users })
    .from(mfaChallenges)
    .innerJoin(users, eq(users.id, mfaChallenges.userId))
    .where(and(eq(mfaChallenges.tokenHash, hashToken(token)), isNull(mfaChallenges.consumedAt)))
    .limit(1);
  if (!row) return null;
  if (row.challenge.expiresAt.getTime() < Date.now()) return null;
  if (row.challenge.attempts >= MAX_ATTEMPTS) return null;
  if (!row.user.mfaEnabled || row.user.status !== "active") return null;
  return { challenge: row.challenge, user: row.user };
}

/**
 * Verifies a TOTP code (or an unused recovery code) for a challenge and
 * consumes it. Throws with the same message shape for wrong codes so the
 * endpoint cannot be used to probe whether MFA is configured.
 */
export async function completeMfaChallenge(input: { token: string; code: string }): Promise<User> {
  const pending = await pendingChallenge(input.token);
  if (!pending) {
    throw new AppError("UNAUTHENTICATED", "This sign-in attempt has expired. Start again.");
  }
  const { challenge, user } = pending;
  await enforceRateLimit({ bucket: `mfa:${user.id}`, limit: 8, windowSeconds: 900 });

  if (!user.mfaSecretEncrypted) {
    throw new AppError("UNAUTHENTICATED", "This sign-in attempt has expired. Start again.");
  }

  const submitted = input.code.trim();
  const validTotp = verifyTotp(decryptField(user.mfaSecretEncrypted), submitted);

  let usedRecoveryCode = false;
  let remainingHashes = user.mfaRecoveryCodeHashes;
  if (!validTotp) {
    const hash = recoveryHash(submitted);
    if (user.mfaRecoveryCodeHashes.includes(hash)) {
      usedRecoveryCode = true;
      remainingHashes = user.mfaRecoveryCodeHashes.filter((candidate) => candidate !== hash);
    }
  }

  if (!validTotp && !usedRecoveryCode) {
    const attempts = challenge.attempts + 1;
    await db
      .update(mfaChallenges)
      .set({ attempts, consumedAt: attempts >= MAX_ATTEMPTS ? new Date() : null })
      .where(eq(mfaChallenges.id, challenge.id));
    await audit({
      action: "auth.mfa_failed",
      actorId: user.id,
      actorEmail: user.email,
      targetType: "user",
      targetId: user.id,
      metadata: { attempts },
    });
    throw new AppError("UNAUTHENTICATED", "That code is not valid.");
  }

  // Consume the challenge; a replayed token finds no pending row.
  const consumed = await db
    .update(mfaChallenges)
    .set({ consumedAt: new Date() })
    .where(and(eq(mfaChallenges.id, challenge.id), isNull(mfaChallenges.consumedAt)))
    .returning({ id: mfaChallenges.id });
  if (!consumed.length) {
    throw new AppError("UNAUTHENTICATED", "This sign-in attempt has already been used. Start again.");
  }

  if (usedRecoveryCode) {
    await db.update(users).set({ mfaRecoveryCodeHashes: remainingHashes }).where(eq(users.id, user.id));
    logger.warn("MFA recovery code used", { userId: user.id, remaining: remainingHashes.length });
    await audit({
      action: "auth.mfa_recovery_used",
      actorId: user.id,
      actorEmail: user.email,
      targetType: "user",
      targetId: user.id,
      metadata: { remaining: remainingHashes.length },
    });
  }

  return user;
}

/** Disables MFA. Requires the current password and a valid second factor. */
export async function disableMfa(input: { userId: string; code: string }): Promise<void> {
  const [user] = await db.select().from(users).where(eq(users.id, input.userId)).limit(1);
  if (!user) throw new AppError("NOT_FOUND", "User not found");
  if (!user.mfaEnabled || !user.mfaSecretEncrypted) {
    throw new AppError("CONFLICT", "Two-factor authentication is not enabled");
  }

  const secret = decryptField(user.mfaSecretEncrypted);
  const valid = verifyTotp(secret, input.code) || user.mfaRecoveryCodeHashes.includes(recoveryHash(input.code));
  if (!valid) throw new AppError("VALIDATION_ERROR", "Enter a valid authenticator or recovery code");

  await db
    .update(users)
    .set({ mfaEnabled: false, mfaEnabledAt: null, mfaSecretEncrypted: null, mfaRecoveryCodeHashes: [] })
    .where(eq(users.id, user.id));

  await audit({
    action: "auth.mfa_disabled",
    actorId: user.id,
    actorEmail: user.email,
    targetType: "user",
    targetId: user.id,
  });
}

/** Issues a new set of recovery codes, invalidating the old ones. */
export async function regenerateRecoveryCodes(input: { userId: string; code: string }): Promise<string[]> {
  const [user] = await db.select().from(users).where(eq(users.id, input.userId)).limit(1);
  if (!user) throw new AppError("NOT_FOUND", "User not found");
  if (!user.mfaEnabled || !user.mfaSecretEncrypted) {
    throw new AppError("CONFLICT", "Two-factor authentication is not enabled");
  }
  if (!verifyTotp(decryptField(user.mfaSecretEncrypted), input.code)) {
    throw new AppError("VALIDATION_ERROR", "Enter a valid authenticator code");
  }

  const recoveryCodes = generateRecoveryCodes();
  await db
    .update(users)
    .set({ mfaRecoveryCodeHashes: recoveryCodes.map(recoveryHash) })
    .where(eq(users.id, user.id));

  await audit({
    action: "auth.mfa_recovery_regenerated",
    actorId: user.id,
    actorEmail: user.email,
    targetType: "user",
    targetId: user.id,
    metadata: { count: recoveryCodes.length },
  });

  return recoveryCodes;
}

/** Number of unused recovery codes, for the settings screen. */
export function remainingRecoveryCodes(user: Pick<User, "mfaRecoveryCodeHashes">): number {
  return user.mfaRecoveryCodeHashes.length;
}

/**
 * Turns the workspace policy on or off. Only an owner/admin can set it, and
 * only someone who already has MFA enabled may turn it on — otherwise they
 * would lock themselves out of their own sensitive actions.
 */
export async function setMfaPolicy(input: {
  organizationId: string;
  actor: { id: string; email: string; mfaEnabled: boolean };
  enabled: boolean;
}): Promise<void> {
  if (input.enabled && !input.actor.mfaEnabled) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Enable two-factor authentication on your own account before requiring it for the workspace",
    );
  }
  await db
    .update(organizations)
    .set({ requireMfaForAdmins: input.enabled })
    .where(eq(organizations.id, input.organizationId));

  await audit({
    action: "org.mfa_policy_changed",
    organizationId: input.organizationId,
    actorId: input.actor.id,
    actorEmail: input.actor.email,
    targetType: "organization",
    targetId: input.organizationId,
    metadata: { requireMfaForAdmins: input.enabled },
  });
}
