import { describe, expect, it } from "vitest";

import {
  REVIEW_DIMENSIONS,
  type StructuredReviewDimension,
  validateDimensions,
} from "./structured-reviews";

const valid = (): StructuredReviewDimension[] =>
  REVIEW_DIMENSIONS.map((dimension) => ({
    dimension,
    experienceState: "not_experienced" as const,
    rating: null,
    note: null,
  }));

describe("structured reviews", () => {
  it("accepts each required area when marked not experienced", () => {
    expect(() => validateDimensions(valid())).not.toThrow();
  });

  it("requires a rating for an experienced area", () => {
    const values = valid();
    values[0] = { ...values[0], experienceState: "experienced" };
    expect(() => validateDimensions(values)).toThrow("rating");
  });

  it("rejects ratings for areas not experienced", () => {
    const values = valid();
    values[0] = { ...values[0], rating: 5 };
    expect(() => validateDimensions(values)).toThrow("cannot be rated");
  });
});
