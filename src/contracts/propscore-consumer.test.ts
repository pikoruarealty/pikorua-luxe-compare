import { describe, expect, it } from "vitest";

import { assertConsumerPayloadSafe, gatedPropScoreSchema } from "./consumer";

const payload = {
  methodologyVersion: "propscore-v1.0.0",
  calculatedAt: "2026-08-17T00:00:00.000Z",
  composite: null,
  status: "insufficient_evidence",
  coveragePercent: 60,
  dimensions: ["space", "privacy", "specification", "developer", "possession"].map((key) => ({
    key,
    score: null,
    status: "insufficient_evidence",
    coveragePercent: 60,
    why: [],
  })),
  reraCrossCheck: {
    status: "pending",
    checkedAt: null,
    promoterMatch: null,
    completionDifferenceDays: null,
    areaDiscrepancies: [],
  },
  connectivity: [],
};

describe("gated PropScore contract", () => {
  it("accepts an incomplete score without inventing a composite", () => {
    const parsed = gatedPropScoreSchema.parse(payload);
    expect(parsed.composite).toBeNull();
    expect(() => assertConsumerPayloadSafe(parsed)).not.toThrow();
  });

  it("rejects exact commercial data and internal score inputs", () => {
    expect(() =>
      assertConsumerPayloadSafe({ ...payload, baseSalePriceRupees: 50_000_000 }),
    ).toThrow();
    expect(() =>
      assertConsumerPayloadSafe({ ...payload, inputSnapshot: { density: 10 } }),
    ).toThrow();
  });
});
