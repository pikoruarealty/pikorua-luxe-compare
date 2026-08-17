import { describe, expect, it } from "vitest";

import { getBudgetBand } from "./budget";
import {
  classifyBudgetFit,
  rankRecommendationProjects,
  selectPrimaryVariant,
  type PrivateRecommendationProject,
} from "./recommendation";

const budget = {
  id: "test",
  broadLabel: "Test",
  label: "Test",
  minimumRupees: 0,
  maximumRupees: 10_000_000,
};

describe("recommendation rules", () => {
  it("normalizes locked single-value bands", () => {
    expect(getBudgetBand("5_cr")).toMatchObject({
      minimumRupees: 40_000_000,
      maximumRupees: 55_000_000,
    });
    expect(getBudgetBand("21_cr_plus").maximumRupees).toBeNull();
  });

  it("classifies exact and twenty-percent boundaries", () => {
    expect(classifyBudgetFit(10_000_000, 5_000_000, 10_000_000)).toBe("within");
    expect(classifyBudgetFit(12_000_000, 5_000_000, 10_000_000)).toBe("slightly_above");
    expect(classifyBudgetFit(12_000_001, 5_000_000, 10_000_000)).toBe("well_above");
    expect(classifyBudgetFit(null, 5_000_000, 10_000_000)).toBe("unknown");
  });

  it("classifies below-minimum boundaries symmetrically", () => {
    expect(classifyBudgetFit(5_000_000, 5_000_000, 10_000_000)).toBe("within");
    expect(classifyBudgetFit(4_166_667, 5_000_000, 10_000_000)).toBe("slightly_below");
    expect(classifyBudgetFit(4_166_666, 5_000_000, 10_000_000)).toBe("well_below");
    expect(classifyBudgetFit(1_000_000, 20_000_000, null)).toBe("well_below");
  });

  it("selects the highest selected configuration still within budget", () => {
    const selected = selectPrimaryVariant(
      [
        { id: "a", configurationOptionId: "3", privateUpperBoundRupees: 8_000_000, premiumRank: 3 },
        { id: "b", configurationOptionId: "4", privateUpperBoundRupees: 9_500_000, premiumRank: 4 },
        {
          id: "c",
          configurationOptionId: "5",
          privateUpperBoundRupees: 12_000_000,
          premiumRank: 5,
        },
      ],
      new Set(["3", "4", "5"]),
      budget,
    );
    expect(selected?.id).toBe("b");
  });

  it("selects the nearest above when no selected configuration fits", () => {
    const selected = selectPrimaryVariant(
      [
        {
          id: "a",
          configurationOptionId: "3",
          privateUpperBoundRupees: 13_000_000,
          premiumRank: 3,
        },
        {
          id: "b",
          configurationOptionId: "4",
          privateUpperBoundRupees: 11_000_000,
          premiumRank: 4,
        },
      ],
      new Set(["3", "4"]),
      budget,
    );
    expect(selected?.id).toBe("b");
  });

  it("selects the most premium available choice for 21Cr+", () => {
    const selected = selectPrimaryVariant(
      [
        {
          id: "a",
          configurationOptionId: "6",
          privateUpperBoundRupees: 250_000_000,
          premiumRank: 6,
        },
        {
          id: "b",
          configurationOptionId: "penthouse",
          privateUpperBoundRupees: 400_000_000,
          premiumRank: 8,
        },
      ],
      new Set(["6", "penthouse"]),
      getBudgetBand("21_cr_plus"),
    );
    expect(selected?.id).toBe("b");
  });

  it("orders fit groups, closeness, coverage, completeness, then name", () => {
    const projects: PrivateRecommendationProject[] = [
      {
        id: "well",
        name: "Well",
        verifiedDataCompleteness: 100,
        variants: [
          {
            id: "w",
            configurationOptionId: "4",
            privateUpperBoundRupees: 13_000_000,
            premiumRank: 4,
          },
        ],
      },
      {
        id: "near",
        name: "Near",
        verifiedDataCompleteness: 50,
        variants: [
          {
            id: "n",
            configurationOptionId: "4",
            privateUpperBoundRupees: 11_000_000,
            premiumRank: 4,
          },
        ],
      },
      {
        id: "within-far",
        name: "Within Far",
        verifiedDataCompleteness: 100,
        variants: [
          {
            id: "f",
            configurationOptionId: "4",
            privateUpperBoundRupees: 8_000_000,
            premiumRank: 4,
          },
        ],
      },
      {
        id: "within-close",
        name: "Within Close",
        verifiedDataCompleteness: 10,
        variants: [
          {
            id: "c",
            configurationOptionId: "4",
            privateUpperBoundRupees: 9_900_000,
            premiumRank: 4,
          },
        ],
      },
      {
        id: "alternative",
        name: "Alternative",
        verifiedDataCompleteness: 100,
        variants: [
          {
            id: "a",
            configurationOptionId: "5",
            privateUpperBoundRupees: 9_900_000,
            premiumRank: 5,
          },
        ],
      },
    ];
    expect(rankRecommendationProjects(projects, ["4"], budget).map((p) => p.id)).toEqual([
      "within-close",
      "within-far",
      "near",
      "well",
      "alternative",
    ]);
  });
});
