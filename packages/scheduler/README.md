# @templar/scheduler

Scheduled and recurring task conventions for the monorepo.

## Scope

- **Cron jobs** — register recurring tasks with cron expressions (Cloudflare Cron
  Triggers as the default provider).
- **One-shot scheduled tasks** — enqueue work at a specific future time (e.g.,
  "send reminder email in 24 hours").
- **Idempotency** — prevent duplicate execution of scheduled work after
  redeploys, retries, or time drift.
- **Observability** — log and track scheduled task execution, failures, and
  latency (will pair with `@templar/observability` once it's wired).

## Design Notes

Cloudflare Workers support Cron Triggers via `ScheduledEvent`, but the
abstraction in `@templar/deploy` does not yet expose them. The `@templar/queue`
package handles async job processing but has no scheduling or delay primitives.

Likely future approach:
- Cron expressions configured in the Alchemy infrastructure layer (extend
  `@templar/deploy` to support `ScheduledEvent` bindings).
- An Effect-friendly `Scheduler` service that registers handlers and provides
  `Layer` composition.
- Scheduled one-shot tasks via the queue with a delay parameter (Cloudflare
  Queues support `sendDelay`).

Until the first project needs cron (e.g., nightly cleanup, digest emails, status
checks), this package stays minimal.