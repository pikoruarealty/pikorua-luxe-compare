import { z } from "zod";

// Mirrors ConfigDetail from src/types/property.ts — the admin-editable shape of
// one layout variant within a BHK bucket.
export const configDetailSchema = z.object({
  type: z.string().optional(),
  area: z.string().nullable().optional().default(null),
  carpet: z.string().nullable().optional().default(null),
  price: z.string().nullable().optional().default(null),
  rate: z.string().nullable().optional().default(null),
  livingArea: z.string().nullable().optional().default(null),
  kitchen: z.string().nullable().optional().default(null),
  bedroom1: z.string().nullable().optional().default(null),
  bedroom2: z.string().nullable().optional().default(null),
  bedroom3: z.string().nullable().optional().default(null),
  bedroom4: z.string().nullable().optional().default(null),
  bedroom5: z.string().nullable().optional().default(null),
});

export type ConfigDetailInput = z.infer<typeof configDetailSchema>;

// Internal safe keys (no spaces) used as form field-array names; translated to
// the real ConfigKey strings ("4 BHK", etc.) only at submit/load time.
export const CONFIG_BUCKETS = [
  { key: "bhk4", label: "4 BHK" },
  { key: "bhk5", label: "5 BHK" },
  { key: "penthouse", label: "Penthouse" },
  { key: "duplex", label: "Duplex" },
] as const;

export const propertyFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  developer: z.string().trim().optional().default(""),
  category: z.enum(["Apartment", "Bungalow", "Plots"]),
  tagline: z.string().trim().optional().default(""),
  location: z.string().trim().optional().default(""),
  state: z.string().trim().optional().default(""),
  city: z.string().trim().optional().default(""),
  status: z.string().trim().optional().default(""),
  possession: z.string().trim().optional().default(""),
  expertNote: z.string().trim().optional().default(""),
  imageUrl: z.string().trim().optional().default(""),
  gallery: z
    .object({
      livingRoom: z.string().trim().optional().default(""),
      pool: z.string().trim().optional().default(""),
      clubhouse: z.string().trim().optional().default(""),
      masterBedroom: z.string().trim().optional().default(""),
    })
    .optional()
    .default({}),
  // Only meaningful for Bungalow / Plots categories.
  plotSuperArea: z.string().trim().optional().default(""),
  plotCarpetArea: z.string().trim().optional().default(""),
  amenities: z.array(z.string().trim().min(1)).default([]),
  advantages: z.array(z.string().trim().min(1)).default([]),
  configs: z.object({
    bhk4: z.array(configDetailSchema).default([]),
    bhk5: z.array(configDetailSchema).default([]),
    penthouse: z.array(configDetailSchema).default([]),
    duplex: z.array(configDetailSchema).default([]),
  }),
  isPublished: z.boolean().default(true),
});

export type PropertyFormValues = z.infer<typeof propertyFormSchema>;

export function emptyConfigDetail(): ConfigDetailInput {
  return {
    type: "",
    area: null,
    carpet: null,
    price: null,
    rate: null,
    livingArea: null,
    kitchen: null,
    bedroom1: null,
    bedroom2: null,
    bedroom3: null,
    bedroom4: null,
    bedroom5: null,
  };
}

export function emptyPropertyForm(): PropertyFormValues {
  return {
    name: "",
    developer: "",
    category: "Apartment",
    tagline: "",
    location: "",
    state: "Gujarat",
    city: "Ahmedabad",
    status: "",
    possession: "",
    expertNote: "",
    imageUrl: "",
    gallery: { livingRoom: "", pool: "", clubhouse: "", masterBedroom: "" },
    plotSuperArea: "",
    plotCarpetArea: "",
    amenities: [],
    advantages: [],
    configs: { bhk4: [], bhk5: [], penthouse: [], duplex: [] },
    isPublished: true,
  };
}
