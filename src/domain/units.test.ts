import { describe, expect, it } from "vitest";

import { convertArea, fromSqFt, toSqFt } from "./units";

describe("canonical unit conversion", () => {
  it("converts each unit to square feet", () => {
    expect(toSqFt(1, "sq_ft")).toBeCloseTo(1);
    expect(toSqFt(1, "sq_m")).toBeCloseTo(10.7639);
    expect(toSqFt(1, "sq_yd")).toBeCloseTo(9);
    expect(toSqFt(1, "gaj")).toBeCloseTo(9);
    expect(toSqFt(1, "acre")).toBeCloseTo(43_560);
  });

  it("round-trips through fromSqFt", () => {
    expect(fromSqFt(toSqFt(1200, "sq_m"), "sq_m")).toBeCloseTo(1200);
    expect(fromSqFt(toSqFt(2.5, "acre"), "acre")).toBeCloseTo(2.5);
  });

  it("converts directly between two non-sq_ft units", () => {
    expect(convertArea(1, "gaj", "sq_yd")).toBeCloseTo(1);
    expect(convertArea(43_560, "sq_ft", "acre")).toBeCloseTo(1);
  });
});
