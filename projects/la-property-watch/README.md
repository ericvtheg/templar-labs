# Property Watch

Private, multi-market property-distress research workspace at the existing deployment URL `https://la-property-watch.breli.app`.

The primary workflow starts with earlier public signals, currently Orange County three-year tax delinquency and impending power to sell, then keeps later LA County trustee/tax-sale publications in their correct stages. A delinquency, lien, default, or power-to-sell record is never presented as proof that foreclosure is imminent.

## Access and privacy

- Central Templar Google SSO creates the session.
- Every page loader, data request, refresh action, and CSV export rechecks the unchanged literal app allowlist: the account must be verified and exactly `ericventor97@gmail.com` or `Rhwcreative@gmail.com`.
- There is no admin override, public data route, production test bypass, contact lookup, or outreach feature.
- Mutating requests require the application origin. Private responses are `no-store` and vary on the session cookie.

## Signal stages and markets

Records have a first-class signal stage and jurisdiction. Source parcel identifiers remain literal, while normalized parcel IDs are jurisdiction-scoped so the same digits in different counties cannot collide.

- `tax_delinquency`: Orange County three-year delinquency snapshot.
- `power_to_sell`: Orange County impending statutory power to sell. This is not an auction date.
- `notice_of_default` and `recorded_lien`: modeled and filterable, but no verified ingestible source is currently available.
- `scheduled_trustee_sale`: LA County CNPA trustee-sale publication.
- `scheduled_tax_sale`: LA County Treasurer and Tax Collector auction publication.

Published event dates, scheduled sale dates, source publication dates, source as-of dates, and ingestion observation timestamps are stored separately. Historical balances are labeled with their source as-of date.

Detailed URLs, observed counts, dates, parser constraints, and coverage limitations are in [`docs/source-research.md`](docs/source-research.md).

## Data pipeline

Each source is fetched independently with a 30-second request timeout and bounded response size. One blocked publisher does not hide healthy source results.

1. The Orange County adapters fetch the official Published Notices page, discover the newest PDF inside the correct table row, extract text with `unpdf`, and parse strict literal source IDs.
2. The LA tax adapter follows the official current auction-book link and optionally enriches LA AINs from the official Assessor ArcGIS layer in bounded batches.
3. The CNPA adapter makes one bounded request to the permitted LA trustee-sale RSS endpoint. It does not crawl the robots-disallowed search path or fetch notice detail pages in parallel.
4. Records are idempotently upserted by source record identity. Existing LA records are migrated in place.

Manual refresh returns promptly with a D1-backed job. A unique lease prevents concurrent refresh races, completed jobs impose a 20-second cooldown, and stale leases expire after 30 minutes. Production uses the external Node ingestion runner because PDF extraction exceeded Worker resource limits; the Worker only queues jobs.

## Verified live-source result

A read-only live run on 2026-11-06 UTC reported:

- Orange County three-year delinquency: 4 records, 0 addresses, 3 normalized parcel IDs, 1 malformed literal ID preserved without repair.
- Orange County impending power to sell: 184 unique records, 120 conservatively parsed published addresses, no auction dates invented.
- LA County tax auction book: 1,252 records.
- CNPA LA trustee-sale RSS: 15 retained notices and 7 rejected/deduplicated items.

These counts are observations of historical publications, not complete-market or current-status claims.

## Local development and checks

From the repository root:

```bash
pnpm --filter la-property-watch-web typecheck
pnpm --filter la-property-watch-web test
pnpm --filter la-property-watch-web test:e2e
pnpm --filter la-property-watch-web build
pnpm --filter la-property-watch ingest:live
```

The live-ingestion command reads public sources and prints source-by-source counts; it does not write D1. Local development applies the project migrations before starting Vite:

```bash
pnpm --filter la-property-watch dev
```

## Deployment and production verification

The existing `la-property-watch` deployment resource and URL are unchanged. After review, push and run the existing Deploy workflow with `project=la-property-watch`; it applies `db/migrations`, deploys the same resource, runs the external production ingestion runner, and verifies protected data/CSV plus desktop/mobile browser workflows.

For manual post-deploy verification from a trusted environment:

```bash
TEMPLAR_AUTH_SECRET=... pnpm --filter la-property-watch verify:production
```

The verifier checks anonymous, forged, wrong-email, and unverified access; central Google sign-in routing; all four persisted source types; protected CSV; and the early-signal browser workflow. It never prints the secret or session cookies.

## Boundaries

- This is research support, not legal advice, title evidence, contact data, outreach, or foreclosure prediction.
- Public records can be paid, redeemed, released, postponed, cancelled, superseded, or completed after publication. Current outcome remains unverified unless a later official source explicitly establishes it.
- The current OC three-year list covers only returned-undeliverable reminders, not the full county delinquency roll.
- Mechanic, HOA, and utility liens remain explicit coverage gaps; absence from this workspace does not mean no lien exists.
- Scanned future PDFs without a text layer fail visibly. No OCR service, paid source, CAPTCHA, or access-control bypass is used.
