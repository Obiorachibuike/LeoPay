import { hmacSignature } from "@/lib/crypto";

export function canonicalMerchantSignature(secret: string, body: string): string {
  const timestamp = Math.floor(Date.now() / 1000);
  return `t=${timestamp},v1=${hmacSignature(secret, timestamp, body)}`;
}
