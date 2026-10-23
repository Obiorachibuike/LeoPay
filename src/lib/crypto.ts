/**
 * Cryptography helpers: password hashing, token hashing, HMAC signing and
 * symmetric encryption of sensitive beneficiary data.
 */
import type { ScryptOptions } from "node:crypto";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  hkdfSync,
  randomBytes,
  scrypt as scryptCb,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { env } from "@/lib/env";

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
) => Promise<Buffer>;

const SCRYPT_N = 16384;
const SCRYPT_r = 8;
const SCRYPT_p = 1;
const KEY_LEN = 64;

/** Hashes a password with scrypt and a 16-byte random salt. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scrypt(password.normalize("NFKC"), salt, KEY_LEN, {
    N: SCRYPT_N,
    r: SCRYPT_r,
    p: SCRYPT_p,
    maxmem: 64 * 1024 * 1024,
  })) as Buffer;
  return `scrypt$${SCRYPT_N}$${SCRYPT_r}$${SCRYPT_p}$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

/** Verifies a password against a stored hash. Always does constant work. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const [algo, n, r, p, saltB64, hashB64] = stored.split("$");
    if (algo !== "scrypt" || !n || !r || !p || !saltB64 || !hashB64) return false;
    const salt = Buffer.from(saltB64, "base64url");
    const expected = Buffer.from(hashB64, "base64url");
    const derived = (await scrypt(password.normalize("NFKC"), salt, expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
      maxmem: 64 * 1024 * 1024,
    })) as Buffer;
    return derived.length === expected.length && timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

/** Constant-time string comparison for tokens and signatures. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    // Compare a fixed-length digest to avoid leaking length through timing.
    const ha = createHash("sha256").update(bufA).digest();
    const hb = createHash("sha256").update(bufB).digest();
    return timingSafeEqual(ha, hb) && bufA.length === bufB.length;
  }
  return timingSafeEqual(bufA, bufB);
}

export function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Opaque, URL-safe random token (256 bits of entropy). */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function generateApiKey(environment: "test" | "live"): { key: string; prefix: string } {
  const prefix = environment === "live" ? "lp_live" : "lp_test";
  return { key: `${prefix}_${randomBytes(24).toString("base64url")}`, prefix };
}

/** SHA-256 hex of a token; sessions and API keys are stored hashed. */
export function hashToken(token: string): string {
  return sha256(token);
}

export function hmacSignature(secret: string, timestampSeconds: number, body: string): string {
  return createHmac("sha256", secret).update(`${timestampSeconds}.${body}`).digest("hex");
}

export function verifyHmacSignature(
  secret: string,
  timestampSeconds: number,
  body: string,
  signature: string,
  toleranceSeconds = 300,
): { valid: boolean; reason?: string } {
  if (!Number.isFinite(timestampSeconds)) return { valid: false, reason: "invalid timestamp" };
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestampSeconds) > toleranceSeconds) {
    return { valid: false, reason: "timestamp outside tolerance window" };
  }
  const expected = hmacSignature(secret, timestampSeconds, body);
  return safeEqual(expected, signature) ? { valid: true } : { valid: false, reason: "signature mismatch" };
}

/**
 * Derives a 32-byte encryption key. Uses WEBHOOK_ENCRYPTION_KEY when present,
 * otherwise derives a distinct key from AUTH_SECRET so data is never stored
 * in plaintext, even in minimal deployments.
 */
function encryptionKey(): Buffer {
  const material = env.webhookEncryptionKey || env.authSecret || "leopay-development-only-key";
  const derived = hkdfSync("sha256", Buffer.from(material), Buffer.from("leopay-kdf-salt"), Buffer.from("field-encryption"), 32);
  return Buffer.from(derived);
}

/** AES-256-GCM encryption, returns `v1.<iv>.<tag>.<ciphertext>` (base64url). */
export function encryptField(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptField(payload: string): string {
  const [version, ivB64, tagB64, dataB64] = payload.split(".");
  if (version !== "v1" || !ivB64 || !tagB64 || !dataB64) throw new Error("Malformed encrypted value");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivB64, "base64url"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64url")), decipher.final()]).toString("utf8");
}

/** Masks an account number for display, keeping the last four digits. */
export function maskAccountNumber(accountNumber: string): string {
  return `•••• ${accountNumber.slice(-4)}`;
}
