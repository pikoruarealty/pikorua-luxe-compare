export type PropertyStatus = string;
export type PropertyCategory = "Apartment" | "Bungalow" | "Plots";
export type ConfigKey = "4 BHK" | "5 BHK" | "Penthouse" | "Duplex";

export interface PropertyGallery {
  livingRoom: string;
  pool: string;
  clubhouse: string;
  masterBedroom: string;
}

export interface ConfigDetail {
  /** Layout variant label when a BHK has multiple distinct sizes, e.g. "Type A". Undefined when there's only one layout. */
  type?: string;
  area: string | null; // super built-up sqft
  carpet: string | null; // carpet sqft
  builtUpArea?: string | null;
  price: string | null; // price in Cr
  rate: string | null; // basic rate per sqft
  bathrooms?: string | null;
  balconies?: string | null;
  servantRoom?: string | null; // "Yes" / "No"
  livingArea?: string | null;
  kitchen?: string | null;
  bedroom1?: string | null; // Master Bedroom 1
  bedroom2?: string | null; // Master Bedroom 2
  bedroom3?: string | null;
  bedroom4?: string | null;
  bedroom5?: string | null;
}

/** One BHK bucket can hold multiple layout variants (e.g. 5 BHK Type A/B/C) —
 *  always an array, even when a property only offers a single layout. */
export type PropertyConfigurations = Partial<Record<ConfigKey, ConfigDetail[]>>;

export interface Property {
  id: string;
  name: string;
  developer: string;
  category: PropertyCategory;
  tagline: string;
  image: string;
  size: string;
  sizeNumeric: number;
  superBuiltUpArea: string;
  carpetArea: string;
  location: string;
  state: string;
  city: string;
  status: PropertyStatus;
  configuration: string; // summary string e.g. "4, 5 BHK · Penthouse"
  configurations: PropertyConfigurations;
  pricePerSqft: string;
  possession: string;
  amenities: string[];
  advantages: string[];
  gallery: PropertyGallery;
  expertNote: string;
  // Project structure — optional until backed by their own Supabase columns
  // and admin form fields (tracked separately; UI already renders them).
  plotSize?: string | null;
  totalTowers?: number | null;
  totalFloors?: number | null;
  unitsPerFloor?: number | null;
  totalUnits?: number | null;
  availableBhkTypes?: string | null;
  // RERA registration — shown in Identity, next to Developer.
  reraId?: string | null;
  reraUrl?: string | null;
  // Construction & amenities — same "optional until wired" status as above.
  parkingLevels?: number | null;
  podiumStructure?: string | null;
  liftsPerTower?: number | null;
  openSpace?: string | null;
  geyserHeatPumpProvided?: string | null;
  vrvAcProvided?: string | null;
  windowGlazing?: string | null;
  bathSanitaryFittings?: string | null;
  flooringType?: string | null;
  unitsPerAcre?: string | null;
  constructionQuality?: string | null;
  internalCeilingHeight?: string | null;
  clubhouseSize?: string | null;
  // RERA-declared construction start — shown in Location & Timeline.
  proposedStartDateRera?: string | null;
  // Date the `possession` duration ("1 Year", "9 Months") was last confirmed —
  // lets the display count down live instead of staying frozen at whatever
  // was typed. Null until admin sets it; possession then just shows as-is.
  possessionAsOf?: string | null;
  // Developer track record — its own section, after Location & Timeline.
  developerBackground?: string | null;
  developerExperienceYears?: number | null;
  totalDeliveredProjects?: number | null;
  ongoingProjects?: number | null;
  notableDeliveredProjects?: string[] | null;
}

export interface ComparisonRow {
  label: string;
  values: string[];
  highlightIndex?: number;
}

export const CONFIG_KEYS: ConfigKey[] = ["4 BHK", "5 BHK", "Penthouse", "Duplex"];
