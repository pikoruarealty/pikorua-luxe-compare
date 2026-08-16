import { describe, expect, it } from "vitest";

import { assertConsumerPayloadSafe, publicPropertySummarySchema } from "./consumer";

describe("consumer contract leakage guard", () => {
  it("accepts an explicit safe summary", () => {
    const summary = publicPropertySummarySchema.parse({
      id: "00000000-0000-4000-8000-000000000001",
      slug: "safe-project",
      name: "Safe Project",
      developerName: null,
      propertyType: "apartment",
      locality: "Ahmedabad",
      cityName: "Ahmedabad",
      heroImageUrl: null,
      ratingAverage: null,
      publishedReviewCount: 0,
    });
    expect(() => assertConsumerPayloadSafe(summary)).not.toThrow();
  });

  it.each(["price", "price_summary", "rate", "privateUpperBoundRupees", "reviewerNote"])(
    "rejects forbidden key %s at any depth",
    (key) => {
      expect(() => assertConsumerPayloadSafe({ safe: [{ [key]: 123456789 }] })).toThrow(
        "Forbidden consumer field",
      );
    },
  );

  it("uses strict projections so extra commercial keys cannot serialize", () => {
    expect(() =>
      publicPropertySummarySchema.parse({
        id: "00000000-0000-4000-8000-000000000001",
        slug: "unsafe-project",
        name: "Unsafe",
        developerName: null,
        propertyType: "apartment",
        locality: null,
        cityName: "Ahmedabad",
        heroImageUrl: null,
        ratingAverage: null,
        publishedReviewCount: 0,
        baseSalePriceRupees: 987654321,
      }),
    ).toThrow();
  });
});
