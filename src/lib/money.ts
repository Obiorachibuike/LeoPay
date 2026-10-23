/**
 * Money handling.
 *
 * Every amount in LeoPay is an integer in the currency's minor unit (kobo for
 * NGN). Binary floating point is never used for arithmetic or persistence.
 */

export type CurrencyCode = "NGN" | "USD" | "GBP" | "EUR" | "GHS" | "KES" | "ZAR" | "XOF";

export type CurrencyMeta = {
  code: CurrencyCode;
  name: string;
  symbol: string;
  /** Number of decimal places in the minor unit (0 for XOF, 2 for NGN). */
  exponent: number;
  /** Currencies enabled for collection in this deployment. */
  enabled: boolean;
  locale: string;
};

export const CURRENCIES: Record<CurrencyCode, CurrencyMeta> = {
  NGN: { code: "NGN", name: "Nigerian Naira", symbol: "₦", exponent: 2, enabled: true, locale: "en-NG" },
  USD: { code: "USD", name: "US Dollar", symbol: "$", exponent: 2, enabled: false, locale: "en-US" },
  GBP: { code: "GBP", name: "Pound Sterling", symbol: "£", exponent: 2, enabled: false, locale: "en-GB" },
  EUR: { code: "EUR", name: "Euro", symbol: "€", exponent: 2, enabled: false, locale: "de-DE" },
  GHS: { code: "GHS", name: "Ghanaian Cedi", symbol: "GH₵", exponent: 2, enabled: false, locale: "en-GH" },
  KES: { code: "KES", name: "Kenyan Shilling", symbol: "KSh", exponent: 2, enabled: false, locale: "en-KE" },
  ZAR: { code: "ZAR", name: "South African Rand", symbol: "R", exponent: 2, enabled: false, locale: "en-ZA" },
  XOF: { code: "XOF", name: "West African CFA Franc", symbol: "CFA", exponent: 0, enabled: false, locale: "fr-SN" },
};

export const DEFAULT_CURRENCY: CurrencyCode = "NGN";

export function isCurrencyCode(value: string): value is CurrencyCode {
  return Object.prototype.hasOwnProperty.call(CURRENCIES, value);
}

export function getCurrency(code: string): CurrencyMeta {
  if (!isCurrencyCode(code)) throw new Error(`Unsupported currency: ${code}`);
  return CURRENCIES[code];
}

/** Currencies that may be selected when creating a charge in this deployment. */
export function enabledCurrencies(): CurrencyMeta[] {
  return Object.values(CURRENCIES).filter((c) => c.enabled);
}

/**
 * Converts a major-unit number/string (e.g. "1500.50") to integer minor units.
 * Uses string arithmetic so 0.1 + 0.2 style errors cannot occur.
 */
export function toMinorUnits(amount: string | number, currency: string): number {
  const meta = getCurrency(currency);
  const raw = typeof amount === "number" ? String(amount) : amount.trim();
  if (!/^-?\d+(\.\d+)?$/.test(raw)) {
    throw new Error(`Invalid amount: ${amount}`);
  }
  const negative = raw.startsWith("-");
  const [whole, fraction = ""] = raw.replace("-", "").split(".");
  if (fraction.length > meta.exponent) {
    if (meta.exponent === 0) throw new Error(`${currency} does not support decimal amounts`);
    // Reject silent rounding: an amount with more precision than the currency allows is a caller bug.
    throw new Error(`Too many decimal places for ${currency}`);
  }
  const minor = Number(whole) * 10 ** meta.exponent + Number(fraction.padEnd(meta.exponent, "0") || "0");
  if (!Number.isSafeInteger(minor)) throw new Error("Amount is too large");
  return negative ? -minor : minor;
}

/** Converts integer minor units to a decimal string, e.g. 150050 -> "1500.50". */
export function fromMinorUnits(minor: number, currency: string): string {
  const meta = getCurrency(currency);
  if (!Number.isInteger(minor)) throw new Error("Minor units must be an integer");
  const negative = minor < 0;
  const abs = Math.abs(minor);
  if (meta.exponent === 0) return `${negative ? "-" : ""}${abs}`;
  const divisor = 10 ** meta.exponent;
  const whole = Math.floor(abs / divisor);
  const fraction = String(abs % divisor).padStart(meta.exponent, "0");
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

/** Formats minor units for display, e.g. ₦1,500.50 */
export function formatMoney(minor: number, currency: string, options?: { compact?: boolean }): string {
  const meta = getCurrency(currency);
  const value = minor / 10 ** meta.exponent;
  return new Intl.NumberFormat(meta.locale, {
    style: "currency",
    currency: meta.code,
    minimumFractionDigits: options?.compact && meta.exponent ? 0 : meta.exponent,
    maximumFractionDigits: meta.exponent,
    notation: options?.compact ? "compact" : "standard",
  }).format(value);
}

/** Sums minor-unit amounts with integer overflow protection. */
export function sumMinor(values: readonly number[]): number {
  let total = 0;
  for (const v of values) {
    if (!Number.isInteger(v)) throw new Error("Non-integer minor unit in sum");
    total += v;
    if (!Number.isSafeInteger(total)) throw new Error("Amount overflow");
  }
  return total;
}

/**
 * Multiplies a unit price by a quantity expressed with up to 3 decimals
 * (e.g. 1.5 hours). Rounds half-up to the nearest minor unit.
 */
export function multiplyMinor(unitMinor: number, quantity: number): number {
  if (!Number.isInteger(unitMinor)) throw new Error("Non-integer minor unit");
  if (!Number.isFinite(quantity) || quantity < 0) throw new Error("Invalid quantity");
  const scaled = Math.round(quantity * 1000);
  const product = unitMinor * scaled;
  return Math.round(product / 1000);
}

/** Applies a basis-point rate (e.g. 750 bps = 7.5%) rounding half-up. */
export function applyBps(amountMinor: number, bps: number): number {
  if (!Number.isInteger(amountMinor) || !Number.isInteger(bps)) throw new Error("Invalid bps input");
  return Math.round((amountMinor * bps) / 10_000);
}

export function assertPositiveAmount(minor: number, currency: string): void {
  if (!Number.isInteger(minor) || minor <= 0) throw new Error("Amount must be a positive integer in minor units");
  if (minor > 10 ** 12) throw new Error(`${currency} amount exceeds supported maximum`);
}
