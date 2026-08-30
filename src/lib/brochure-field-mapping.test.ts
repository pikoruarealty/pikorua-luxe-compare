import { describe, expect, it } from "vitest";

import {
  mapExtractedPayload,
  mergeReviewedExtraction,
  type PropertyExtraction,
} from "./brochure-field-mapping";
import { emptyConfigDetail, emptyPropertyForm } from "./property-schema";

const field = (value: string) => ({
  value,
  found: true,
  confidence: 1,
  source_file: "brochure.pdf",
  source_page: 1,
  evidence: value,
  verified: false,
  validation_warning: null,
});

describe("mapExtractedPayload", () => {
  it("keeps extractor placeholder prose out of customer-facing form values", () => {
    const extraction = {
      basics: { status: field("Not stated in brochure") },
      configurations: [],
      amenities: [],
      highlights: [],
    } as unknown as PropertyExtraction;

    expect(mapExtractedPayload(extraction).status).toBeUndefined();
  });

  it("keeps actual brochure values", () => {
    const extraction = {
      basics: { status: field("Under construction") },
      configurations: [],
      amenities: [],
      highlights: [],
    } as unknown as PropertyExtraction;

    expect(mapExtractedPayload(extraction).status).toBe("Under construction");
  });

  it("only carries reviewed fields forward when a reviewer selected N/A for the rest", () => {
    const extraction = {
      basics: { status: field("Under construction"), developer: field("Example Developers") },
      configurations: [],
      amenities: [],
      highlights: [],
    } as unknown as PropertyExtraction;

    expect(
      mapExtractedPayload(extraction, {}, { formFields: ["status"], configFields: {} }),
    ).toEqual({ status: "Under construction" });
  });

  it("merges reviewed values without removing saved lists or measurements", () => {
    const current = emptyPropertyForm();
    current.status = "Launching soon";
    current.amenities = ["Gym"];
    current.configs.bhk4 = [{ ...emptyConfigDetail(), type: "Type A", carpet: "1,800" }];

    const merged = mergeReviewedExtraction(current, {
      status: "Under construction",
      amenities: ["Gym", "Pool"],
      configs: {
        ...emptyPropertyForm().configs,
        bhk4: [{ ...emptyConfigDetail(), type: "Type A", area: "2,400" }],
      },
    });

    expect(merged.status).toBe("Under construction");
    expect(merged.amenities).toEqual(["Gym", "Pool"]);
    expect(merged.configs.bhk4[0]).toMatchObject({ carpet: "1,800", area: "2,400" });
  });
});
