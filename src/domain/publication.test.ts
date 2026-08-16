import { describe, expect, it } from "vitest";

import { assertSubmissionTransition, publicationRevisionSchema } from "./publication";

describe("publication workflow", () => {
  it("accepts the locked review path and rejects developer-to-published jumps", () => {
    expect(() => assertSubmissionTransition("in_review", "approved")).not.toThrow();
    expect(() => assertSubmissionTransition("approved", "published")).not.toThrow();
    expect(() => assertSubmissionTransition("draft", "published")).toThrow(
      "Invalid submission transition",
    );
  });

  it("requires a value whenever area is stated", () => {
    const result = publicationRevisionSchema.safeParse({
      schemaVersion: 1,
      marketId: "00000000-0000-4000-8000-000000000001",
      property: {
        name: "Project",
        developerName: null,
        propertyType: "apartment",
        addressLine: null,
        locality: null,
        stateCode: "GJ",
        cityCode: "ahmedabad",
        reraRegistration: null,
        possessionDate: null,
        heroImageUrl: null,
      },
      configurations: [
        {
          optionId: "00000000-0000-4000-8000-000000000002",
          kind: "4_bhk",
          variantName: null,
          areaValue: null,
          areaBasis: null,
          areaUnit: null,
          areaState: "stated",
          bathrooms: null,
          bathroomsState: "not_stated",
          balconies: null,
          balconiesState: "not_stated",
          publicFacts: {},
          commercial: {
            baseSalePriceRupees: null,
            rateRupeesPerSqFt: null,
            rateAreaBasis: null,
          },
        },
      ],
      assetIds: [],
      reraVerification: null,
    });
    expect(result.success).toBe(false);
  });
});
