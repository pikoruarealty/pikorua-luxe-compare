import { describe, expect, it } from "vitest";
import { approvedMetadata } from "./activity.functions";

describe("production analytics allowlist", () => {
  it("removes commercial and contact values from preference analytics", () => {
    expect(
      approvedMetadata("quiz_completed", {
        marketId: "ahmedabad",
        budgetBandId: "5_cr",
        configurationOptionIds: ["4_bhk"],
        propertyTypeIds: ["apartment"],
        exactPrice: 91_827_364,
        phone: "+919999999999",
        email: "private@example.com",
      }),
    ).toEqual({
      marketId: "ahmedabad",
      budgetBandId: "5_cr",
      configurationOptionIds: ["4_bhk"],
      propertyTypeIds: ["apartment"],
    });
  });

  it("does not accept arbitrary metadata for other events", () => {
    expect(approvedMetadata("property_view", { price: 56_473_829 })).toEqual({});
  });

  it("accepts only a normalized comparison set and approved context", () => {
    expect(
      approvedMetadata("compare_open", {
        propertySlugs: ["zeta-residences", "alpha-house"],
        marketId: "ahmedabad",
        budgetBandId: "5_cr",
        exactPrice: 81_234_567,
        phone: "+919999999999",
      }),
    ).toEqual({
      propertySlugs: ["alpha-house", "zeta-residences"],
      marketId: "ahmedabad",
      budgetBandId: "5_cr",
    });
  });

  it("accepts structured comparison feedback without free text", () => {
    expect(
      approvedMetadata("comparison_feedback", {
        feedbackId: "2f1b9892-f592-48da-9043-7643f28825c8",
        propertySlugs: ["alpha-house", "zeta-residences"],
        selectedPropertySlug: "alpha-house",
        reasonCodes: ["space", "price_band"],
        note: "Call me",
        exactPrice: 90_000_000,
      }),
    ).toEqual({
      feedbackId: "2f1b9892-f592-48da-9043-7643f28825c8",
      propertySlugs: ["alpha-house", "zeta-residences"],
      selectedPropertySlug: "alpha-house",
      reasonCodes: ["space", "price_band"],
    });
  });

  it("rejects invalid selections, duplicate slugs, unknown reasons and oversized reason sets", () => {
    const base = {
      feedbackId: "2f1b9892-f592-48da-9043-7643f28825c8",
      propertySlugs: ["alpha-house", "zeta-residences"],
      selectedPropertySlug: "alpha-house",
    };
    expect(
      approvedMetadata("comparison_feedback", {
        ...base,
        selectedPropertySlug: "other",
        reasonCodes: [],
      }),
    ).toEqual({});
    expect(
      approvedMetadata("comparison_feedback", {
        ...base,
        propertySlugs: ["alpha-house", "alpha-house"],
        reasonCodes: [],
      }),
    ).toEqual({});
    expect(approvedMetadata("comparison_feedback", { ...base, reasonCodes: ["unknown"] })).toEqual(
      {},
    );
    expect(
      approvedMetadata("comparison_feedback", {
        ...base,
        reasonCodes: ["space", "location", "price_band", "specification"],
      }),
    ).toEqual({});
  });
});
