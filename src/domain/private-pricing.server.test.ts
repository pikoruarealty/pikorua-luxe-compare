import { describe, expect, it } from "vitest";

import { calculatePrivatePriceBounds } from "./private-pricing.server";

describe("private price calculation", () => {
  it("rounds both bounds outward to the nearest five lakh", () => {
    expect(calculatePrivatePriceBounds(92_000_00)).toEqual({
      lowerRupees: 65_000_00,
      upperRupees: 115_000_00,
    });
  });

  it("maps a raw 69 lakh lower bound to 65 lakh", () => {
    expect(calculatePrivatePriceBounds(92_000_00).lowerRupees).toBe(65_000_00);
  });

  it("maps a raw 91 lakh upper bound to 95 lakh", () => {
    expect(calculatePrivatePriceBounds(72_800_00).upperRupees).toBe(95_000_00);
  });

  it("keeps exact five-lakh multiples unchanged", () => {
    expect(calculatePrivatePriceBounds(2_000_000)).toEqual({
      lowerRupees: 1_500_000,
      upperRupees: 2_500_000,
    });
  });

  it("rejects fractional and unsafe money", () => {
    expect(() => calculatePrivatePriceBounds(1.5)).toThrow();
    expect(() => calculatePrivatePriceBounds(Number.MAX_SAFE_INTEGER)).toThrow();
  });
});
