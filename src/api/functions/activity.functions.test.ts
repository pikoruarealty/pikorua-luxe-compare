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
});
