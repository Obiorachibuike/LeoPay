/**
 * RFC 6238 time-based one-time passwords (TOTP) and RFC 4648 base32.
 *
 * Implemented with node:crypto so there is no dependency to audit and the
 * algorithm is exercised directly by the test suite (including the RFC 6238
 * reference vectors). Secrets are 160-bit, codes are 6 digits over 30-second
 * steps, and verification accepts one step of clock drift in either direction.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

export function base32Decode(input: string): Buffer {
  const cleaned = input.toUpperCase().replace(/=+$/, "").replace(/[\s-]/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of cleaned) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) throw new Error("Invalid base32 character");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** 160-bit secret, base32 encoded (what authenticator apps expect). */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export type TotpOptions = { digits?: number; stepSeconds?: number };

/** HOTP value for a counter (RFC 4226), used by TOTP with counter = floor(t/step). */
export function hotp(secret: string, counter: number, digits = 6): string {
  const key = base32Decode(secret);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", key).update(buffer).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary =
    ((digest[offset]! & 0x7f) << 24) |
    ((digest[offset + 1]! & 0xff) << 16) |
    ((digest[offset + 2]! & 0xff) << 8) |
    (digest[offset + 3]! & 0xff);
  return String(binary % 10 ** digits).padStart(digits, "0");
}

/** Current TOTP code for a timestamp (milliseconds). */
export function totpCode(secret: string, at: number = Date.now(), options: TotpOptions = {}): string {
  const step = options.stepSeconds ?? 30;
  return hotp(secret, Math.floor(at / 1000 / step), options.digits ?? 6);
}

/**
 * Constant-time check of a submitted code, accepting `window` steps of drift.
 * Non-numeric or wrong-length input is rejected without hashing comparisons.
 */
export function verifyTotp(
  secret: string,
  code: string,
  options: TotpOptions & { window?: number; at?: number } = {},
): boolean {
  const digits = options.digits ?? 6;
  const step = options.stepSeconds ?? 30;
  const window = options.window ?? 1;
  const submitted = code.trim().replace(/\s+/g, "");
  if (!new RegExp(`^\\d{${digits}}$`).test(submitted)) return false;

  const counter = Math.floor((options.at ?? Date.now()) / 1000 / step);
  let matched = false;
  for (let offset = -window; offset <= window; offset += 1) {
    const expected = hotp(secret, counter + offset, digits);
    // Compare every candidate so timing does not reveal which window matched.
    matched = timingSafeEqual(Buffer.from(expected), Buffer.from(submitted)) || matched;
  }
  return matched;
}

/** Standard otpauth:// URI understood by Google Authenticator, 1Password, Authy. */
export function otpauthUri(input: { secret: string; accountName: string; issuer?: string }): string {
  const issuer = input.issuer ?? "LeoPay";
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(input.accountName)}`;
  const params = new URLSearchParams({
    secret: input.secret,
    issuer,
    algorithm: "SHA1",
    digits: "6",
    period: "30",
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

const RECOVERY_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

/** Human-readable single-use recovery codes, e.g. `4k7p-9wqz`. */
export function generateRecoveryCodes(count = 10, groups = 2, groupLength = 4): string[] {
  const codes = new Set<string>();
  while (codes.size < count) {
    const parts: string[] = [];
    for (let group = 0; group < groups; group += 1) {
      let part = "";
      for (let index = 0; index < groupLength; index += 1) {
        part += RECOVERY_ALPHABET[randomBytes(1)[0]! % RECOVERY_ALPHABET.length];
      }
      parts.push(part);
    }
    codes.add(parts.join("-"));
  }
  return [...codes];
}

/** Normalises a recovery code so casing and dashes do not matter. */
export function normalizeRecoveryCode(code: string): string {
  return code.trim().toLowerCase().replace(/[\s-]/g, "");
}
