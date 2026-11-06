# Property Watch live-source research

Evidence below was verified with actual public-source fetches on 2026-11-06 UTC. Counts describe what the parsers observed on that date; they are not claims of complete county coverage or current delinquency/foreclosure status.

## Orange County Treasurer-Tax Collector published notices

Landing page: <https://www.octreasurer.gov/PublishedNotices>

The ingestion adapters discover the newest PDF inside the applicable official table row on this page. They do not pin the current document forever.

### Three-Year Delinquency (R&T Code 3371)

- Current PDF observed: <https://www.octreasurer.gov/sites/ttc/files/2026-09/Property%20TaxDefault%20List%202026.pdf>
- Observed records: 4.
- Tax-default event published by the county: 2023-07-01, covering fiscal year 2022-2023 delinquency.
- First publication date: 2026-09-07; the notice also states September 14 and 21.
- Amount as-of date: 2026-09-30.
- Addresses: all four say “Address Not Available.”
- Scope limitation: the county explicitly says this list includes only parcels whose latest delinquency reminder was returned as undeliverable. It is not the complete Orange County delinquency roll.
- Identifier limitation: the current `unpdf` extraction emits the first literal parcel ID as `899-283 -45.00`. The application preserves that exact source value and leaves its normalized parcel ID null. It does not silently remove the malformed space. The other three IDs match accepted OC source forms.
- The notice describes a payment-plan/redemption path and a conditional future eligibility threshold. It does not publish a scheduled auction date, and the application does not create one.

### Notice of Impending Power to Sell (R&T Code 3361-3362)

- Current PDF observed: <https://www.octreasurer.gov/sites/ttc/files/2026-09/PTS-List-Published-June2026.pdf>
- Observed records: 184 unique literal parcel IDs, despite item numbering extending to No. 208 with gaps.
- Published addresses recognized conservatively: 120; the remaining 64 say “Address Not Available” and remain null.
- Executed: 2026-05-26.
- First publication date: 2026-06-01; the notice also states June 8 and 15.
- Amount as-of date: 2026-06-30.
- Statutory power-to-sell date: 2026-07-01.
- Limitation: power to sell is not an auction date. The notice is a historical snapshot and does not establish whether a parcel was later redeemed, remained eligible, or was scheduled/sold. Current outcome remains unverified.

The two-column PDF text interleaves item numbers. Parsing is bounded by each `NO.` marker, strict `NNN-NNN-NN` parcel form, and the published amount. The live check recognized exactly 184 records and 184 unique source parcel IDs.

## Existing Los Angeles County sources

### Treasurer and Tax Collector auction book

Source: <https://ttc.lacounty.gov/schedule-of-upcoming-auctions/>

On 2026-11-06 the live adapter followed the current official auction-book PDF and recognized 1,252 scheduled-tax-sale records. This is a later-stage sale publication, not an early distress feed. Published dates can be historical, postponed, redeemed, or otherwise stale.

### CNPA trustee-sale notices

Source: <https://www.capublicnotice.com/category/legals/notice-of-trustee-sale/rss.xml?county=Los%20Angeles&size=100>

On 2026-11-06 the bounded RSS fetch recognized 15 LA County trustee-sale notices and rejected 7 items missing required provenance/county evidence or duplicated by source ID. These are scheduled trustee-sale notices, not notice-of-default records. The feed may contain out-of-county items; strict LA recorder evidence remains mandatory.

## Coverage gaps

No accessible, ingestible public source was verified for mechanic liens, HOA liens, or utility liens in the current markets. The UI reports those as unavailable coverage. It never treats missing source coverage as evidence that a lien does not exist.

No contact enrichment, homeowner lookup, paid service, CAPTCHA bypass, or outreach capability was introduced.
