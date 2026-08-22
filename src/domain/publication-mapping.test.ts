import { describe, expect, it } from "vitest";

import { publicationRevisionSchema } from "./publication";
import { buildPublicationRevision } from "./publication-mapping.server";
import {
  emptyConfigDetail,
  emptyPropertyForm,
  type PropertyFormValues,
} from "@/lib/property-schema";

const APARTMENT_OPTION_ID = "00000000-0000-4000-8000-000000000010";
const PLOT_OPTION_ID = "00000000-0000-4000-8000-000000000011";
const MARKET_ID = "00000000-0000-4000-8000-000000000001";

const lookup = {
  configurationOptionsByKind: new Map<string, string>([
    ["4_bhk", APARTMENT_OPTION_ID],
    ["plot", PLOT_OPTION_ID],
    ["bungalow", PLOT_OPTION_ID],
  ]) as never,
  marketId: MARKET_ID,
  stateCode: "GJ",
  cityCode: "ahmedabad",
};

function apartmentValues(): PropertyFormValues {
  return {
    ...emptyPropertyForm(),
    name: "Ikebana",
    developer: "Gala",
    category: "Apartment",
    state: "Gujarat",
    city: "Ahmedabad",
    imageUrl: "https://example.com/hero.jpg",
    totalTowers: "3",
    totalFloors: "24",
    openSpace: "70% Open Area",
    internalCeilingHeight: "10.5 ft",
    ceilingHeightBasis: "clear",
    possessionConfirmedAsOf: "2026-01-15",
    amenitiesOther: "Pet spa",
    notableDeliveredProjects: ["Godrej Garden City"],
    configs: {
      bhk4: [
        {
          ...emptyConfigDetail(),
          type: "Type A",
          area: "3,200",
          carpet: "2,100",
          bathrooms: "4",
          balconies: "3",
          servantRoom: "Yes, with attached toilet",
          livingArea: "18x14",
          price: "3.5",
          rate: "10500",
        },
      ],
      bhk3: [],
      bhk5: [],
      penthouse: [],
      duplex: [],
    },
  };
}

describe("buildPublicationRevision", () => {
  it("produces a revision that satisfies publicationRevisionSchema for a typical apartment", () => {
    const revision = buildPublicationRevision(apartmentValues(), lookup);
    const result = publicationRevisionSchema.safeParse(revision);
    if (!result.success) {
      throw new Error(JSON.stringify(result.error.issues, null, 2));
    }
    expect(result.data.configurations).toHaveLength(1);
    expect(result.data.configurations[0].areaValue).toBe(3200);
    expect(result.data.configurations[0].commercial.baseSalePriceRupees).toBe(35_000_000);
    expect(result.data.details.totalTowers).toBe(3);
    expect(result.data.details.ceilingHeightBasis).toBe("clear");
    expect(result.data.details.possessionConfirmedAsOf).toBe("2026-01-15");
  });

  it("skips configuration variants left entirely blank", () => {
    const values = apartmentValues();
    values.configs.bhk3 = [emptyConfigDetail()];
    const revision = buildPublicationRevision(values, lookup);
    expect(revision.configurations).toHaveLength(1);
  });

  it("synthesizes a single configuration for plot/bungalow properties with no bucket configs", () => {
    const values: PropertyFormValues = {
      ...apartmentValues(),
      category: "Plots",
      plotSuperArea: "12000",
      plotCarpetArea: "8000",
      configs: { bhk3: [], bhk4: [], bhk5: [], penthouse: [], duplex: [] },
    };
    const revision = buildPublicationRevision(values, lookup);
    const result = publicationRevisionSchema.safeParse(revision);
    if (!result.success) {
      throw new Error(JSON.stringify(result.error.issues, null, 2));
    }
    expect(result.data.configurations).toHaveLength(1);
    expect(result.data.configurations[0].kind).toBe("plot");
    expect(result.data.configurations[0].areas.map((a) => a.basis).sort()).toEqual([
      "carpet",
      "super_built_up",
    ]);
  });

  it("tolerates a payload saved before the three newer fields existed", () => {
    const legacyValues = apartmentValues() as Record<string, unknown>;
    delete legacyValues.ceilingHeightBasis;
    delete legacyValues.possessionConfirmedAsOf;
    delete legacyValues.amenitiesOther;
    const revision = buildPublicationRevision(legacyValues as PropertyFormValues, lookup);
    const result = publicationRevisionSchema.safeParse(revision);
    if (!result.success) {
      throw new Error(JSON.stringify(result.error.issues, null, 2));
    }
    expect(result.data.details.ceilingHeightBasis).toBe("not_stated");
    expect(result.data.details.possessionConfirmedAsOfState).toBe("not_stated");
  });

  it("ignores a free-text proposedStartDateRera that is not already ISO", () => {
    const values = apartmentValues();
    values.proposedStartDateRera = "Jan 2025";
    const revision = buildPublicationRevision(values, lookup);
    expect(revision.details.proposedStartDateRera).toBeNull();
    expect(revision.details.proposedStartDateReraState).toBe("not_stated");
  });
});
