import { describe, expect, it } from "vitest";
import {
  type ConfigDetailInput,
  emptyConfigDetail,
  emptyPropertyForm,
  parsePropertySubmission,
  propertyFormSchema,
} from "./property-schema";

const validProperty = () => ({ ...emptyPropertyForm(), name: "A valid property" });

describe("property form input bounds", () => {
  it("rejects oversized short and long text fields", () => {
    expect(() => propertyFormSchema.parse({ ...validProperty(), name: "n".repeat(201) })).toThrow();
    expect(() =>
      propertyFormSchema.parse({ ...validProperty(), expertNote: "n".repeat(5_001) }),
    ).toThrow();
  });

  it("rejects oversized lists and configuration buckets", () => {
    expect(() =>
      propertyFormSchema.parse({
        ...validProperty(),
        amenities: Array.from({ length: 101 }, (_, index) => `Amenity ${index}`),
      }),
    ).toThrow();
    expect(() =>
      propertyFormSchema.parse({
        ...validProperty(),
        configs: { ...emptyPropertyForm().configs, bhk4: Array(21).fill(emptyConfigDetail()) },
      }),
    ).toThrow();
  });

  it("accepts only http(s) URLs for public links and images", () => {
    for (const field of ["imageUrl", "reraUrl"] as const) {
      expect(() =>
        propertyFormSchema.parse({ ...validProperty(), [field]: "javascript:alert(1)" }),
      ).toThrow();
    }
    expect(() =>
      propertyFormSchema.parse({
        ...validProperty(),
        gallery: {
          livingRoom: "data:text/html,tracking",
          pool: "",
          clubhouse: "",
          masterBedroom: "",
        },
      }),
    ).toThrow();
  });

  it("rejects an oversized serialised submission even when each field is within its cap", () => {
    const detail = Object.fromEntries(
      Object.keys(emptyConfigDetail()).map((key) => [key, "x".repeat(200)]),
    ) as unknown as ConfigDetailInput;
    const bucket = Array.from({ length: 20 }, () => detail);
    expect(() =>
      parsePropertySubmission({
        ...validProperty(),
        configs: { bhk3: bucket, bhk4: bucket, bhk5: bucket, penthouse: bucket, duplex: bucket },
      }),
    ).toThrow(/submission is too large/i);
  });
});
