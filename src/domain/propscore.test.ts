import { describe, expect, it } from "vitest";

import {
  calculatePropScore,
  percentileForMetric,
  type CohortMetric,
  type PropScoreInput,
} from "./propscore";

const cohort = [10, 20, 30, 40, 50, 60, 70, 80];
const metric = (value: number, overrides: Partial<CohortMetric> = {}): CohortMetric => ({
  metric: "verified_metric",
  label: "Verified metric",
  value,
  preferredCohort: cohort,
  fallbackCohort: cohort,
  preferredCohortLabel: "same configuration",
  fallbackCohortLabel: "same market and property type",
  higherIsStronger: true,
  evidenceReference: "evidence-1",
  evidenceAsOf: "2026-08-01",
  ...overrides,
});

const completeInput = (): PropScoreInput => ({
  calculatedAt: "2026-08-17T00:00:00.000Z",
  space: {
    variants: [
      {
        label: "4 BHK",
        efficiency: metric(60),
        reraCarpetArea: metric(70),
        validationPassed: true,
      },
    ],
  },
  privacy: {
    unitsPerAcre: metric(20, { higherIsStronger: false }),
    liftAdequacy: metric(60),
    openSpacePercent: null,
    clubhousePerUnit: null,
  },
  specification: {
    catalogSize: 10,
    entries: Array.from({ length: 7 }, (_, index) => ({
      code: `spec-${index}`,
      state: "stated" as const,
      namedBrand: index === 0,
      evidenceReference: "spec-evidence",
      evidenceAsOf: "2026-08-01",
    })),
  },
  developer: {
    deliveryRatio: metric(60),
    experienceYears: metric(70),
  },
  possession: {
    identityMatch: true,
    brochureCompletionDate: "2027-06-30",
    reraCompletionDate: "2027-07-15",
    evidenceVerifiedOn: "2026-08-01",
    currentStatusEvidence: true,
    evidenceReference: "rera-1",
  },
});

describe("percentileForMetric", () => {
  it("uses average ranks for ties", () => {
    const result = percentileForMetric(
      metric(20, { preferredCohort: [10, 20, 20, 20, 30, 40, 50, 60] }),
    );
    expect(result?.score).toBeCloseTo(28.571, 3);
  });

  it("reverses metrics where lower is stronger", () => {
    expect(percentileForMetric(metric(20, { higherIsStronger: false }))?.score).toBeCloseTo(
      85.714,
      3,
    );
  });

  it("falls back only when at least eight verified observations exist", () => {
    const result = percentileForMetric(
      metric(60, {
        preferredCohort: [10, 20],
        fallbackCohort: cohort,
      }),
    );
    expect(result?.cohortLabel).toBe("same market and property type");
    expect(
      percentileForMetric(metric(60, { preferredCohort: [], fallbackCohort: [10, 20] })),
    ).toBeNull();
  });
});

describe("calculatePropScore", () => {
  it("calculates five equally weighted integer dimensions and a composite", () => {
    const result = calculatePropScore(completeInput());
    expect(result.status).toBe("complete");
    expect(result.dimensions).toHaveLength(5);
    expect(result.dimensions.every((dimension) => Number.isInteger(dimension.score))).toBe(true);
    expect(result.composite).toBe(
      Math.round(result.dimensions.reduce((sum, dimension) => sum + (dimension.score ?? 0), 0) / 5),
    );
  });

  it("withholds the composite rather than turning missing evidence into zero", () => {
    const input = completeInput();
    input.developer.experienceYears = null;
    const result = calculatePropScore(input);
    expect(result.status).toBe("insufficient_evidence");
    expect(result.composite).toBeNull();
    expect(result.dimensions.find((item) => item.dimension === "developer")?.score).toBeNull();
  });

  it("requires 70 percent known specification states", () => {
    const input = completeInput();
    input.specification.entries = input.specification.entries.slice(0, 6);
    const result = calculatePropScore(input);
    expect(result.dimensions.find((item) => item.dimension === "specification")).toMatchObject({
      status: "insufficient_evidence",
      score: null,
      coveragePercent: 60,
    });
  });

  it("treats explicit absence as verified while leaving not-stated unknown", () => {
    const input = completeInput();
    input.specification.entries = [
      ...input.specification.entries.slice(0, 6),
      {
        code: "verified-absence",
        state: "explicitly_not_offered",
        namedBrand: false,
        evidenceReference: "spec-evidence",
        evidenceAsOf: "2026-08-01",
      },
      { code: "unknown", state: "not_stated", namedBrand: false },
    ];
    const dimension = calculatePropScore(input).dimensions.find(
      (item) => item.dimension === "specification",
    );
    expect(dimension).toMatchObject({ status: "complete", coveragePercent: 70 });
  });

  it("marks an unresolved RERA identity mismatch invalid", () => {
    const input = completeInput();
    input.possession.identityMatch = false;
    const result = calculatePropScore(input);
    expect(result.status).toBe("invalid");
    expect(result.composite).toBeNull();
  });

  it("does not inspect commercial, review, or enquiry inputs", () => {
    const baseline = calculatePropScore(completeInput());
    const polluted = { ...completeInput(), price: 99, rating: 5, enquiryVolume: 1000 };
    expect(calculatePropScore(polluted)).toEqual(baseline);
  });
});
