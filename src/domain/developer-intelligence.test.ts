import { describe, expect, it } from "vitest";
import {
  aggregateBehaviour,
  aggregateSentiment,
  assertIntelligencePayloadSafe,
  calculateTrend,
  isEntitlementActive,
  type RawIntelligenceEvent,
} from "./developer-intelligence";

const now = new Date("2026-08-21T12:00:00.000Z");
const open = (
  actorKey: string,
  day: number,
  slugs = ["alpha", "beta"],
  budgetBandId = "5_cr",
): RawIntelligenceEvent => ({
  eventName: "compare_open",
  actorKey,
  occurredAt: `2026-08-${String(day).padStart(2, "0")}T10:00:00.000Z`,
  metadata: { propertySlugs: slugs, budgetBandId },
});

describe("developer intelligence domain", () => {
  it("deduplicates the same actor, day and comparison set", () => {
    const events = [
      open("a", 20),
      open("a", 20),
      open("b", 20),
      open("c", 20),
      open("d", 20),
      open("e", 20),
    ];
    const result = aggregateBehaviour(events, "alpha", "5_cr", now);
    expect(result.comparisonVolume.current).toBe(5);
  });

  it("suppresses behaviour below five sessions and exposes it at five", () => {
    expect(
      aggregateBehaviour(
        ["a", "b", "c", "d"].map((actor) => open(actor, 20)),
        "alpha",
        "5_cr",
        now,
      ).comparisonVolume.suppressed,
    ).toBe(true);
    expect(
      aggregateBehaviour(
        ["a", "b", "c", "d", "e"].map((actor) => open(actor, 20)),
        "alpha",
        "5_cr",
        now,
      ).comparisonVolume.suppressed,
    ).toBe(false);
  });

  it("uses the latest feedback revision and separates chosen from rejected reasons", () => {
    const opens = ["a", "b", "c", "d", "e"].map((actor) => open(actor, 20));
    const feedback = ["a", "b", "c", "d", "e"].flatMap((actor, index) => {
      const feedbackId = `00000000-0000-4000-8000-00000000000${index}`;
      return [
        {
          eventName: "comparison_feedback" as const,
          actorKey: actor,
          occurredAt: "2026-08-20T10:01:00.000Z",
          metadata: {
            feedbackId,
            propertySlugs: ["alpha", "beta"],
            selectedPropertySlug: "beta",
            reasonCodes: ["location"],
          },
        },
        {
          eventName: "comparison_feedback" as const,
          actorKey: actor,
          occurredAt: "2026-08-20T10:02:00.000Z",
          metadata: {
            feedbackId,
            propertySlugs: ["alpha", "beta"],
            selectedPropertySlug: "alpha",
            reasonCodes: ["space"],
          },
        },
      ];
    });
    const result = aggregateBehaviour([...opens, ...feedback], "alpha", "5_cr", now);
    expect(result.chosenReasons).toEqual([{ code: "space", responses: 5, sharePercent: 100 }]);
    expect(result.rejectedReasons).toEqual([]);
  });

  it("classifies buyer-band position and handles zero-prior trends", () => {
    const events = ["a", "b", "c", "d", "e"].map((actor) =>
      open(actor, 20, ["alpha", "beta"], "3_4_cr"),
    );
    const result = aggregateBehaviour(events, "alpha", "5_cr", now);
    expect(result.bandPositioning.above).toBe(5);
    expect(calculateTrend(5, 0)).toBe("new");
    expect(calculateTrend(0, 0)).toBeNull();
  });

  it("fails entitlements closed outside their active interval", () => {
    expect(isEntitlementActive(null, now)).toBe(false);
    expect(
      isEntitlementActive({ status: "suspended", startsAt: "2026-08-01", endsAt: null }, now),
    ).toBe(false);
    expect(
      isEntitlementActive({ status: "active", startsAt: "2026-08-01", endsAt: "2026-09-01" }, now),
    ).toBe(true);
    expect(
      isEntitlementActive({ status: "active", startsAt: "2026-09-01", endsAt: null }, now),
    ).toBe(false);
  });

  it("rejects identity and exact commercial fields at the response boundary", () => {
    expect(() =>
      assertIntelligencePayloadSafe({ project: { id: "safe" }, sessions: 8 }),
    ).not.toThrow();
    expect(() => assertIntelligencePayloadSafe({ profileId: "private" })).toThrow(
      "Forbidden developer-intelligence field",
    );
    expect(() =>
      assertIntelligencePayloadSafe({ nested: { privateUpperBoundRupees: 90_000_000 } }),
    ).toThrow("Forbidden developer-intelligence field");
  });

  it("excludes hidden/deleted and not-experienced rows upstream and suppresses small dimensions", () => {
    const rows = [1, 2, 3, 4, 5].map((rating) => ({
      reviewId: String(rating),
      dimension: "space" as never,
      rating,
      publishedAt: "2026-08-20T10:00:00.000Z",
    }));
    const actualRows = rows.map((row) => ({ ...row, dimension: "sales_experience" as const }));
    const sentiment = aggregateSentiment(actualRows, now);
    expect(sentiment.find((item) => item.dimension === "sales_experience")).toMatchObject({
      average: 3,
      reviewCount: 5,
      suppressed: false,
    });
    expect(sentiment.find((item) => item.dimension === "construction")?.suppressed).toBe(true);
  });
});
