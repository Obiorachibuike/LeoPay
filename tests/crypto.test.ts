import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  decryptField,
  encryptField,
  generateApiKey,
  hashPassword,
  hmacSignature,
  maskAccountNumber,
  safeEqual,
  verifyHmacSignature,
  verifyPassword,
} from "@/lib/crypto";

const password = randomBytes(18).toString("base64url");

describe("crypto", () => {
  it("hashes and verifies passwords with unique salts", async () => {
    const a = await hashPassword(password);
    const b = await hashPassword(password);
    expect(a).not.toBe(b);
    expect(a.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword(password, a)).toBe(true);
    expect(await verifyPassword("wrong-password", a)).toBe(false);
    expect(await verifyPassword(password, "garbage")).toBe(false);
  });

  it("compares strings in constant time helper", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });

  it("encrypts and decrypts sensitive fields with tamper detection", () => {
    const cipher = encryptField("0123456789");
    expect(cipher.startsWith("v1.")).toBe(true);
    expect(cipher).not.toContain("0123456789");
    expect(decryptField(cipher)).toBe("0123456789");

    const tampered = cipher.slice(0, -2) + "aa";
    expect(() => decryptField(tampered)).toThrow();
  });

  it("masks account numbers", () => {
    expect(maskAccountNumber("0123456789")).toBe("•••• 6789");
  });

  it("validates HMAC signatures and rejects stale timestamps", () => {
    const secret = "whsec_test";
    const body = JSON.stringify({ hello: "world" });
    const now = Math.floor(Date.now() / 1000);
    const signature = hmacSignature(secret, now, body);
    expect(verifyHmacSignature(secret, now, body, signature).valid).toBe(true);
    expect(verifyHmacSignature(secret, now, `${body} `, signature).valid).toBe(false);
    expect(verifyHmacSignature(secret, now - 3600, body, hmacSignature(secret, now - 3600, body)).valid).toBe(false);
  });

  it("generates prefixed API keys", () => {
    const test = generateApiKey("test");
    const live = generateApiKey("live");
    expect(test.key.startsWith("lp_test_")).toBe(true);
    expect(live.key.startsWith("lp_live_")).toBe(true);
    expect(test.key).not.toBe(live.key);
  });
});
