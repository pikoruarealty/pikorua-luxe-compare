# PropCompare v2 release checklist

Every item needs an owner, evidence link and date. A feature flag stays off if any applicable item
is incomplete. Never use this checklist to infer that an external service has been configured.

## Internal acceptance

- [ ] Production Supabase is separate from development; backup restore is evidenced.
- [ ] All v2 flags are off in the public deployment before data approval.
- [ ] Staff MFA, CSP, Upstash fail-closed behavior and log/Sentry redaction are verified.
- [ ] Reviewer deliberately approves each production publication; no development record or fake
      review is copied automatically.
- [ ] Developer isolation, reviewer correction, transaction rollback, OCR restart/retry and asset
      promotion evidence is attached.
- [ ] Sentinel leakage suite covers SSR HTML, hydration, public details, recommendations,
      authenticated/shared comparison, logs/errors and analytics with zero occurrences.
- [ ] Legal approval covers DPDP, reviews, enquiries, verification language and indefinite evidence
      retention.

## Closed beta

- [ ] Enable only reviewed flags for an explicitly controlled audience.
- [ ] Dashboard tracks preference completion, OTP send/verify success, comparison opening, review
      holds/reports, enquiries, OCR failures, cache/Redis failures and commercial leakage alerts.
- [ ] Support and moderation workload has named coverage and escalation times.
- [ ] Users understand stale pricing notices and “Verified by PropCompare” in moderated research.
- [ ] No critical trust, authentication, privacy or moderation defect remains open.

## Public release

- [ ] GCP/VM, GCS, Artifact Registry, production Supabase, Upstash, Maps, SMS, Sentry, Pub/Sub and
      BigQuery are configured and monitored in India/Mumbai-compatible regions where applicable.
- [ ] DNS/TLS, health/readiness, cost/quota alerts, VM patching and secret rotation are evidenced.
- [ ] WCAG 2.2 AA automation plus keyboard and screen-reader checks are signed off.
- [ ] Mobile/tablet/desktop/wide visual QA and p75 performance targets pass on production-like load.
- [ ] Database migration, backup restore, application rollback and account-deletion propagation are
      rehearsed.
- [ ] All enabled flags have passed their individual phase gates.

## Flag order and rollback

Enable in dependency order: `V2_CATALOGUE`, `V2_COMPARISON`, `V2_OCR`, `V2_REVIEWS`, then
`V2_ENQUIRIES`. Disable the affected server flag first on a serious defect; this blocks server data
access, not only UI. For an application regression, switch Nginx to the retained healthy slot. Do
not roll back a database migration unless a reviewed reverse migration is known safe; use
expand/migrate/contract compatibility instead.

## Explicitly still deferred

SEO comparison previews, developer organizations, enquiry notifications, Cloud SQL, additional
cities and Pub/Sub OCR queue migration stay outside the core release. PropScore, fair value, an AI
advisor, gamification, monetized ranking, fabricated verdicts, automatic RERA scraping and direct
OCR publication remain prohibited.
