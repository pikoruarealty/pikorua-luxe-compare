export const REVIEW_DIMENSIONS = [
  "sales_experience",
  "carpet_vs_promised",
  "construction",
  "density",
  "noise",
  "approach",
  "negotiation",
] as const;

export type ReviewDimension = (typeof REVIEW_DIMENSIONS)[number];

export const REVIEW_DIMENSION_LABELS: Record<ReviewDimension, string> = {
  sales_experience: "Sales experience",
  carpet_vs_promised: "Carpet area vs promise",
  construction: "Construction",
  density: "Density",
  noise: "Noise",
  approach: "Approach",
  negotiation: "Negotiation",
};

export type StructuredReviewDimension = {
  dimension: ReviewDimension;
  experienceState: "experienced" | "not_experienced";
  rating: number | null;
  note: string | null;
};

export function validateDimensions(values: StructuredReviewDimension[]) {
  if (values.length !== REVIEW_DIMENSIONS.length) throw new Error("Every review area is required");
  const seen = new Set(values.map((value) => value.dimension));
  if (seen.size !== REVIEW_DIMENSIONS.length || REVIEW_DIMENSIONS.some((key) => !seen.has(key))) {
    throw new Error("Review areas are incomplete");
  }
  for (const value of values) {
    if (
      value.experienceState === "experienced" &&
      (!Number.isInteger(value.rating) || value.rating! < 1 || value.rating! > 5)
    ) {
      throw new Error("Experienced areas require a rating from 1 to 5");
    }
    if (value.experienceState === "not_experienced" && value.rating !== null) {
      throw new Error("Areas not experienced cannot be rated");
    }
  }
}
