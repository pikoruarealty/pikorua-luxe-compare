import { BUDGET_BANDS } from "@/domain/budget";
import { REVIEW_DIMENSIONS, type ReviewDimension } from "@/domain/structured-reviews";

export const INTELLIGENCE_PRIVACY_FLOOR = 5;
export const INTELLIGENCE_WINDOW_DAYS = 30;

export const INTELLIGENCE_REASON_LABELS = {
  space: "More usable space",
  location: "Location",
  privacy_density: "Privacy and density",
  specification: "Specifications",
  developer_confidence: "Developer confidence",
  possession_timeline: "Possession timeline",
  price_band: "Price band",
} as const;

export type IntelligenceReasonCode = keyof typeof INTELLIGENCE_REASON_LABELS;
export type Trend = number | "new" | null;

export interface RawIntelligenceEvent {
  eventName: "compare_open" | "comparison_feedback";
  actorKey: string | null;
  occurredAt: string;
  metadata: Record<string, unknown>;
}

export interface BehaviourMetrics {
  comparisonVolume: { current: number; previous: number; trend: Trend; suppressed: boolean };
  competitors: Array<{ slug: string; sessions: number; sharePercent: number }>;
  chosenReasons: Array<{ code: IntelligenceReasonCode; responses: number; sharePercent: number }>;
  rejectedReasons: Array<{ code: IntelligenceReasonCode; responses: number; sharePercent: number }>;
  feedbackResponses: number;
  feedbackResponseRatePercent: number | null;
  bandPositioning: {
    below: number;
    aligned: number;
    above: number;
    knownSessions: number;
    coveragePercent: number;
    suppressed: boolean;
  };
}

export interface SentimentRow {
  reviewId: string;
  dimension: ReviewDimension;
  rating: number;
  publishedAt: string;
}

export interface SentimentMetric {
  dimension: ReviewDimension;
  average: number | null;
  reviewCount: number;
  trend: Trend;
  suppressed: boolean;
}

const FORBIDDEN_INTELLIGENCE_KEYS = new Set([
  "profileid",
  "anonymoussessionid",
  "sessionkey",
  "feedbackid",
  "phone",
  "email",
  "exactprice",
  "basesalepricerupees",
  "privatelowerboundrupees",
  "privateupperboundrupees",
]);

export function assertIntelligencePayloadSafe(value: unknown, path = "intelligence"): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertIntelligencePayloadSafe(item, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    const normalized = key.toLowerCase().replace(/[_\s-]/g, "");
    if (FORBIDDEN_INTELLIGENCE_KEYS.has(normalized)) {
      throw new Error(`Forbidden developer-intelligence field at ${path}.${key}`);
    }
    assertIntelligencePayloadSafe(nested, `${path}.${key}`);
  }
}

export function reportingPeriods(now = new Date()) {
  const end = new Date(now);
  const currentStart = new Date(end.getTime() - INTELLIGENCE_WINDOW_DAYS * 86_400_000);
  const previousStart = new Date(currentStart.getTime() - INTELLIGENCE_WINDOW_DAYS * 86_400_000);
  return { previousStart, currentStart, end };
}

export function calculateTrend(current: number, previous: number): Trend {
  if (previous === 0) return current > 0 ? "new" : null;
  return Math.round(((current - previous) / previous) * 1_000) / 10;
}

export function isEntitlementActive(
  entitlement: { status: string; startsAt: Date | string; endsAt: Date | string | null } | null,
  now = new Date(),
) {
  if (!entitlement || entitlement.status !== "active") return false;
  const startsAt = new Date(entitlement.startsAt);
  const endsAt = entitlement.endsAt ? new Date(entitlement.endsAt) : null;
  return startsAt <= now && (!endsAt || endsAt > now);
}

function comparisonSlugs(metadata: Record<string, unknown>): string[] {
  return Array.isArray(metadata.propertySlugs)
    ? metadata.propertySlugs.filter((value): value is string => typeof value === "string").sort()
    : [];
}

function actorDayKey(event: RawIntelligenceEvent) {
  return event.actorKey ? `${event.actorKey}|${event.occurredAt.slice(0, 10)}` : null;
}

function comparisonSessions(
  events: RawIntelligenceEvent[],
  targetSlug: string,
  start: Date,
  end: Date,
) {
  const sessions = new Map<string, { slugs: string[]; budgetBandId: string | null }>();
  for (const event of events) {
    if (event.eventName !== "compare_open") continue;
    const occurredAt = new Date(event.occurredAt);
    if (occurredAt < start || occurredAt >= end) continue;
    const slugs = comparisonSlugs(event.metadata);
    const actorDay = actorDayKey(event);
    if (!actorDay || !slugs.includes(targetSlug) || slugs.length < 2) continue;
    const key = `${actorDay}|${slugs.join(",")}`;
    sessions.set(key, {
      slugs,
      budgetBandId:
        typeof event.metadata.budgetBandId === "string" ? event.metadata.budgetBandId : null,
    });
  }
  return [...sessions.values()];
}

function feedbackForPeriod(events: RawIntelligenceEvent[], start: Date, end: Date) {
  const latest = new Map<string, RawIntelligenceEvent>();
  for (const event of events) {
    if (event.eventName !== "comparison_feedback") continue;
    const occurredAt = new Date(event.occurredAt);
    const feedbackId = event.metadata.feedbackId;
    if (occurredAt < start || occurredAt >= end || typeof feedbackId !== "string") continue;
    const prior = latest.get(feedbackId);
    if (!prior || prior.occurredAt < event.occurredAt) latest.set(feedbackId, event);
  }
  return [...latest.values()];
}

function reasonDistribution(
  feedback: RawIntelligenceEvent[],
  targetSlug: string,
  outcome: "chosen" | "rejected",
) {
  const matching = feedback.filter((event) => {
    const selected = event.metadata.selectedPropertySlug;
    const slugs = comparisonSlugs(event.metadata);
    return (
      slugs.includes(targetSlug) &&
      (outcome === "chosen"
        ? selected === targetSlug
        : typeof selected === "string" && selected !== targetSlug)
    );
  });
  const counts = new Map<IntelligenceReasonCode, number>();
  for (const event of matching) {
    const reasons = Array.isArray(event.metadata.reasonCodes) ? event.metadata.reasonCodes : [];
    for (const reason of reasons) {
      if (typeof reason === "string" && reason in INTELLIGENCE_REASON_LABELS) {
        const code = reason as IntelligenceReasonCode;
        counts.set(code, (counts.get(code) ?? 0) + 1);
      }
    }
  }
  return [...counts.entries()]
    .filter(([, count]) => count >= INTELLIGENCE_PRIVACY_FLOOR)
    .map(([code, responses]) => ({
      code,
      responses,
      sharePercent: matching.length ? Math.round((responses / matching.length) * 100) : 0,
    }))
    .sort((a, b) => b.responses - a.responses);
}

export function aggregateBehaviour(
  events: RawIntelligenceEvent[],
  targetSlug: string,
  propertyBudgetBandId: string | null,
  now = new Date(),
): BehaviourMetrics {
  const { previousStart, currentStart, end } = reportingPeriods(now);
  const current = comparisonSessions(events, targetSlug, currentStart, end);
  const previous = comparisonSessions(events, targetSlug, previousStart, currentStart);
  const suppressed = current.length < INTELLIGENCE_PRIVACY_FLOOR;
  const competitorCounts = new Map<string, number>();
  for (const session of current) {
    for (const slug of session.slugs) {
      if (slug !== targetSlug) competitorCounts.set(slug, (competitorCounts.get(slug) ?? 0) + 1);
    }
  }
  const competitors = suppressed
    ? []
    : [...competitorCounts.entries()]
        .filter(([, sessions]) => sessions >= INTELLIGENCE_PRIVACY_FLOOR)
        .map(([slug, sessions]) => ({
          slug,
          sessions,
          sharePercent: Math.round((sessions / current.length) * 100),
        }))
        .sort((a, b) => b.sessions - a.sessions);

  const feedback = feedbackForPeriod(events, currentStart, end).filter((event) =>
    comparisonSlugs(event.metadata).includes(targetSlug),
  );
  const feedbackResponses = new Set(
    feedback
      .map((event) => event.metadata.feedbackId)
      .filter((id): id is string => typeof id === "string"),
  ).size;

  const bandIndex = new Map<string, number>(BUDGET_BANDS.map((band, index) => [band.id, index]));
  const targetBandIndex = propertyBudgetBandId ? bandIndex.get(propertyBudgetBandId) : undefined;
  let below = 0;
  let aligned = 0;
  let above = 0;
  if (targetBandIndex !== undefined) {
    for (const session of current) {
      const buyerIndex = session.budgetBandId ? bandIndex.get(session.budgetBandId) : undefined;
      if (buyerIndex === undefined) continue;
      if (targetBandIndex < buyerIndex) below += 1;
      else if (targetBandIndex > buyerIndex) above += 1;
      else aligned += 1;
    }
  }
  const knownSessions = below + aligned + above;
  const bandSuppressed = suppressed || knownSessions < INTELLIGENCE_PRIVACY_FLOOR;

  return {
    comparisonVolume: {
      current: suppressed ? 0 : current.length,
      previous: suppressed ? 0 : previous.length,
      trend: suppressed ? null : calculateTrend(current.length, previous.length),
      suppressed,
    },
    competitors,
    chosenReasons: suppressed ? [] : reasonDistribution(feedback, targetSlug, "chosen"),
    rejectedReasons: suppressed ? [] : reasonDistribution(feedback, targetSlug, "rejected"),
    feedbackResponses: suppressed ? 0 : feedbackResponses,
    feedbackResponseRatePercent:
      suppressed || !current.length ? null : Math.round((feedbackResponses / current.length) * 100),
    bandPositioning: {
      below: bandSuppressed ? 0 : below,
      aligned: bandSuppressed ? 0 : aligned,
      above: bandSuppressed ? 0 : above,
      knownSessions: bandSuppressed ? 0 : knownSessions,
      coveragePercent:
        bandSuppressed || !current.length ? 0 : Math.round((knownSessions / current.length) * 100),
      suppressed: bandSuppressed,
    },
  };
}

export function aggregateSentiment(rows: SentimentRow[], now = new Date()): SentimentMetric[] {
  const { previousStart, currentStart, end } = reportingPeriods(now);
  const values = (dimension: ReviewDimension, start: Date, finish: Date) => {
    const matching = rows.filter(
      (row) =>
        row.dimension === dimension &&
        new Date(row.publishedAt) >= start &&
        new Date(row.publishedAt) < finish,
    );
    const unique = new Map(matching.map((row) => [row.reviewId, row.rating]));
    const ratings = [...unique.values()];
    return {
      count: ratings.length,
      average: ratings.length
        ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length
        : 0,
    };
  };
  return REVIEW_DIMENSIONS.map((dimension) => {
    const current = values(dimension, currentStart, end);
    const previous = values(dimension, previousStart, currentStart);
    const suppressed = current.count < INTELLIGENCE_PRIVACY_FLOOR;
    return {
      dimension,
      average: suppressed ? null : Math.round(current.average * 10) / 10,
      reviewCount: suppressed ? 0 : current.count,
      trend: suppressed ? null : calculateTrend(current.average, previous.average),
      suppressed,
    };
  });
}
