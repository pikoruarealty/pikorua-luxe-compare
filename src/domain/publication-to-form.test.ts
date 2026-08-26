import { describe, expect, it } from "vitest";

import { publicationRevisionSchema } from "./publication";
import { buildPublicationRevision } from "./publication-mapping.server";
import { buildFormValuesFromRevision } from "./publication-to-form.server";
import {
  emptyConfigDetail,
  emptyPropertyForm,
  propertyFormSchema,
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

const names = { stateName: "Gujarat", cityName: "Ahmedabad" };

function apartmentValues(): PropertyFormValues {
  return {
    ...emptyPropertyForm(),
    name: "Ikebana",
    developer: "Gala",
    category: "Apartment",
    tagline: "Riverfront living in Vastrapur",
    location: "Off SG Highway, Vastrapur",
    status: "Under construction",
    possession: "Dec 2027",
    possessionAsOf: "2026-06-01",
    expertNote: "Best-in-class clubhouse for the price band.",
    imageUrl: "https://example.com/hero.jpg",
    gallery: {
      livingRoom: "https://example.com/living.jpg",
      pool: "https://example.com/pool.jpg",
      clubhouse: "",
      masterBedroom: "https://example.com/bed.jpg",
    },
    amenities: ["Swimming pool", "Gym"],
    advantages: ["Walk to metro"],
    availableBhkTypes: "4 BHK",
    reraId: "PR/GJ/AHMEDABAD/1234",
    reraUrl: "https://gujrera.gujarat.gov.in/project/1234",
    totalTowers: "3",
    totalFloors: "24",
    openSpace: "70",
    internalCeilingHeight: "10.5",
    ceilingHeightBasis: "clear",
    possessionConfirmedAsOf: "2026-01-15",
    amenitiesOther: "Pet spa",
    notableDeliveredProjects: ["Godrej Garden City"],
    configs: {
      ...emptyPropertyForm().configs,
      bhk4: [
        {
          ...emptyConfigDetail(),
          type: "Type A",
          area: "3200",
          carpet: "133.93 SQ.MT.",
          bathrooms: "4",
          balconies: "3",
          servantRoom: "Yes",
          plotSize: "300 sq yd",
          livingArea: "18x14",
          bedroom1: "14x12",
          price: "3.5",
          rate: "10500",
        },
      ],
    },
  };
}

/** Fields the round trip is known to lose, each for a reason recorded in
 *  publication-to-form.server.ts. Asserted explicitly so the loss stays a
 *  deliberate, visible list rather than something a future reader discovers in
 *  production. */
const KNOWN_LOSSY = new Set(["state", "city", "isPublished"]);

describe("buildFormValuesFromRevision", () => {
  it("round-trips an apartment back to the form values it came from", () => {
    const original = apartmentValues();
    const revision = publicationRevisionSchema.parse(buildPublicationRevision(original, lookup));
    const restored = buildFormValuesFromRevision(revision, names);

    // The result must be a valid form payload, or the developer portal would
    // fail to load it into the form at all.
    expect(propertyFormSchema.safeParse(restored).success).toBe(true);

    for (const key of Object.keys(original) as (keyof PropertyFormValues)[]) {
      if (KNOWN_LOSSY.has(key) || key === "configs") continue;
      expect(restored[key], key).toEqual(original[key]);
    }
  });

  it("keeps the brochure's own area wording rather than the converted number", () => {
    const revision = publicationRevisionSchema.parse(
      buildPublicationRevision(apartmentValues(), lookup),
    );
    const restored = buildFormValuesFromRevision(revision, names);
    // 133.93 m² is stored as 1441.6 sq ft. Printing that number back into the
    // field would silently rewrite what the developer typed.
    expect(restored.configs.bhk4[0].carpet).toBe("133.93 SQ.MT.");
    expect(restored.configs.bhk4[0].area).toBe("3200");
  });

  it("restores rooms, price and rate on a configuration", () => {
    const revision = publicationRevisionSchema.parse(
      buildPublicationRevision(apartmentValues(), lookup),
    );
    const detail = buildFormValuesFromRevision(revision, names).configs.bhk4[0];
    expect(detail.type).toBe("Type A");
    expect(detail.livingArea).toBe("18x14");
    expect(detail.bedroom1).toBe("14x12");
    expect(detail.bedroom2).toBeNull();
    expect(detail.price).toBe("3.5");
    expect(detail.rate).toBe("10500");
    expect(detail.bathrooms).toBe("4");
    expect(detail.plotSize).toBe("300 sq yd");
  });

  it("reduces free-text servant room prose to yes/no, as documented", () => {
    const values = apartmentValues();
    values.configs.bhk4[0].servantRoom = "Yes, with attached toilet";
    const revision = publicationRevisionSchema.parse(buildPublicationRevision(values, lookup));
    // Lossy on purpose: the catalogue stores a boolean, so the wording is gone.
    expect(buildFormValuesFromRevision(revision, names).configs.bhk4[0].servantRoom).toBe("Yes");
  });

  it("unwinds a synthesized plot configuration back into the plot area fields", () => {
    const values: PropertyFormValues = {
      ...apartmentValues(),
      category: "Plots",
      plotSuperArea: "12000",
      plotCarpetArea: "8000",
      configs: emptyPropertyForm().configs,
    };
    const revision = publicationRevisionSchema.parse(buildPublicationRevision(values, lookup));
    const restored = buildFormValuesFromRevision(revision, names);
    expect(restored.category).toBe("Plots");
    expect(restored.plotSuperArea).toBe("12000");
    expect(restored.plotCarpetArea).toBe("8000");
    // The synthesized configuration is not a BHK layout and must not surface
    // as one, or every republish would grow a phantom variant.
    expect(Object.values(restored.configs).every((bucket) => bucket.length === 0)).toBe(true);
  });

  it("reads a revision stored before the presentation field existed", () => {
    // Publication revisions are immutable, so pre-C3a payloads can never gain
    // the key; they parse with the empty default and must not throw here.
    const raw = buildPublicationRevision(apartmentValues(), lookup) as Record<string, unknown>;
    delete raw.presentation;
    const revision = publicationRevisionSchema.parse(raw);
    const restored = buildFormValuesFromRevision(revision, names);
    expect(restored.tagline).toBe("");
    expect(restored.amenities).toEqual([]);
    expect(restored.gallery).toEqual({
      livingRoom: "",
      pool: "",
      clubhouse: "",
      masterBedroom: "",
    });
    expect(restored.name).toBe("Ikebana");
  });
});
