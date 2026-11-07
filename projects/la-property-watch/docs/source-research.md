# Property Watch source research

Read-only live checks were run on 2026-11-07 UTC. Counts below are parser observations, not claims of complete market coverage or present legal status.

## Travis County delinquent tax roll

- Data: <https://tax-office.traviscountytx.gov/voterdata/TaxDelqOpenData.csv>
- Layout: <https://tax-office.traviscountytx.gov/pages/DelinquentFileLayout.php>
- Observed: 7,249 validated real-property records.
- Publisher update: `2026-11-05T19:18:26Z` from the HTTP `Last-Modified` header.
- Identity: exact 14-digit account number, jurisdiction-scoped as `travis-county-tx:<account>`.
- Amount: source delinquent total in exact integer cents. Real-property type categories are retained; personal, utility, and mineral categories are excluded visibly.
- Snapshot contract: complete. Absence after a later complete successful import becomes `no_longer_present`, not “paid.”

## Norfolk delinquent property taxes

- Data: <https://data.norfolk.gov/api/views/7qie-z5gv/rows.csv?accessType=DOWNLOAD>
- Metadata: <https://data.norfolk.gov/api/views/7qie-z5gv>
- Observed: 29,104 installment rows across 5,044 literal PINs.
- Publisher update: `2026-11-06T12:27:31Z`.
- Identity: the source PIN must be exactly eight digits. Short, empty, or otherwise malformed values fail ingestion; they are never zero-padded or repaired. Installment identity also includes billing account, tax year, and quarter.
- Amount: tax, penalty, and interest parse independently to safe integer cents and must equal the published total exactly. CSV quote transitions and comma grouping are strict.
- Ranking: installment evidence rolls up once by PIN. Property totals sum only tax-delinquency evidence, so joining a code record cannot multiply debt.
- Snapshot contract: complete; absence is not proof of resolution.

## Norfolk neighborhood quality violations

- Data: <https://data.norfolk.gov/resource/agip-sqwc.json>
- Metadata: <https://data.norfolk.gov/api/views/agip-sqwc.json>
- Observed: 6,532 non-closed workflow rows.
- Publisher update: `2026-11-06T12:16:24Z`.
- Identity and join: violation ID is the evidence identity. Only an exact eight-digit `tax_account` joins the tax property. Missing or malformed accounts remain under an explicit unmatched property key with the literal source value in evidence detail.
- Status: publisher workflow text is preserved. Unknown non-closed statuses are labeled for review rather than silently discarded.
- Snapshot contract: complete; absent rows become no longer present without a resolution claim.

## Norfolk official parcel, assessment, and transfer enrichment

- Data: <https://data.norfolk.gov/resource/qva7-tzrf.json>; metadata: <https://data.norfolk.gov/api/views/qva7-tzrf.json>.
- Identity: the targeted runner accepts one exact eight-digit retained Norfolk PIN and requires every returned target row to preserve that literal PIN. It never zero-pads or invents a crosswalk.
- Publication integrity: required metadata clocks are read before and after all target, candidate, extension, and document requests. A clock change aborts the enrichment, and every response is explicitly paginated or deliberately bounded so a Socrata default limit cannot silently truncate it.
- Property type: normalization is based on the complete published `property_use` and `property_class_description` vocabulary. Published single-family attached/detached values map to single family; published duplex, triplex, and fourplex parcel classes map to small multifamily; published vacant-land categories map to land. Condo buildings with two to four units remain unknown rather than being mislabeled as a whole multifamily parcel, and apartment/commercial classes including 49+ units remain commercial. The grouped official vocabulary query is retained as mapping provenance.
- Characteristics and assessment: source extension rows remain separate. Parcel-level living area and year built are populated only for a single extension, square-foot units remain explicitly unverified, and assessment/sale values are never summed repeatedly across extensions.
- Transfer candidates: selection is deliberately bounded to the 25 most recent distinct same-class parcel/document/date candidates within the stated two-year window. After selection, all extension rows for selected parcels and all companion rows for selected documents are paginated to completion. Each result and the deal brief state the bound, selection criteria, package-sale review requirement, and that candidates are neither comparable-sales conclusions nor an appraisal.
- Runner: `node --experimental-strip-types projects/la-property-watch/scripts/ingest-production.ts --enrich-norfolk=EXACT_8_DIGIT_PIN`. This writes only the named retained property enrichment and records a source-specific run; supervisor production execution remains a separate gate.

## NYC ACRIS common-charge lien events

- Master data: <https://data.cityofnewyork.us/resource/bnx9-e6tj.json>
- Legal/property data: <https://data.cityofnewyork.us/resource/8h5j-fqxa.json>
- Metadata: <https://data.cityofnewyork.us/api/views/bnx9-e6tj>
- Scope: LOCC and TOLCC recording events in a rolling two-year window starting on the first day of the month two years before the run.
- Observed: 5,083 validated document/property evidence records.
- Dataset update: `2026-10-08T20:09:15Z`.
- Declared coverage: live rows carry monthly `good_through_date` values. The observed event window ranged from `2024-11-30` through `2026-09-30`. Each evidence row stores and displays its own validated literal date; the loader does not infer coverage from the latest event date or assign the newest watermark to older rows.
- Validation: document IDs are exactly 16 digits; LOCC/TOLCC types are enforced; calendar dates and local timestamps are validated; borough must be 1–5 and block/lot must be positive literal numeric components before a BBL is formed. Invalid BBL components remain unmatched and are not padded into a valid-looking parcel.
- Relationship limitation: TOLCC is a termination recording event. The public rows do not provide a safe universal mapping that proves every LOCC on the same BBL was released, so one termination never suppresses every lien at a property.
- Snapshot contract: `false`. The rolling window is append/update event evidence, not an outstanding-lien roll; window exclusion never reconciles older evidence away.
- Operational observation: the complete master plus legal-property join took about 330 seconds through bounded groups of 50 document IDs. Requests are sequential to reduce publisher load and retry only transient status codes.

## Denver Public Trustee foreclosure search

- Search: <https://denvergov.org/foreclosuresearch/>
- Scope: explicit rolling 90 Denver-calendar-day NED window, inclusive, all source statuses, with complete postback pagination.
- Observed: 192 records across eight pages: 153 NED Recorded, 15 Intent to Cure Filed, 3 Bankruptcy Sale Stayed (Restart Needed), 1 To be Withdrawn, 16 Withdrawn, and 4 Withdrawn (Cured).
- Signal: a Notice of Election and Demand is modeled as `mortgage_foreclosure_initiated`, not a scheduled sale prediction. Bankruptcy-stayed cases retain that label and are not called imminent sales.
- Priority: Withdrawn, cured, rescinded, deeded, sold, and to-be-withdrawn statuses remain evidence but receive zero active ranking priority.
- Identity: search rows do not publish an authoritative parcel number. The case ID remains an explicit unmatched property identity; no APN is fabricated or address-fuzzy-joined.
- Money: published principal is stored separately from tax delinquency, arrears, cure, reinstatement, and payoff. It never enters reported delinquent-tax totals.
- Freshness: the registry does not publish a dataset update timestamp, so `sourceUpdatedAt` remains null. Fetch observation time is not relabeled as publisher freshness.
- Access constraint: Denver Terms of Use state that commercial use requires written permission. Written permission for commercial reuse has not been obtained and is visible in source warnings and the UI. Private research deployment does not establish commercial-use authorization.
- Adapter safety: verification challenges stop the run. The adapter does not populate, solve, or bypass a challenge.

## Secondary historical archive

Orange County three-year delinquency and impending-power-to-sell publications, the Los Angeles County tax auction book, and bounded CNPA trustee-sale RSS remain supported as secondary historical evidence. They preserve literal source identifiers, dates, amounts, and provenance but do not rank in the default current watchlist. Power to sell is not an auction date, and published sale notices can later be redeemed, postponed, cancelled, or completed.

## Publication, ranking, and retention invariants

- Source records stage under an ingestion-run ID. A successful D1 batch publishes staged evidence, complete-snapshot reconciliation, the entire watchlist generation, ingestion success, and staging cleanup atomically.
- A failed load or persistence batch deletes staging rows and leaves live evidence, membership, amounts, and rankings unchanged.
- Ranking uses only current, present, positive-priority evidence. Removed and zero-priority evidence remains accessible in property history and in the all-watchlist evidence export.
- Property detail is current-first and deterministically paginated. A property that loses its final current signal remains accessible by its retained evidence key with score zero.
- Freshness score and explanation use the same persisted ranking clock and exact timestamp arithmetic: 2-day, 7-day, and 30-day buckets.
- The CSV export keyset-pages evidence IDs for one ranking generation, has no 100,000-row cutoff, neutralizes spreadsheet formulas, and aborts if publication changes during export.

## Known coverage gaps

No verified accessible source is integrated for nationwide mechanic liens, utility liens, or comprehensive HOA outstanding balances. ACRIS covers NYC common-charge recording events only. Absence from Property Watch never means no lien, debt, violation, default, or foreclosure exists. No paid service, CAPTCHA bypass, contact lookup, or outreach system is included.
