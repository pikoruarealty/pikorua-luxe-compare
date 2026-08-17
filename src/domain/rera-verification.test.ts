import { describe, expect, it } from "vitest";

import {
  compareReraArea,
  completionDifferenceDays,
  normalizeArea,
  promoterNamesMatch,
} from "./rera-verification";

describe("RERA verification", () => {
  it("normalizes units while retaining the printed evidence", () => {
    expect(normalizeArea(100, "sq_m", "100 sq m")).toEqual({
      rawValue: 100,
      rawUnit: "sq_m",
      rawText: "100 sq m",
      squareFeet: 1076.39,
    });
  });

  it("treats a one-percent area difference as rounding-equivalent", () => {
    const brochure = normalizeArea(1000, "sq_ft", "1,000 sq ft");
    expect(compareReraArea(brochure, normalizeArea(990.1, "sq_ft", "990.1 sq ft")).result).toBe(
      "rounding_equivalent",
    );
    expect(compareReraArea(brochure, normalizeArea(980, "sq_ft", "980 sq ft")).result).toBe(
      "discrepancy",
    );
  });

  it("normalizes common promoter legal suffixes without fuzzy guessing", () => {
    expect(promoterNamesMatch("Acme Developers Pvt. Ltd.", "ACME Developers Private Limited")).toBe(
      true,
    );
    expect(promoterNamesMatch("Acme Developers", "Acme Housing")).toBe(false);
  });

  it("calculates the absolute completion-date difference", () => {
    expect(completionDifferenceDays("2027-01-01", "2027-04-01")).toBe(90);
  });
});
