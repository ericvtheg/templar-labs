# ADR 0001: mobile exporter and external destination

Updated 2026-09-20. Supersedes the original bundled Workers/D1 receiver design.

Templar Labs owns the iPhone exporter and its versioned upload contract. The app reads authorized HealthKit data and sends it to the HTTPS destination configured by its user.

The personal receiver, storage, tests, migrations, container deployment, and tunnel configuration belong to the homelab repository. The personal destination is `https://health-export.ericventor.com` through Cloudflare Tunnel to the homelab. Cloudflare Workers and D1 are not required for this flow.

The v1 app exports recent step samples. Version 0.2 uses a general record contract and per-type HealthKit anchors to export full accessible history. Checkpoints advance only after the destination acknowledges every record in the page. No receiver implementation belongs in this repository.
