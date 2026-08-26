import { describe, expect, it } from "vitest";

import { matchAmenities, mergeAmenitiesOther, type AmenityCatalogEntry } from "./amenity-mapping";

const catalog: AmenityCatalogEntry[] = [
  { code: "gym", displayName: "Gymnasium" },
  { code: "yoga_deck", displayName: "Yoga Deck" },
  { code: "swimming_pool", displayName: "Swimming Pool" },
  { code: "kids_pool", displayName: "Kids Pool" },
  { code: "co_working", displayName: "Co-working Space" },
  { code: "mini_theatre", displayName: "Mini Theatre" },
  { code: "video_door_phone", displayName: "Video Door Phone" },
  { code: "power_backup", displayName: "Power Backup" },
  { code: "visitor_parking", displayName: "Visitor Parking" },
  { code: "cctv", displayName: "CCTV" },
];

describe("matchAmenities", () => {
  it("matches exact catalog display names case-insensitively", () => {
    const result = matchAmenities(["Gymnasium", "swimming pool"], catalog);
    expect(result.matched).toEqual([
      { code: "gym", rawText: "Gymnasium" },
      { code: "swimming_pool", rawText: "swimming pool" },
    ]);
    expect(result.unmatched).toEqual([]);
  });

  it("matches known synonyms from real-world brochure phrasing", () => {
    const result = matchAmenities(
      ["Kid Pool", "Business Center", "Home Theatre", "VDP", "DG Backup", "Guest Parking"],
      catalog,
    );
    expect(result.matched.map((m) => m.code)).toEqual([
      "kids_pool",
      "co_working",
      "mini_theatre",
      "video_door_phone",
      "power_backup",
      "visitor_parking",
    ]);
    expect(result.unmatched).toEqual([]);
  });

  it("tolerates punctuation and whitespace variance", () => {
    const result = matchAmenities(["  co-working   space ", "24x7 CCTV"], catalog);
    expect(result.matched.map((m) => m.code)).toEqual(["co_working", "cctv"]);
  });

  it("leaves floor-plan noise and uncatalogued items unmatched", () => {
    const result = matchAmenities(
      ["TOILET", "MANAGER CABIN", "Club House", "3 Reserved Car Parking"],
      catalog,
    );
    expect(result.matched).toEqual([]);
    expect(result.unmatched).toEqual([
      "TOILET",
      "MANAGER CABIN",
      "Club House",
      "3 Reserved Car Parking",
    ]);
  });

  it("preserves the developer's original phrasing as rawText, not the canonical name", () => {
    const result = matchAmenities(["Infinity Pool"], catalog);
    expect(result.matched).toEqual([{ code: "swimming_pool", rawText: "Infinity Pool" }]);
  });
});

describe("mergeAmenitiesOther", () => {
  it("returns null when nothing exists and nothing is unmatched", () => {
    expect(mergeAmenitiesOther(null, [])).toBeNull();
  });

  it("joins unmatched items when there is no existing text", () => {
    expect(mergeAmenitiesOther(null, ["Club House", "Sky Lounge"])).toBe("Club House · Sky Lounge");
  });

  it("appends unmatched items to existing developer-typed text", () => {
    expect(mergeAmenitiesOther("Club House", ["Sky Lounge"])).toBe("Club House · Sky Lounge");
  });

  it("dedupes case-insensitively so a re-publish is idempotent", () => {
    expect(mergeAmenitiesOther("Club House · Sky Lounge", ["club house", "Sky Lounge"])).toBe(
      "Club House · Sky Lounge",
    );
  });
});
