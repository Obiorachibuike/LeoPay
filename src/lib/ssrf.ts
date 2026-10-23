/**
 * SSRF defences for merchant webhook destinations.
 *
 * Merchant-supplied URLs are resolved and checked before every delivery, so a
 * hostname that later points at private infrastructure is rejected rather than
 * followed. Redirects are never followed.
 */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { env } from "@/lib/env";

const BLOCKED_HOSTNAMES = new Set(["localhost", "localhost.", "metadata.google.internal", "metadata", "instance-data"]);

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return true;
  const [a, b] = parts as [number, number, number, number];
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true; // multicast/reserved
  return false;
}

function isPrivateIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === "::1" || normalized === "::") return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true; // unique local
  if (normalized.startsWith("fe80")) return true; // link local
  if (normalized.startsWith("::ffff:")) return isPrivateIpv4(normalized.replace("::ffff:", ""));
  return false;
}

export type UrlSafetyResult = { safe: boolean; reason?: string };

/** Validates a webhook URL without network access (format + hostname checks). */
export function validateWebhookUrlString(raw: string): UrlSafetyResult {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { safe: false, reason: "Invalid URL" };
  }
  if (!["https:", "http:"].includes(url.protocol)) return { safe: false, reason: "Only HTTP(S) URLs are supported" };
  if (env.isProduction && url.protocol !== "https:") return { safe: false, reason: "HTTPS is required in production" };
  if (url.username || url.password) return { safe: false, reason: "Credentials in URLs are not allowed" };
  // URL.hostname keeps IPv6 literals in brackets ("[::1]"), which isIP rejects.
  const hostname = url.hostname.toLowerCase().replaceAll("[", "").replaceAll("]", "");
  if (BLOCKED_HOSTNAMES.has(hostname)) return { safe: false, reason: "Private destinations are not allowed" };
  const family = isIP(hostname);
  if (family === 4 && isPrivateIpv4(hostname)) return { safe: false, reason: "Private IP destinations are not allowed" };
  if (family === 6 && isPrivateIpv6(hostname)) return { safe: false, reason: "Private IP destinations are not allowed" };
  return { safe: true };
}

/** Resolves DNS and rejects destinations that point at private networks. */
export async function assertSafeDestination(raw: string): Promise<void> {
  const basic = validateWebhookUrlString(raw);
  if (!basic.safe) throw new Error(basic.reason ?? "Unsafe webhook destination");

  const url = new URL(raw);
  const hostname = url.hostname.toLowerCase().replaceAll("[", "").replaceAll("]", "");
  if (isIP(hostname)) return; // already validated literal IP

  let addresses;
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new Error("Webhook hostname could not be resolved");
  }
  if (!addresses.length) throw new Error("Webhook hostname could not be resolved");
  for (const { address, family } of addresses) {
    const isPrivate = family === 4 ? isPrivateIpv4(address) : isPrivateIpv6(address);
    if (isPrivate) throw new Error("Webhook hostname resolves to a private network address");
  }
}
