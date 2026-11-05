# LA Property Watch

Private Los Angeles County foreclosure-research workspace at
`https://la-property-watch.breli.app`. It keeps tax-default auctions and
mortgage trustee-sale notices separate, preserves source provenance, and never
presents a published date as confirmation that a sale is still available.

## Access and privacy

- Central Templar Google SSO creates the session.
- Every page loader, data request, refresh action, and CSV export rechecks a
  literal app-local allowlist: the account must be verified and exactly
  `ericventor97@gmail.com`.
- There is no admin override, public data route, or production test bypass.
- Mutating requests require the application origin. Private responses are
  `no-store` and vary on the session cookie.
- The browser tests use ordinary encrypted development sessions signed with the
  documented local-only secret. Production verification signs five-minute
  ordinary sessions with the CI secret; it does not add a server bypass.

## Data pipeline

### Tax-default sales

The queued worker reads the official LA County Treasurer and Tax Collector
auction schedule, follows its current auction-book PDF, extracts text with
`unpdf`'s Cloudflare Worker build, and parses item number, AIN, minimum bid,
published legal text, and the explicitly published auction start date.

Source: <https://ttc.lacounty.gov/schedule-of-upcoming-auctions/>

### Mortgage trustee sales

The worker makes one bounded request to CNPA's permitted category RSS endpoint:

`https://www.capublicnotice.com/category/legals/notice-of-trustee-sale/rss.xml?county=Los%20Angeles&size=100`

It does not crawl the robots-disallowed `/search/` path and does not fetch
notice details in parallel. A notice is retained only when its text contains LA
County recorder evidence. The parser records published sale date/time, AIN,
address, debt estimate, trustee, and sale-verification phone where present.
That phone is labeled as a sale-status channel, never as a homeowner contact.

### Assessor enrichment and status

AINs are optionally enriched in bounded batches from the official Assessor
ArcGIS layer. Assessor fields and observation timestamps remain separate from
published notice addresses. Enrichment failure does not erase a source record.

Records are idempotently upserted by source and source key. Date status is
recomputed in the Los Angeles timezone on every read and CSV export, so a
record ages to **past  outcome unverified** even if a later source refresh
fails. Invalid calendar days are not accepted.

Manual refresh returns promptly with a D1-backed queue job. A unique active
lease prevents concurrent refresh races, completed jobs impose a 20-second
source cooldown, and stale leases expire after 30 minutes. Sources run
independently and expose success, partial, or failed status with bounded error
text. The daily scheduled trigger enqueues the same pipeline.

## Verified live result

On 2026-11-05 UTC, the full adapters and the exact built Cloudflare Worker were
run against the live sources:

- TTC 2026B auction book: 1,252 tax-default rows persisted; 1,252 AINs and
  published dates; 952 Assessor matches.
- CNPA permitted RSS: 20 items observed, 13 notices with LA County evidence
  persisted, 7 rejected or deduplicated; 10 AINs and published addresses.
- Built Worker queue completed in 138 seconds with 1,252 tax and 13 trustee
  records. The TTC source was successful; CNPA was honestly partial because of
  rejected/missing fields.

The TTC schedule observed in this verification was already historical. The UI
therefore labels those rows as past with outcome unverified; these counts do
not assert current availability or completed-sale outcomes.

## Local development and checks

From the repository root:

```bash
pnpm --filter la-property-watch-web typecheck
pnpm --filter la-property-watch-web test
pnpm --filter la-property-watch-web test:e2e
pnpm --filter la-property-watch-web build
pnpm --filter la-property-watch ingest:live
```

The live-ingestion command reads public sources and prints counts/timestamps;
it does not write D1. Local development applies the local migration before
starting Vite:

```bash
pnpm --filter la-property-watch dev
```

## Deployment and bootstrap

The parent deployment owner should push the reviewed commit, then run the
`Deploy` workflow with `project=la-property-watch`. That path:

1. runs repository checks;
2. scopes the database migration command to this project (the Alchemy D1
   resource also applies `db/migrations` during deployment);
3. deploys only `la-property-watch` and skips unrelated China audio;
4. runs `verify:production` with the CI `TEMPLAR_AUTH_SECRET`.

Required existing GitHub secrets are the Cloudflare/Alchemy credentials and
`TEMPLAR_AUTH_SECRET`. No source API key is required.

For a manual post-deploy verification from a trusted environment:

```bash
TEMPLAR_AUTH_SECRET=... pnpm --filter la-property-watch verify:production
```

The verifier never prints the secret or cookies. It confirms unauthenticated,
forged, wrong-email, and unverified requests are rejected; confirms the sign-in
chain uses central Templar auth and Google; queues a real ingestion; waits for
both persisted source types; reads them back; and verifies the protected CSV.
The refresh is the production bootstrap commandthere are no fictional seed
records.

## Boundaries

- This is research support, not legal advice, title evidence, outreach data, or
  sale confirmation.
- Public notices can be postponed, cancelled, redeemed, or superseded after
  publication. Confirm through the linked source and trustee sale-status
  channel.
- CNPA category filtering can contain out-of-county items; strict textual LA
  evidence is required and rejected-item counts remain visible.
- Scanned future TTC PDFs without a text layer will fail visibly; no OCR or
  access-control bypass is attempted.
- Production deployment and interactive Google login verification remain with
  the parent deployment owner; this worktree intentionally does not push or
  deploy.
