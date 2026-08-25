import type { BehaviourMetrics, RawIntelligenceEvent } from "@/domain/developer-intelligence";
import {
  aggregateBehaviour,
  calculateTrend,
  INTELLIGENCE_PRIVACY_FLOOR,
  reportingPeriods,
} from "@/domain/developer-intelligence";
import { BUDGET_BANDS } from "@/domain/budget";

type AggregateRow = {
  kind: string;
  key: string | null;
  value: number | string | null;
  total: number | string | null;
};

const BIGQUERY_SQL = `
WITH approved AS (
  SELECT
    eventName,
    occurredAt,
    COALESCE(profileId, anonymousSessionId) AS actor_key,
    metadata
  FROM \`\${projectId}.\${dataset}.raw_product_events\`
  WHERE occurredAt >= @previousStart
    AND occurredAt < @end
    AND eventName IN ('compare_open', 'comparison_feedback')
    AND COALESCE(profileId, anonymousSessionId) IS NOT NULL
), compare_rows AS (
  SELECT
    IF(occurredAt >= @currentStart, 'current', 'previous') AS period,
    CONCAT(actor_key, '|', CAST(DATE(occurredAt) AS STRING)) AS actor_day,
    TO_JSON_STRING(JSON_VALUE_ARRAY(metadata, '$.propertySlugs')) AS comparison_key,
    JSON_VALUE(metadata, '$.budgetBandId') AS budget_band_id
  FROM approved
  WHERE eventName = 'compare_open'
    AND @targetSlug IN UNNEST(JSON_VALUE_ARRAY(metadata, '$.propertySlugs'))
), sessions AS (
  SELECT period, actor_day, comparison_key, ANY_VALUE(budget_band_id) AS budget_band_id
  FROM compare_rows
  GROUP BY period, actor_day, comparison_key
), counts AS (
  SELECT
    COUNTIF(period = 'current') AS current_count,
    COUNTIF(period = 'previous') AS previous_count
  FROM sessions
), competitors AS (
  SELECT slug, COUNT(*) AS session_count
  FROM sessions, UNNEST(JSON_VALUE_ARRAY(comparison_key)) slug
  WHERE period = 'current' AND slug != @targetSlug
  GROUP BY slug
  HAVING session_count >= @privacyFloor
), band_counts AS (
  SELECT budget_band_id, COUNT(*) AS session_count
  FROM sessions
  WHERE period = 'current' AND budget_band_id IS NOT NULL
  GROUP BY budget_band_id
), feedback_ranked AS (
  SELECT *, ROW_NUMBER() OVER (
    PARTITION BY JSON_VALUE(metadata, '$.feedbackId')
    ORDER BY occurredAt DESC
  ) AS revision_rank
  FROM approved
  WHERE eventName = 'comparison_feedback'
    AND occurredAt >= @currentStart
    AND @targetSlug IN UNNEST(JSON_VALUE_ARRAY(metadata, '$.propertySlugs'))
    AND JSON_VALUE(metadata, '$.feedbackId') IS NOT NULL
), feedback AS (
  SELECT * FROM feedback_ranked WHERE revision_rank = 1
), feedback_count AS (
  SELECT COUNT(*) AS response_count FROM feedback
), outcome_counts AS (
  SELECT
    IF(JSON_VALUE(metadata, '$.selectedPropertySlug') = @targetSlug, 'chosen', 'rejected') AS outcome,
    COUNT(*) AS response_count
  FROM feedback
  WHERE JSON_VALUE(metadata, '$.selectedPropertySlug') IS NOT NULL
  GROUP BY outcome
), reason_counts AS (
  SELECT
    IF(JSON_VALUE(metadata, '$.selectedPropertySlug') = @targetSlug, 'chosen', 'rejected') AS outcome,
    reason,
    COUNT(*) AS response_count
  FROM feedback, UNNEST(JSON_VALUE_ARRAY(metadata, '$.reasonCodes')) reason
  WHERE JSON_VALUE(metadata, '$.selectedPropertySlug') IS NOT NULL
  GROUP BY outcome, reason
  HAVING response_count >= @privacyFloor
)
SELECT 'volume_current' kind, NULL key,
  IF(current_count >= @privacyFloor, current_count, NULL) value,
  IF(current_count >= @privacyFloor, current_count, NULL) total FROM counts
UNION ALL
SELECT 'volume_previous', NULL,
  IF(current_count >= @privacyFloor AND previous_count >= @privacyFloor, previous_count, NULL),
  IF(current_count >= @privacyFloor, current_count, NULL) FROM counts
UNION ALL
SELECT 'competitor', slug, session_count, (SELECT current_count FROM counts)
  FROM competitors WHERE (SELECT current_count FROM counts) >= @privacyFloor
UNION ALL
SELECT 'band', budget_band_id, session_count, (SELECT current_count FROM counts)
  FROM band_counts
  WHERE (SELECT current_count FROM counts) >= @privacyFloor
    AND (SELECT SUM(session_count) FROM band_counts) >= @privacyFloor
UNION ALL
SELECT 'feedback', NULL,
  IF((SELECT current_count FROM counts) >= @privacyFloor AND response_count >= @privacyFloor,
    response_count, NULL),
  (SELECT current_count FROM counts) FROM feedback_count
UNION ALL
SELECT CONCAT('reason_', outcome), reason, response_count,
  (SELECT response_count FROM outcome_counts WHERE outcome = reason_counts.outcome)
  FROM reason_counts
  WHERE (SELECT current_count FROM counts) >= @privacyFloor
`;

export async function getProductionBehaviour(
  targetSlug: string,
  propertyBudgetBandId: string | null,
  now = new Date(),
): Promise<BehaviourMetrics> {
  const projectId = process.env.GCP_PROJECT_ID;
  const dataset = process.env.ANALYTICS_BIGQUERY_DATASET ?? "propcompare_analytics";
  if (!projectId) throw new Error("Product analytics is not configured");
  if (
    !/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(projectId) ||
    !/^[A-Za-z_][A-Za-z0-9_]*$/.test(dataset)
  ) {
    throw new Error("Product analytics configuration is invalid");
  }
  const { previousStart, currentStart, end } = reportingPeriods(now);
  const { BigQuery } = await import("@google-cloud/bigquery");
  const client = new BigQuery({ projectId });
  const [rows] = await client.query({
    query: BIGQUERY_SQL.replace("${projectId}", projectId).replace("${dataset}", dataset),
    location: process.env.GCP_REGION ?? "asia-south1",
    params: {
      previousStart,
      currentStart,
      end,
      targetSlug,
      privacyFloor: INTELLIGENCE_PRIVACY_FLOOR,
    },
  });
  return behaviourFromAggregateRows(rows as AggregateRow[], propertyBudgetBandId);
}

export async function getLocalBehaviour(
  targetSlug: string,
  propertyBudgetBandId: string | null,
  now = new Date(),
) {
  const { previousStart } = reportingPeriods(now);
  const { getBehaviourEvents } = await import("@/repositories/customer-activity.repository.server");
  const rows = await getBehaviourEvents(
    ["compare_open", "comparison_feedback"],
    previousStart,
    now,
  );
  const events: RawIntelligenceEvent[] = rows.map((row) => ({
    eventName: row.eventType as RawIntelligenceEvent["eventName"],
    actorKey: row.profileId ?? row.sessionKey,
    occurredAt: row.createdAt.toISOString(),
    metadata: row.metadata,
  }));
  return aggregateBehaviour(events, targetSlug, propertyBudgetBandId, now);
}

export async function getBehaviour(
  targetSlug: string,
  propertyBudgetBandId: string | null,
  now = new Date(),
) {
  return process.env.APP_ENV === "production"
    ? getProductionBehaviour(targetSlug, propertyBudgetBandId, now)
    : getLocalBehaviour(targetSlug, propertyBudgetBandId, now);
}

export function behaviourFromAggregateRows(
  rows: AggregateRow[],
  propertyBudgetBandId: string | null,
): BehaviourMetrics {
  const number = (kind: string) => {
    const value = rows.find((row) => row.kind === kind)?.value;
    return value === null || value === undefined ? null : Number(value);
  };
  const current = number("volume_current");
  const previous = number("volume_previous");
  const suppressed = current === null;
  const total = current ?? 0;
  const feedbackResponses = number("feedback") ?? 0;
  const reasonRows = (kind: string) =>
    rows
      .filter((row) => row.kind === kind && row.key)
      .map((row) => ({
        code: row.key as BehaviourMetrics["chosenReasons"][number]["code"],
        responses: Number(row.value),
        sharePercent: Number(row.total)
          ? Math.round((Number(row.value) / Number(row.total)) * 100)
          : 0,
      }));
  const bandIndex = new Map<string, number>(BUDGET_BANDS.map((band, index) => [band.id, index]));
  const targetIndex = propertyBudgetBandId ? bandIndex.get(propertyBudgetBandId) : undefined;
  let below = 0;
  let aligned = 0;
  let above = 0;
  if (targetIndex !== undefined) {
    for (const row of rows.filter((candidate) => candidate.kind === "band" && candidate.key)) {
      const buyerIndex = bandIndex.get(row.key!);
      if (buyerIndex === undefined) continue;
      if (targetIndex < buyerIndex) below += Number(row.value);
      else if (targetIndex > buyerIndex) above += Number(row.value);
      else aligned += Number(row.value);
    }
  }
  const knownSessions = below + aligned + above;
  return {
    comparisonVolume: {
      current: total,
      previous: previous ?? 0,
      trend: suppressed || previous === null ? null : calculateTrend(total, previous),
      suppressed,
    },
    competitors: rows
      .filter((row) => row.kind === "competitor" && row.key)
      .map((row) => ({
        slug: row.key!,
        sessions: Number(row.value),
        sharePercent: total ? Math.round((Number(row.value) / total) * 100) : 0,
      }))
      .sort((a, b) => b.sessions - a.sessions),
    chosenReasons: reasonRows("reason_chosen"),
    rejectedReasons: reasonRows("reason_rejected"),
    feedbackResponses,
    feedbackResponseRatePercent: total ? Math.round((feedbackResponses / total) * 100) : null,
    bandPositioning: {
      below,
      aligned,
      above,
      knownSessions,
      coveragePercent: total ? Math.round((knownSessions / total) * 100) : 0,
      suppressed: knownSessions < INTELLIGENCE_PRIVACY_FLOOR,
    },
  };
}
