# ADR 0001: minimal personal HealthKit exporter

- Status: Accepted
- Date: 2026-09-19

The first slice exports only HealthKit step-count quantity samples during an explicit foreground
action. A local Expo Swift module owns HealthKit permission and reads; the JavaScript app stores the
personal endpoint, bearer secret, and device UUID in SecureStore and performs HTTPS transport.

TanStack Server Routes expose a versioned POST ingestion API and GET sync status. Both share one
Effect service for digest authentication and storage error mapping. One high-entropy server secret
is appropriate for this personal deployment; there is no device provisioning, account, tenant,
billing, or token-issuing abstraction.

D1 owns durable idempotency. A single atomic D1Database.batch claims (device_id, request_id),
conditionally inserts samples, persists counters, and reads the claimed or replayed run. Reusing a
request ID with different canonical content is a conflict. HealthKit UUID plus device UUID identifies
a sample and duplicate uploads do not overwrite it.

This is not a background or complete HealthKit replication system. The 100-sample recent query can
truncate busy histories, has no deletion feed, and intentionally does not claim to infer read
permission status. Those limits are visible in the UI and README rather than hidden behind
unimplemented abstractions.
