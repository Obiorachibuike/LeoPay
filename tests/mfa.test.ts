import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { db } from "@/lib/db/client";
import { mfaChallenges, organizations, sessions, users } from "@/lib/db/schema";
import { ensureSchema, resetDb } from "./helpers/db";
import { makeOrganization, makeUser } from "./helpers/factories";
import { base32Decode, base32Encode, generateRecoveryCodes, hotp, normalizeRecoveryCode, otpauthUri, totpCode, verifyTotp } from "@/lib/totp";
import {
  completeMfaChallenge,
  confirmMfaEnrollment,
  createMfaChallenge,
  disableMfa,
  pendingChallenge,
  regenerateRecoveryCodes,
  setMfaPolicy,
  startMfaEnrollment,
} from "@/services/mfa";
import { MFA_GATED_PERMISSIONS, mfaRequiredFor } from "@/lib/auth/context";
import { qrCodeDataUrl } from "@/lib/qr";
import { env } from "@/lib/env";
import type { Organization, User } from "@/lib/db/schema";
import { login, completeLogin, registerUser } from "@/services/auth";

beforeEach(async () => {
  await resetDb();
  await ensureSchema();
});

describe("TOTP primitives", () => {
  it("matches the RFC 6238 SHA-1 reference vectors", () => {
    // RFC 6238 uses the ASCII secret "12345678901234567890" (20 bytes).
    const secret = base32Encode(Buffer.from("12345678901234567890"));
    const vectors: Array<[number, string]> = [
      [59_000, "287082"],
      [1_111_111_109_000, "081804"],
      [1_111_111_111_000, "050471"],
      [1_234_567_890_000, "005924"],
      [2_000_000_000_000, "279037"],
      [20_000_000_000_000, "353130"],
    ];
    for (const [at, expected] of vectors) {
      expect(totpCode(secret, at)).toBe(expected);
    }
  });

  it("round-trips base32 and rejects invalid characters", () => {
    const buffer = randomBytes(20);
    expect(base32Decode(base32Encode(buffer)).equals(buffer)).toBe(true);
    expect(() => base32Decode("!!!!")).toThrow();
    expect(base32Encode(Buffer.from("f"))).toBe("MY");
  });

  it("accepts one step of drift and rejects unrelated codes", () => {
    const secret = base32Encode(randomBytes(20));
    const at = 1_700_000_000_000;
    expect(verifyTotp(secret, totpCode(secret, at), { at })).toBe(true);
    expect(verifyTotp(secret, totpCode(secret, at - 30_000), { at })).toBe(true);
    expect(verifyTotp(secret, totpCode(secret, at + 30_000), { at })).toBe(true);
    expect(verifyTotp(secret, totpCode(secret, at - 90_000), { at })).toBe(false);
    expect(verifyTotp(secret, "abcdef", { at })).toBe(false);
    expect(verifyTotp(secret, "12345", { at })).toBe(false);
    expect(hotp(secret, 0)).toMatch(/^\d{6}$/);
  });

  it("builds an otpauth URI and unique recovery codes", () => {
    const secret = generateRecoveryCodes(1, 1, 1).length ? base32Encode(randomBytes(20)) : "";
    const uri = otpauthUri({ secret, accountName: "ada@example.test" });
    expect(uri.startsWith("otpauth://totp/LeoPay:ada%40example.test?")).toBe(true);
    expect(uri).toContain(`secret=${secret}`);
    expect(uri).toContain("period=30");

    const codes = generateRecoveryCodes(10);
    expect(new Set(codes).size).toBe(10);
    expect(codes[0]).toMatch(/^[a-z0-9]{4}-[a-z0-9]{4}$/);
    expect(normalizeRecoveryCode(" AB-cd ")).toBe("abcd");
  });
});

describe("MFA enrollment", () => {
  it("does not enable MFA until a valid code confirms the secret", async () => {
    const user = await makeUser({ verified: true });

    const enrollment = await startMfaEnrollment({ userId: user.id, email: user.email });
    expect(enrollment.secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(enrollment.uri).toContain("otpauth://totp/");

    let [row] = await db.select().from(users).where(eq(users.id, user.id));
    expect(row?.mfaEnabled).toBe(false);
    // The stored secret is encrypted, not the base32 value.
    expect(row?.mfaSecretEncrypted).not.toContain(enrollment.secret);

    await expect(confirmMfaEnrollment({ userId: user.id, code: "000000" })).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });

    const result = await confirmMfaEnrollment({ userId: user.id, code: totpCode(enrollment.secret) });
    expect(result.recoveryCodes).toHaveLength(10);

    [row] = await db.select().from(users).where(eq(users.id, user.id));
    expect(row?.mfaEnabled).toBe(true);
    expect(row?.mfaEnabledAt).toBeInstanceOf(Date);
    expect(row?.mfaRecoveryCodeHashes).toHaveLength(10);
    // Recovery codes are stored hashed.
    expect(row?.mfaRecoveryCodeHashes.join("")).not.toContain(result.recoveryCodes[0]!.replace("-", ""));
  });

  it("refuses to enrol twice", async () => {
    const user = await makeUser({ verified: true });
    const enrollment = await startMfaEnrollment({ userId: user.id, email: user.email });
    await confirmMfaEnrollment({ userId: user.id, code: totpCode(enrollment.secret) });
    await expect(startMfaEnrollment({ userId: user.id, email: user.email })).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("MFA login", () => {
  async function enrolledUser() {
    const user = await makeUser({ verified: true });
    const enrollment = await startMfaEnrollment({ userId: user.id, email: user.email });
    const { recoveryCodes } = await confirmMfaEnrollment({ userId: user.id, code: totpCode(enrollment.secret) });
    return { user, secret: enrollment.secret, recoveryCodes };
  }

  it("withholds the session until the second factor is verified", async () => {
    const password = randomBytes(18).toString("base64url");
    const { user } = await registerUser({
      name: "MFA User",
      email: `mfa-${randomBytes(6).toString("hex")}@example.test`,
      password,
    });
    const enrollment = await startMfaEnrollment({ userId: user.id, email: user.email });
    await confirmMfaEnrollment({ userId: user.id, code: totpCode(enrollment.secret) });

    const result = await login({ email: user.email, password });
    expect(result.mfaRequired).toBe(true);

    // No session may exist yet, even though the password was correct.
    expect(await db.select().from(sessions).where(eq(sessions.userId, user.id))).toHaveLength(0);

    const challengeToken = await createMfaChallenge({ userId: user.id });
    const signedIn = await completeMfaChallenge({ token: challengeToken, code: totpCode(enrollment.secret) });
    await completeLogin(signedIn);
    expect(await db.select().from(sessions).where(eq(sessions.userId, user.id))).toHaveLength(1);
  });

  it("creates a session immediately for accounts without MFA", async () => {
    const password = randomBytes(18).toString("base64url");
    const { user } = await registerUser({
      name: "Plain User",
      email: `plain-${randomBytes(6).toString("hex")}@example.test`,
      password,
    });
    const result = await login({ email: user.email, password });
    expect(result.mfaRequired).toBe(false);
    expect(await db.select().from(sessions).where(eq(sessions.userId, user.id))).toHaveLength(1);
  });

  it("rejects a wrong code, counts attempts, and burns the challenge after five", async () => {
    const { user } = await enrolledUser();
    const token = await createMfaChallenge({ userId: user.id });

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await expect(completeMfaChallenge({ token, code: "000000" })).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    }
    await expect(completeMfaChallenge({ token, code: "000000" })).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    expect(await pendingChallenge(token)).toBeNull();
  });

  it("consumes recovery codes exactly once", async () => {
    const { user, recoveryCodes } = await enrolledUser();
    const code = recoveryCodes[0]!;

    const first = await createMfaChallenge({ userId: user.id });
    await expect(completeMfaChallenge({ token: first, code })).resolves.toMatchObject({ id: user.id });

    const [row] = await db.select().from(users).where(eq(users.id, user.id));
    expect(row?.mfaRecoveryCodeHashes).toHaveLength(9);

    const second = await createMfaChallenge({ userId: user.id });
    await expect(completeMfaChallenge({ token: second, code })).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("cannot reuse a challenge token", async () => {
    const { user, secret } = await enrolledUser();
    const token = await createMfaChallenge({ userId: user.id });
    await completeMfaChallenge({ token, code: totpCode(secret) });
    await expect(completeMfaChallenge({ token, code: totpCode(secret) })).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
  });

  it("expires challenges and ignores tokens for other users", async () => {
    const { secret } = await enrolledUser();
    const other = await makeUser({ verified: true });
    const token = await createMfaChallenge({ userId: other.id });
    // The other user has no MFA: the challenge is not usable.
    await expect(completeMfaChallenge({ token, code: totpCode(secret) })).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });

    const { user } = await enrolledUser();
    const expired = await createMfaChallenge({ userId: user.id });
    await db
      .update(mfaChallenges)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(mfaChallenges.tokenHash, (await import("@/lib/crypto")).hashToken(expired)));
    await expect(completeMfaChallenge({ token: expired, code: totpCode(secret) })).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
  });
});

describe("MFA lifecycle", () => {
  it("regenerates recovery codes and requires a valid code", async () => {
    const user = await makeUser({ verified: true });
    const enrollment = await startMfaEnrollment({ userId: user.id, email: user.email });
    await confirmMfaEnrollment({ userId: user.id, code: totpCode(enrollment.secret) });

    await expect(regenerateRecoveryCodes({ userId: user.id, code: "000000" })).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
    const fresh = await regenerateRecoveryCodes({ userId: user.id, code: totpCode(enrollment.secret) });
    expect(fresh).toHaveLength(10);
  });

  it("disables MFA only with a valid second factor and clears the secret", async () => {
    const user = await makeUser({ verified: true });
    const enrollment = await startMfaEnrollment({ userId: user.id, email: user.email });
    await confirmMfaEnrollment({ userId: user.id, code: totpCode(enrollment.secret) });

    await expect(disableMfa({ userId: user.id, code: "000000" })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await disableMfa({ userId: user.id, code: totpCode(enrollment.secret) });

    const [row] = await db.select().from(users).where(eq(users.id, user.id));
    expect(row?.mfaEnabled).toBe(false);
    expect(row?.mfaSecretEncrypted).toBeNull();
    expect(row?.mfaRecoveryCodeHashes).toEqual([]);
  });
});

describe("enrollment QR code", () => {
  it("renders the otpauth URI as a PNG data URL without a third party", async () => {
    const uri = otpauthUri({ secret: "JBSWY3DPEHPK3PXP", accountName: "ada@example.test" });
    const dataUrl = await qrCodeDataUrl(uri);
    expect(dataUrl.startsWith("data:image/png;base64,")).toBe(true);
    const bytes = Buffer.from(dataUrl.split(",")[1]!, "base64");
    expect([...bytes.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(bytes.length).toBeGreaterThan(200);
  });
});

describe("privileged-role MFA policy", () => {
  function ctxFor(user: Partial<User>, organization: Partial<Organization>, role: "owner" | "admin" | "finance") {
    return {
      user: { mfaEnabled: false, ...user } as User,
      organization: { requireMfaForAdmins: false, ...organization } as Organization,
      role,
    };
  }

  it("gates the permissions that move money, people and credentials", () => {
    expect(MFA_GATED_PERMISSIONS).toEqual(
      expect.arrayContaining(["org:manage", "member:manage", "payout:approve", "developer:manage"]),
    );
    expect(MFA_GATED_PERMISSIONS).not.toContain("payment:read");
  });

  it("applies to owners and admins without MFA when the workspace requires it", () => {
    const org = { requireMfaForAdmins: true };
    expect(mfaRequiredFor(ctxFor({}, org, "owner"))).toBe(true);
    expect(mfaRequiredFor(ctxFor({}, org, "admin"))).toBe(true);
    // MFA already on: nothing to enforce.
    expect(mfaRequiredFor(ctxFor({ mfaEnabled: true }, org, "owner"))).toBe(false);
    // Finance is not a privileged role for this policy.
    expect(mfaRequiredFor(ctxFor({}, org, "finance"))).toBe(false);
  });

  it("is off unless the workspace or the platform turns it on", () => {
    expect(mfaRequiredFor(ctxFor({}, {}, "owner"))).toBe(false);
    env.requireMfaForAdmins = true;
    try {
      expect(mfaRequiredFor(ctxFor({}, {}, "owner"))).toBe(true);
      expect(mfaRequiredFor(ctxFor({}, {}, "finance"))).toBe(false);
    } finally {
      env.requireMfaForAdmins = false;
    }
  });

  it("refuses to turn the policy on for someone who has not enrolled themselves", async () => {
    const user = await makeUser();
    const org = await makeOrganization(user);
    await expect(
      setMfaPolicy({
        organizationId: org.id,
        actor: { id: user.id, email: user.email, mfaEnabled: false },
        enabled: true,
      }),
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      message: "Enable two-factor authentication on your own account before requiring it for the workspace",
    });
    const [unchanged] = await db.select().from(organizations).where(eq(organizations.id, org.id));
    expect(unchanged!.requireMfaForAdmins).toBe(false);
  });

  it("persists the policy once the actor has MFA, and can be turned off again", async () => {
    const user = await makeUser();
    const org = await makeOrganization(user);
    const actor = { id: user.id, email: user.email, mfaEnabled: true };

    await setMfaPolicy({ organizationId: org.id, actor, enabled: true });
    let [stored] = await db.select().from(organizations).where(eq(organizations.id, org.id));
    expect(stored!.requireMfaForAdmins).toBe(true);
    expect(mfaRequiredFor({ user: { ...user, mfaEnabled: false } as User, organization: stored!, role: "owner" })).toBe(
      true,
    );

    await setMfaPolicy({ organizationId: org.id, actor, enabled: false });
    [stored] = await db.select().from(organizations).where(eq(organizations.id, org.id));
    expect(stored!.requireMfaForAdmins).toBe(false);
  });
});
