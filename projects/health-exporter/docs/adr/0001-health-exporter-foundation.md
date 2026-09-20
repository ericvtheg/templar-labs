# ADR 0001: mobile exporter and external destination

Updated 2026-09-20. Supersedes the original bundled Workers/D1 receiver design.

Templar Labs owns the iPhone exporter and its versioned upload contract. The app reads authorized HealthKit data and sends it to the HTTPS destination configured by its user.

The personal receiver, storage, tests, migrations, container deployment, and tunnel configuration belong to the homelab repository. The personal destination is `https://health-export.ericventor.com` through Cloudflare Tunnel to the homelab. Cloudflare Workers and D1 are not required for this flow.

The installed v1 app exports recent step samples. Full-history export across accessible HealthKit types is the next mobile capability; no receiver implementation belongs in this repository.
