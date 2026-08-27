# PropCompare V2 release checklist

Every item needs an owner, evidence link, and date. A feature flag stays off
until its applicable items are complete.

## Internal acceptance

- [ ] Production self-hosted Postgres is separate from development; a backup
      restore has been evidenced.
- [ ] All V2 flags are off in the public deployment before data approval.
- [ ] Staff MFA, CSP, Upstash fail-closed behavior, and log/Sentry redaction
      are verified.
- [ ] A reviewer deliberately approves each production publication; no test or
      fake review is copied automatically.
- [ ] Developer isolation, reviewer correction, transaction rollback, OCR
      restart/retry, and asset-promotion evidence is attached.
- [ ] Sentinel leakage tests cover SSR, hydration, public details,
      recommendations, authenticated/shared comparisons, logs, errors, and
      analytics with zero occurrences.
- [ ] Legal approval covers DPDP, reviews, enquiries, verification language,
      and evidence retention.

## Closed beta

- [ ] Enable only reviewed flags for an explicitly controlled audience.
- [ ] Dashboard tracks OTP success, review activity, OCR failures, enquiry
      delivery, cache failures, and commercial-data leakage alerts.
- [ ] Support and moderation workload has named coverage and escalation times.
- [ ] No critical trust, authentication, privacy, or moderation defect remains.

## Public release

- [ ] GCP/VM, self-hosted Postgres, GCS, Artifact Registry, Upstash, Maps,
      SMS, Sentry, Pub/Sub, and BigQuery are configured and monitored in
      suitable regions.
- [ ] DNS/TLS, health/readiness, cost/quota alerts, VM patching, and secret
      rotation are evidenced.
- [ ] WCAG 2.2 AA automation plus keyboard and screen-reader checks are signed
      off.
- [ ] Database migration, backup restore, application rollback, and
      account-deletion propagation have been rehearsed.
- [ ] All enabled flags have passed their individual phase gates.

## Explicitly deferred

SEO comparison previews, developer organizations, enquiry notifications, Cloud
SQL, additional cities, and Pub/Sub OCR queue migration remain outside the
core release. Fair value, an AI advisor, gamification, monetized ranking,
fabricated verdicts, automatic RERA scraping, and direct OCR publication remain
prohibited.
