import { describe, expect, it } from "vitest";
import { isFeatureEnabled, requireFeature } from "./feature-flags.server";

describe("server feature flags", () => {
  it("defaults every missing flag off", () => {
    expect(isFeatureEnabled("V2_CATALOGUE", {})).toBe(false);
  });

  it.each(["1", "true", "TRUE", " true "])("accepts %s as enabled", (value) => {
    expect(isFeatureEnabled("V2_COMPARISON", { V2_COMPARISON: value })).toBe(true);
  });

  it.each(["", "0", "false", "yes"])("keeps %s disabled", (value) => {
    expect(isFeatureEnabled("V2_REVIEWS", { V2_REVIEWS: value })).toBe(false);
  });

  it("fails closed with a generic error", () => {
    expect(() => requireFeature("V2_ENQUIRIES", {})).toThrow("Feature unavailable");
  });

  it("keeps PropScore dark unless its server flag is explicitly enabled", () => {
    expect(isFeatureEnabled("V2_PROPSCORE", {})).toBe(false);
    expect(isFeatureEnabled("V2_PROPSCORE", { V2_PROPSCORE: "1" })).toBe(true);
  });

  it("keeps developer intelligence dark unless explicitly enabled", () => {
    expect(isFeatureEnabled("V2_DEVELOPER_INTELLIGENCE", {})).toBe(false);
    expect(isFeatureEnabled("V2_DEVELOPER_INTELLIGENCE", { V2_DEVELOPER_INTELLIGENCE: "1" })).toBe(
      true,
    );
  });
});
