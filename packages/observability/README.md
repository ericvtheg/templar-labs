# @templar/observability

Error monitoring, crash reporting, application metrics, distributed tracing, and
health-check conventions.

## Scope

- **Error monitoring** — capture, group, and alert on runtime errors and unhandled
  rejections in both server and browser environments.
- **Distributed tracing** — trace requests across Cloudflare Workers, database
  queries, AI calls, queue consumers, and payment webhooks.
- **Application metrics** — counters, histograms, and gauges for business KPIs and
  system health (request latency, error rate, queue depth, etc.).
- **Health checks** — standard readiness and liveness endpoints for deployed apps.

## Design Notes

The README explicitly defers observability: "OpenTelemetry later for traces and
metrics once the first real apps need it." This package exists so that when that
need arrives, there is a home for it with the same conventions as the rest of the
monorepo.

Likely future stack:
- **Sentry** for error monitoring (best-in-class for Cloudflare Workers and
  browser, reasonable free tier for a solo dev).
- **OpenTelemetry** for traces and metrics, with a Cloudflare OTLP exporter and
  a self-hosted or managed collector.
- Effect's `Metric` module for application-level metrics, wired through the same
  sink.

Until the first real project needs this, the package stays minimal — just the
shape and a placeholder.