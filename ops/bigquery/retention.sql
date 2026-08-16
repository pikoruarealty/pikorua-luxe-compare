-- Apply after creating the partitioned raw_product_events table through IaC.
ALTER TABLE `PROJECT_ID.propcompare_analytics.raw_product_events`
SET OPTIONS (partition_expiration_days = 90);

-- Daily aggregates intentionally contain no profile or anonymous session IDs.
CREATE OR REPLACE TABLE `PROJECT_ID.propcompare_analytics.product_event_daily`
PARTITION BY event_date
OPTIONS (partition_expiration_days = 730)
AS
SELECT
  DATE(occurredAt) AS event_date,
  eventName,
  propertySlug,
  JSON_VALUE(metadata, '$.marketId') AS market_id,
  JSON_VALUE(metadata, '$.budgetBandId') AS budget_band_id,
  COUNT(*) AS event_count
FROM `PROJECT_ID.propcompare_analytics.raw_product_events`
GROUP BY 1, 2, 3, 4, 5;
