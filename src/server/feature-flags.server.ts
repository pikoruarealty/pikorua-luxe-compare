export const FEATURE_FLAGS = [
  "V2_CATALOGUE",
  "V2_COMPARISON",
  "V2_REVIEWS",
  "V2_ENQUIRIES",
  "V2_OCR",
  "V2_PROPSCORE",
] as const;

export type FeatureFlag = (typeof FEATURE_FLAGS)[number];

const ENABLED_VALUES = new Set(["1", "true"]);

/**
 * Server-only feature switch. Flags deliberately default off and are never
 * exposed through Vite's public environment so a client cannot opt itself in.
 */
export function isFeatureEnabled(flag: FeatureFlag, env = process.env): boolean {
  return ENABLED_VALUES.has((env[flag] ?? "").trim().toLowerCase());
}

export function requireFeature(flag: FeatureFlag, env = process.env): void {
  if (!isFeatureEnabled(flag, env)) {
    throw new Error("Feature unavailable");
  }
}
