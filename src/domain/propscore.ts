export const PROPSCORE_METHODOLOGY_VERSION = "propscore-v1.0.0" as const;
export const MINIMUM_COHORT_SIZE = 8;

export const SCORE_DIMENSIONS = [
  "space",
  "privacy",
  "specification",
  "developer",
  "possession",
] as const;

export type ScoreDimension = (typeof SCORE_DIMENSIONS)[number];
export type ScoreStatus = "complete" | "insufficient_evidence" | "invalid";
export type ComparisonDirection = "higher_is_stronger" | "lower_is_stronger" | "fixed_rule";

export interface ScoreReason {
  metric: string;
  verifiedInput: number | string;
  comparisonDirection: ComparisonDirection;
  explanation: string;
  evidenceReference: string;
  evidenceAsOf: string;
}

export interface DimensionScore {
  dimension: ScoreDimension;
  score: number | null;
  status: ScoreStatus;
  coveragePercent: number;
  why: ScoreReason[];
}

export interface PropScoreResult {
  methodologyVersion: typeof PROPSCORE_METHODOLOGY_VERSION;
  composite: number | null;
  status: ScoreStatus;
  coveragePercent: number;
  dimensions: DimensionScore[];
}

export interface CohortMetric {
  metric: string;
  label: string;
  value: number;
  preferredCohort: number[];
  fallbackCohort: number[];
  preferredCohortLabel: string;
  fallbackCohortLabel: string;
  higherIsStronger: boolean;
  evidenceReference: string;
  evidenceAsOf: string;
}

export interface SpaceVariantInput {
  label: string;
  efficiency: CohortMetric | null;
  reraCarpetArea: CohortMetric | null;
  validationPassed: boolean;
}

export interface SpecificationEntryInput {
  code: string;
  state: "stated" | "explicitly_not_offered" | "not_stated" | "pending_review" | "invalid";
  namedBrand: boolean;
  evidenceReference?: string;
  evidenceAsOf?: string;
}

export interface PossessionInput {
  identityMatch: boolean | null;
  brochureCompletionDate: string | null;
  reraCompletionDate: string | null;
  evidenceVerifiedOn: string | null;
  currentStatusEvidence: boolean;
  evidenceReference: string | null;
}

export interface PropScoreInput {
  calculatedAt: string;
  space: { variants: SpaceVariantInput[] };
  privacy: {
    unitsPerAcre: CohortMetric | null;
    liftAdequacy: CohortMetric | null;
    openSpacePercent: CohortMetric | null;
    clubhousePerUnit: CohortMetric | null;
  };
  specification: {
    catalogSize: number;
    entries: SpecificationEntryInput[];
  };
  developer: {
    deliveryRatio: CohortMetric | null;
    experienceYears: CohortMetric | null;
  };
  possession: PossessionInput;
}

interface PercentileResult {
  score: number;
  cohortLabel: string;
  cohortSize: number;
}

const round = (value: number) => Math.round(Math.min(100, Math.max(0, value)));

function validCohort(values: number[]): number[] {
  return values.filter(Number.isFinite);
}

export function percentileForMetric(metric: CohortMetric): PercentileResult | null {
  const preferred = validCohort(metric.preferredCohort);
  const fallback = validCohort(metric.fallbackCohort);
  const cohort =
    preferred.length >= MINIMUM_COHORT_SIZE
      ? preferred
      : fallback.length >= MINIMUM_COHORT_SIZE
        ? fallback
        : null;
  if (!cohort || !Number.isFinite(metric.value)) return null;

  const sorted = [...cohort, ...(cohort.includes(metric.value) ? [] : [metric.value])].sort(
    (a, b) => a - b,
  );
  const matchingRanks = sorted.flatMap((value, index) =>
    value === metric.value ? [index + 1] : [],
  );
  if (!matchingRanks.length || sorted.length < 2) return null;
  const averageRank = matchingRanks.reduce((sum, rank) => sum + rank, 0) / matchingRanks.length;
  const ascending = (100 * (averageRank - 1)) / (sorted.length - 1);

  return {
    score: metric.higherIsStronger ? ascending : 100 - ascending,
    cohortLabel:
      preferred.length >= MINIMUM_COHORT_SIZE
        ? metric.preferredCohortLabel
        : metric.fallbackCohortLabel,
    cohortSize: sorted.length,
  };
}

function metricScore(metric: CohortMetric): { score: number; reason: ScoreReason } | null {
  const result = percentileForMetric(metric);
  if (!result) return null;
  return {
    score: result.score,
    reason: {
      metric: metric.metric,
      verifiedInput: metric.value,
      comparisonDirection: metric.higherIsStronger ? "higher_is_stronger" : "lower_is_stronger",
      explanation: `${metric.label} ranks at the ${round(result.score)}th percentile among ${result.cohortSize} verified ${result.cohortLabel} observations.`,
      evidenceReference: metric.evidenceReference,
      evidenceAsOf: metric.evidenceAsOf,
    },
  };
}

function incomplete(
  dimension: ScoreDimension,
  coveragePercent: number,
  status: ScoreStatus = "insufficient_evidence",
  why: ScoreReason[] = [],
): DimensionScore {
  return { dimension, score: null, status, coveragePercent: round(coveragePercent), why };
}

function calculateSpace(input: PropScoreInput["space"]): DimensionScore {
  const eligible = input.variants.filter(
    (variant) => variant.validationPassed && variant.efficiency && variant.reraCarpetArea,
  );
  const variantScores = eligible.flatMap((variant) => {
    const efficiency = metricScore(variant.efficiency!);
    const area = metricScore(variant.reraCarpetArea!);
    return efficiency && area
      ? [{ score: (efficiency.score + area.score) / 2, why: [efficiency.reason, area.reason] }]
      : [];
  });
  const coverage = input.variants.length ? (variantScores.length / input.variants.length) * 100 : 0;
  if (!variantScores.length) return incomplete("space", coverage);
  const ordered = variantScores.map((item) => item.score).sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  const median = ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
  return {
    dimension: "space",
    score: round(median),
    status: "complete",
    coveragePercent: round(coverage),
    why: variantScores.flatMap((item) => item.why),
  };
}

function calculatePrivacy(input: PropScoreInput["privacy"]): DimensionScore {
  const metrics = [
    input.unitsPerAcre,
    input.liftAdequacy,
    input.openSpacePercent,
    input.clubhousePerUnit,
  ];
  const scored = metrics.flatMap((metric) => {
    const result = metric ? metricScore(metric) : null;
    return result ? [result] : [];
  });
  const coverage = (scored.length / metrics.length) * 100;
  if (scored.length < 2) return incomplete("privacy", coverage);
  return {
    dimension: "privacy",
    score: round(scored.reduce((sum, item) => sum + item.score, 0) / scored.length),
    status: "complete",
    coveragePercent: round(coverage),
    why: scored.map((item) => item.reason),
  };
}

function calculateSpecification(input: PropScoreInput["specification"]): DimensionScore {
  if (input.catalogSize <= 0) return incomplete("specification", 0);
  const known = input.entries.filter(
    (entry) => entry.state === "stated" || entry.state === "explicitly_not_offered",
  );
  const coverage = (known.length / input.catalogSize) * 100;
  if (coverage < 70) return incomplete("specification", coverage);
  const offered = known.filter((entry) => entry.state === "stated");
  const points = offered.reduce((sum, entry) => sum + 1 + (entry.namedBrand ? 0.25 : 0), 0);
  const score = (points / (known.length * 1.25)) * 100;
  const newest = known
    .map((entry) => entry.evidenceAsOf)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);
  return {
    dimension: "specification",
    score: round(score),
    status: "complete",
    coveragePercent: round(coverage),
    why: [
      {
        metric: "canonical_specification_index",
        verifiedInput: `${offered.length} offered of ${known.length} verified codes`,
        comparisonDirection: "higher_is_stronger",
        explanation: `${offered.length} canonical specifications are source-backed; named brands receive a capped quarter-point bonus.`,
        evidenceReference: known[0]?.evidenceReference ?? "publication-specifications",
        evidenceAsOf: newest ?? "unknown",
      },
    ],
  };
}

function calculateDeveloper(input: PropScoreInput["developer"]): DimensionScore {
  const delivery = input.deliveryRatio ? metricScore(input.deliveryRatio) : null;
  const experience = input.experienceYears ? metricScore(input.experienceYears) : null;
  const scored = [delivery, experience].filter(
    (value): value is NonNullable<typeof value> => value !== null,
  );
  if (scored.length < 2) return incomplete("developer", scored.length * 50);
  return {
    dimension: "developer",
    score: round((scored[0].score + scored[1].score) / 2),
    status: "complete",
    coveragePercent: 100,
    why: scored.map((item) => item.reason),
  };
}

function daysBetween(a: string, b: string): number | null {
  const first = Date.parse(`${a}T00:00:00Z`);
  const second = Date.parse(`${b}T00:00:00Z`);
  return Number.isFinite(first) && Number.isFinite(second)
    ? Math.round(Math.abs(first - second) / 86_400_000)
    : null;
}

function calculatePossession(input: PossessionInput, calculatedAt: string): DimensionScore {
  if (input.identityMatch === false) return incomplete("possession", 0, "invalid");
  if (
    input.identityMatch !== true ||
    !input.brochureCompletionDate ||
    !input.reraCompletionDate ||
    !input.evidenceVerifiedOn ||
    !input.evidenceReference
  ) {
    return incomplete("possession", 0);
  }
  const differenceDays = daysBetween(input.brochureCompletionDate, input.reraCompletionDate);
  const freshnessDays = daysBetween(input.evidenceVerifiedOn, calculatedAt.slice(0, 10));
  if (differenceDays === null || freshnessDays === null)
    return incomplete("possession", 0, "invalid");
  const agreementPoints =
    differenceDays <= 30 ? 50 : differenceDays <= 90 ? 40 : differenceDays <= 180 ? 25 : 0;
  const freshnessPoints =
    freshnessDays <= 90 ? 30 : freshnessDays <= 180 ? 20 : freshnessDays <= 365 ? 10 : 0;
  const statusPoints = input.currentStatusEvidence ? 20 : 0;
  return {
    dimension: "possession",
    score: agreementPoints + freshnessPoints + statusPoints,
    status: "complete",
    coveragePercent: input.currentStatusEvidence ? 100 : 80,
    why: [
      {
        metric: "rera_completion_agreement",
        verifiedInput: `${differenceDays} days difference`,
        comparisonDirection: "lower_is_stronger",
        explanation: `The brochure and RERA completion dates differ by ${differenceDays} days.`,
        evidenceReference: input.evidenceReference,
        evidenceAsOf: input.evidenceVerifiedOn,
      },
      {
        metric: "verification_freshness",
        verifiedInput: `${freshnessDays} days old`,
        comparisonDirection: "lower_is_stronger",
        explanation: `The possession evidence was verified ${freshnessDays} days before this score was calculated.`,
        evidenceReference: input.evidenceReference,
        evidenceAsOf: input.evidenceVerifiedOn,
      },
    ],
  };
}

export function calculatePropScore(input: PropScoreInput): PropScoreResult {
  const dimensions = [
    calculateSpace(input.space),
    calculatePrivacy(input.privacy),
    calculateSpecification(input.specification),
    calculateDeveloper(input.developer),
    calculatePossession(input.possession, input.calculatedAt),
  ];
  const coveragePercent = round(
    dimensions.reduce((sum, dimension) => sum + dimension.coveragePercent, 0) / dimensions.length,
  );
  const invalid = dimensions.some((dimension) => dimension.status === "invalid");
  const complete = dimensions.every(
    (dimension): dimension is DimensionScore & { score: number } =>
      dimension.status === "complete" && dimension.score !== null,
  );
  return {
    methodologyVersion: PROPSCORE_METHODOLOGY_VERSION,
    composite: complete
      ? round(dimensions.reduce((sum, dimension) => sum + dimension.score, 0) / dimensions.length)
      : null,
    status: invalid ? "invalid" : complete ? "complete" : "insufficient_evidence",
    coveragePercent,
    dimensions,
  };
}
