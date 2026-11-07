# Property Watch

Private, property-first distress research at `https://la-property-watch.breli.app`. The default workflow ranks current official signals by jurisdiction-scoped property identity, explains every score contribution, and opens the exact evidence rows behind a property. It does not estimate foreclosure probability, find contacts, or automate outreach.

## Core researcher workflow

1. A protected refresh reads each official source independently.
2. A source is staged and validated in bounded batches. Live evidence, snapshot reconciliation, watchlist replacement, and run success publish in one D1 batch; a failed batch leaves the previous published source and rankings unchanged.
3. The dashboard pages and filters ranked properties on the server by market, signal, address, or literal parcel ID.
4. Property details show present evidence first and retain deterministic pagination into no-longer-present history. Disappearance from a complete source snapshot is never labeled paid, cured, or resolved.
5. The all-watchlist evidence export uses keyset pagination with a ranking-generation boundary. It either returns every evidence identity from one coherent publication or fails for retry if a refresh changes the generation. Spreadsheet formula prefixes are neutralized while numeric cells remain numeric.

Production starts empty. Real-derived fixtures are used only by tests and local browser verification.

## Current ranked sources

- Travis County Tax Office delinquent tax roll: literal 14-digit accounts; complete publisher snapshot.
- City of Norfolk delinquent property taxes: literal 8-digit PINs and exact year/quarter components; complete publisher snapshot.
- City of Norfolk neighborhood quality violations: only non-closed workflow rows; exact 8-digit `tax_account` joins. Missing or malformed identifiers remain unmatched evidence.
- NYC ACRIS common-charge liens and terminations: rolling two-year recording-event window. Every master row must provide a valid document ID, event date, and row-level `good_through_date`. This is append/update event evidence, never a complete outstanding-lien snapshot. A termination on a BBL does not release every lien on that BBL.
- Denver Public Trustee foreclosure search: explicit rolling 90-day NED window across all source statuses. Withdrawn, cured, and “to be withdrawn” cases remain evidence but receive zero active priority. Published principal is separate from arrears and tax delinquency. Search rows do not publish a parcel ID or publisher-update timestamp, so neither is invented.

Denver Terms of Use state that commercial use of site materials requires written permission. Authorization must be confirmed before commercialization or sustained production operation; the application and persisted source warning keep that blocker visible.

Orange County published delinquency/power-to-sell records and Los Angeles tax/trustee sale publications remain a secondary historical archive. They do not drive the default current watchlist.

## Ranking and freshness

The score is deterministic triage, capped at 100. Current present evidence can contribute: tax delinquency 25, open code workflow 20, recorded lien event 20, mortgage foreclosure initiation 35, independent-signal bonuses, published tax-total bands, multiple-code-record bonuses, tax-age bands, and source freshness.

Freshness uses the single persisted `ranked_at` clock for both score and displayed reasons: source update within 2 days adds 10, within 7 adds 6, within 30 adds 2, and older or unpublished timestamps add 0. A failed source run preserves the last successfully published evidence and visibly reports the failure; it never refreshes the scoring clock. A complete successful snapshot may mark absent rows no longer present. Event-window sources such as ACRIS do not reconcile absence.

## Access and privacy

- Central Templar Google SSO creates the session.
- Every page loader, JSON request, property detail, refresh action, and CSV export rechecks the literal allowlist: verified `ericventor97@gmail.com` or `Rhwcreative@gmail.com` only.
- There is no admin override or public records route.
- Mutations require exact same origin. Private responses, including validation failures, are `private, no-store` and vary on the session cookie.
- Search, pagination, signal, and jurisdiction parameters are bounded before D1. LIKE patterns are escaped literally and limited to D1’s 50-byte pattern ceiling.

## Verified live-source observations

Read-only checks on 2026-11-07 UTC, with no D1 writes, returned:

- Travis tax: 7,249 records; publisher update `2026-11-05T19:18:26Z`; complete snapshot.
- Norfolk tax: 29,104 installments; publisher update `2026-11-06T12:27:31Z`; complete snapshot.
- Norfolk violations: 6,532 open workflow rows; publisher update `2026-11-06T12:16:24Z`; complete snapshot, with unmatched identifiers retained separately.
- NYC ACRIS: 5,083 validated legal-property evidence rows; publisher update `2026-10-08T20:09:15Z`; row-level declared coverage from `2024-11-30` through `2026-09-30`; non-complete event window.
- Denver: 192 records over all eight result pages. Observed statuses were 153 NED Recorded, 15 Intent to Cure Filed, 3 Bankruptcy Sale Stayed (Restart Needed), 1 To be Withdrawn, 16 Withdrawn, and 4 Withdrawn (Cured).

Counts are observations, not nationwide coverage or proof that a debt, lien, violation, or foreclosure remains active.

## Operations

Manual refresh queues durable D1 work. A unique lease prevents concurrent refreshes, completed jobs impose a short cooldown, and stale leases expire after 60 minutes. The external Node runner performs the bounded source work; the Worker handles authenticated reads and queueing. Scheduled queue processing runs every 15 minutes, and a full refresh runs daily at 10:17 UTC. Workflow and bootstrap timeouts are 45 minutes because the full ACRIS legal join is intentionally sequential and source-bound.

From the repository root:

```bash
pnpm --dir projects/la-property-watch/apps/web typecheck
pnpm --dir projects/la-property-watch/apps/web test
pnpm --dir projects/la-property-watch/apps/web test:e2e
pnpm --dir projects/la-property-watch/apps/web build
pnpm --dir projects/la-property-watch typecheck
pnpm --dir projects/la-property-watch/apps/web ingest:live -- --current-only
```

`ingest:live` is read-only and prints source counts, coverage, warnings, and timing. Production verification requires `TEMPLAR_AUTH_SECRET` and checks access control, all current source runs, jurisdiction filters, ranked property detail, current-first evidence, validation errors, and the protected full export:

```bash
TEMPLAR_AUTH_SECRET=... pnpm --dir projects/la-property-watch verify:production
```

See [`docs/source-research.md`](docs/source-research.md) for field contracts and limitations.

## Boundaries

This is research support, not legal advice, title evidence, debt verification, or foreclosure prediction. Public records can be paid, redeemed, released, cured, stayed, withdrawn, postponed, cancelled, superseded, or completed after publication. Exact linked official evidence and current legal meaning must be checked before reliance. No paid source, CAPTCHA bypass, contact enrichment, homeowner lookup, or outreach capability is used.
