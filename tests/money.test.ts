import { describe, expect, it } from "vitest";
import {
  CURRENCIES,
  applyBps,
  formatMoney,
  fromMinorUnits,
  getCurrency,
  multiplyMinor,
  toMinorUnits,
  sumMinor,
} from "@/lib/money";

describe("money", () => {
  it("converts major units to integer minor units without float error", () => {
    expect(toMinorUnits("1500.50", "NGN")).toBe(150050);
    expect(toMinorUnits("0.10", "NGN")).toBe(10);
    expect(toMinorUnits("0.2", "NGN")).toBe(20);
    expect(toMinorUnits(1500, "NGN")).toBe(150000);
    expect(toMinorUnits("1500.5", "NGN")).toBe(150050);
  });

  it("rejects excess precision instead of rounding silently", () => {
    expect(() => toMinorUnits("10.005", "NGN")).toThrow(/decimal places/);
    expect(toMinorUnits("10", "XOF")).toBe(10);
    expect(() => toMinorUnits("10.5", "XOF")).toThrow(/decimal/);
  });

  it("formats minor units back to decimal strings", () => {
    expect(fromMinorUnits(150050, "NGN")).toBe("1500.50");
    expect(fromMinorUnits(5, "NGN")).toBe("0.05");
    expect(fromMinorUnits(1000, "XOF")).toBe("1000");
    expect(fromMinorUnits(-250, "NGN")).toBe("-2.50");
  });

  it("formats currency for display", () => {
    expect(formatMoney(150050, "NGN")).toContain("1,500.50");
  });

  it("sums integers and guards non-integers", () => {
    expect(sumMinor([100, 250, 1])).toBe(351);
    expect(() => sumMinor([1.5])).toThrow();
  });

  it("multiplies by fractional quantities with half-up rounding", () => {
    expect(multiplyMinor(1000, 1.5)).toBe(1500);
    expect(multiplyMinor(333, 3)).toBe(999);
    expect(multiplyMinor(100, 0.335)).toBe(34); // 33.5 rounds up
  });

  it("applies basis points for fees and tax", () => {
    expect(applyBps(100000, 750)).toBe(7500);
    expect(applyBps(101, 750)).toBe(8); // 7.575 -> 8
    expect(applyBps(100, 0)).toBe(0);
  });

  it("exposes currency metadata including zero-decimal currencies", () => {
    expect(getCurrency("NGN").exponent).toBe(2);
    expect(getCurrency("XOF").exponent).toBe(0);
    expect(() => getCurrency("ABC")).toThrow();
    expect(CURRENCIES.NGN.enabled).toBe(true);
  });
});
