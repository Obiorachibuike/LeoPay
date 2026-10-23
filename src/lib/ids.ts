import { randomBytes } from "node:crypto";

/** Crockford base32 (no I, L, O, U) keeps references unambiguous when read aloud. */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function randomId(length = 16): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i]! % ALPHABET.length];
  return out;
}

/** Public, unguessable references that never reveal internal UUIDs. */
export const publicReference = {
  paymentLink: () => `pl_${randomId(20)}`,
  invoice: () => `inv_${randomId(20)}`,
  payment: () => `pay_${randomId(20)}`,
  payout: () => `pyt_${randomId(20)}`,
  order: () => `ord_${randomId(20)}`,
  storefrontSlug: () => `store-${randomId(8).toLowerCase()}`,
};

export function slugify(input: string, maxLength = 48): string {
  const slug = input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength)
    .replace(/-+$/g, "");
  return slug || `org-${randomId(6).toLowerCase()}`;
}

export function internalReference(prefix: "pay" | "pyt" | "inv" | "ord" | "ref"): string {
  return `${prefix}_${randomId(18)}`;
}
