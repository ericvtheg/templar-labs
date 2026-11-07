# Property Watch partner workflow acceptance

This document is the durable delivery ledger for the approved partner workflow. A row is marked complete only when its production code and named regression coverage exist. Local fixtures are test-only; production acceptance remains a separate supervisor-run gate.

Status legend: `PENDING`, `IMPLEMENTED`, `LOCALLY VERIFIED`, `PRODUCTION GATE`.

Supervisor checkpoint: independently reran the actual web-workspace typecheck, 88 unit/integration tests, build, and 9 built-Worker desktop/mobile tests successfully after correcting strict-TypeScript failures missed by the worker's parent-workspace check. Scoped Biome has zero errors (warnings/info remain). This is not a release/completion claim. Before production, correct Norfolk pre-2000 transfer handling, exclude subject transfers from comparison candidates, explicitly label non-eight-digit candidate identities unresolved, and repair atomic cleanup/concurrent-preference guards in the opt-in production mutation verifier. That verifier must not run until those guards are tested. Quantitative helpers are ready at `/tmp/property-watch-decision-support/handoff.md`; A–E app integration remains pending.

## 1. Qualified shortlist

| Requirement | Implementation handle | Test handle | Status |
| --- | --- | --- | --- |
| Separate distress strength, evidence confidence, and buy-box fit; never describe a foreclosure probability | `repository.ts` ranked-property model plus shortlist cards in `index.tsx` | `partner-workflow.test.ts`; built-Worker desktop/mobile shortlist flows | LOCALLY VERIFIED |
| Explain every contribution, independence limit, missing input, dates, and status/freshness uncertainty | `repository.ts` score/confidence reasons and `partner.server.ts` fit reasons | Distress equality, named-basis fit, and deal-brief regressions | LOCALLY VERIFIED |
| Unknown fit is not a match and unknown confidence is not verified | `evaluateBuyBox` and explicit confidence labels | Missing-input and named-assumption fit regressions | LOCALLY VERIFIED |
| Useful ranking, sorting, and filters without a default buy box hiding all properties | Server-side distress/confidence/fit/recent sorts and bounded filters | API filter tests plus desktop/mobile triage E2E | LOCALLY VERIFIED |

## 2. Change tracking and saved-property alerts

| Requirement | Implementation handle | Test handle | Status |
| --- | --- | --- | --- |
| Successful-publication-only events for new installment, material balance change, independent signal, foreclosure initiation, explicit status change, and complete-snapshot disappearance | `change-tracking.ts` publication diff statements wired into `repository.ts` | Event-type, exact-status, signal-dedupe, and repeated-cycle regressions | LOCALLY VERIFIED |
| Failed/incomplete publication emits nothing; successful evidence, events, ranking, and run state publish atomically | One publication D1 batch in `repository.ts` | Injected later-statement failure atomicity regression | LOCALLY VERIFIED |
| Deterministic dedupe, reappearance/restoration, and missing-is-not-cured semantics | State-transition/run-aware event IDs in `change-tracking.ts` | Replay, same-publication cycle, restoration, and disappearance regressions | LOCALLY VERIFIED |
| Initial import creates an explicit baseline and no fabricated historical/new-distress alerts; published and detected times remain distinct | `source_publications.baseline_established_at` and event clocks | First-publication baseline regression | LOCALLY VERIFIED |
| New/worsening activity feed has property navigation and before/after/source/date context | Paginated partner workspace activity in `partner.server.ts` and `index.tsx` | Protected API and built-Worker feed flows | LOCALLY VERIFIED |
| Persistent saved-property and due-follow-up alerts, read state, and in-app preferences; no claimed external delivery | Recipient-scoped alerts/preferences in `partner.server.ts`; external delivery labeled not configured | 200-ID read, casing, lifecycle, preferences, persistence, API, and E2E regressions | LOCALLY VERIFIED |

## 3. Buying criteria

| Requirement | Implementation handle | Test handle | Status |
| --- | --- | --- | --- |
| Shared editable buy boxes cover type, market/neighborhood/ZIP, size, named reliable value basis/range, and distress phase | Versioned `buy_boxes`, `upsertBuyBox`, and workspace editor | Mutation/persistence and partner-visible desktop E2E | LOCALLY VERIFIED |
| Property-type normalization uses only authoritative mappings; unknown stays unknown | Exact Norfolk official class/use mapping with provenance in `norfolk-deal-data.ts` | Published class vocabulary mapping regression | LOCALLY VERIFIED |
| Missing size/value/type is shown and produces unknown fit, not a silent match | `evaluateBuyBox` missing-input contract | Unknown-fit and deal-brief regressions | LOCALLY VERIFIED |
| Working filters and transparent fit results/reasons persist across reload and authorized partners | Dashboard query plus shared buy-box state | API filters and two-identity desktop/mobile E2E | LOCALLY VERIFIED |
| Assessed value, sourced sale amount, and dated user assumption remain distinct | Separate enrichment/sale/assumption tables and named assumption basis | Named-assumption dashboard/detail parity regression | LOCALLY VERIFIED |

## 4. Source-backed deal brief

| Requirement | Implementation handle | Test handle | Status |
| --- | --- | --- | --- |
| Property view covers why surfaced, real changes, owner provenance, characteristics, evidence/debt/status/dates/links, missing facts, and next checks | `loadDealBrief` plus detail workspace in `index.tsx` | Detail API, explicit evidence pagination, and built-Worker deal-brief flow | LOCALLY VERIFIED |
| Official Norfolk parcel/assessment/sales enrichment uses an exact authoritative join and live targeted ingestion | Stable-publication adapter and `--enrich-norfolk=PIN` source-specific runner | Exact join, pagination/bound, class mapping, persistence, and metadata-drift regressions | PRODUCTION GATE |
| Sales are labeled candidate/recent sales with selection criteria and limitations, never appraisal; assessment is not market value | Bounded candidate coverage and deal-brief labels | Candidate/package/unit/label regressions | LOCALLY VERIFIED |
| Mortgage payoff/equity stay unknown absent verified balances; dated user assumptions never overwrite sourced facts | Separate source facts and append-only assumptions in `partner.server.ts` | Deal-brief/assumption mutation regression | LOCALLY VERIFIED |
| No paid/private/contact enrichment or invented crosswalk | Public official adapter with exact literal PIN only | Source adapter inspection and `source-research.md` | LOCALLY VERIFIED |

## 5. Shared review pipeline

| Requirement | Implementation handle | Test handle | Status |
| --- | --- | --- | --- |
| Durable shared save/dismiss/reopen, stage, two-identity assignment, follow-up, and explicit pass reason | Versioned `partner_properties` and atomic `updatePipelineProperty` | Authenticated mutation, first-create conflict, rollback, lifecycle, persistence, and E2E regressions | LOCALLY VERIFIED |
| Append-only attributed notes and timestamps with optimistic concurrency/no lost edits | `property_notes`, canonical authors, and versioned shared state | Note retention, ghost-key rejection, and stale-version conflict regressions | LOCALLY VERIFIED |
| Personal alert/read/preferences state is distinguished from shared property/review state | Recipient-scoped alert state and shared pipeline/buy boxes | Two-identity state model and E2E assertions | LOCALLY VERIFIED |
| Desktop/mobile pipeline views and filters | Responsive workspace/pipeline in `index.tsx` and `styles.css` | Built-Worker desktop and mobile Playwright flows | LOCALLY VERIFIED |
| Selected-key evidence CSV is protected, snapshot-coherent, exact, injection-safe, and not silently truncated | Exact-key paginated `selectedEvidenceCsv` with publication token | 100-key D1 boundary, missing-key, mid-export mutation, amount typing, and injection regressions | LOCALLY VERIFIED |
| Research state survives source refresh/ranking replacement and disappearing properties | Partner tables remain independent of watchlist replacement and require retained evidence only on create | Source-refresh/disappearance note/assumption/state regressions | LOCALLY VERIFIED |

## Cross-cutting security and operations

| Requirement | Implementation handle | Test handle | Status |
| --- | --- | --- | --- |
| Preserve literal verified-email allowlist and existing account-switch/login behavior | Existing auth architecture retained; canonicalization occurs after allowlist authentication | Existing auth/API/browser regressions | LOCALLY VERIFIED |
| All reads, mutations, alerts, buy boxes, briefs, and exports require auth; mutations require exact same origin and validated bounded payloads | Protected routes in `research.server.ts` | Auth, CSRF, table-driven wrong-type/extra-field/zero-write regressions | LOCALLY VERIFIED |
| Production acceptance mutations are explicit opt-in, use real existing properties, restore state, and clean attributed test notes separately | `verify-production-mutations.ts` and manual `la-partner-mutation-acceptance.yml` | Guarded cleanup/static review; supervisor production run outstanding | PRODUCTION GATE |
| Normal read-only acceptance remains read-only; deployment stays scoped and is not performed by this implementation task | Existing read-only verifier plus separate mutation workflow | Workflow review and local build | LOCALLY VERIFIED |

## A. Evidence-backed investigation and contradictions

| Requirement | Implementation handle | Test handle | Status |
| --- | --- | --- | --- |
| Concise sourced brief answers what happened, what remains unresolved as of which date, contradictions, and next checks; every fact retains record/date/link provenance | Pending investigation ledger and deterministic summary | Provenance/contradiction/unknown-boundary unit and E2E flow | PENDING |
| Reconcile explicit legal releases/withdrawals/cures/stays, tax/code state, ownership transfers, and identity conflicts without broad lien release or debt-extinguishment inference | Pending evidence reconciliation | Exact-link/status/transfer conflict regressions | PENDING |
| Safe selected-property recheck preserves dataset-as-of, event, fetched, reviewed, and verified clocks separately; failures/cache hits never refresh verification | Pending targeted recheck action | Recheck success/cache/failure clock regressions | PENDING |
| Reusable assessment workflow includes evidence ledger and outstanding questions rather than unsupported sales claims | Pending assessment state/UI | Desktop/mobile assessment flow | PENDING |

## B. Active bad-lead filtering

| Requirement | Implementation handle | Test handle | Status |
| --- | --- | --- | --- |
| Visible reversible deprioritization reasons cover sourced resolution, ownership/sale review, duplicate/unmatched identity, staleness, buy-box mismatch, and research unknowns | Pending qualification/deprioritization model | Multi-reason qualification and reversal regressions | PENDING |
| Negative evidence changes active qualification without deleting raw evidence, notes, or audit; concurrent signals remain independent | Pending evidence ledger and pipeline audit | History/notes/multi-signal retention regressions | PENDING |
| Overrides store actor, reason, and date without modifying sourced truth | Pending append-only qualification override | Auth/concurrency/audit/E2E regressions | PENDING |

## C. Named flip and rental economics

| Requirement | Implementation handle | Test handle | Status |
| --- | --- | --- | --- |
| Persist multiple named flip and rental/hold scenarios with explicit sourced vs dated user-assumption inputs | Pending decision-support helper handoff and scenario persistence | Helper arithmetic plus route/persistence tests | PENDING |
| Line-item profit, cash invested, return, break-even/maximum purchase price, and sensitivity math is complete when inputs exist and missing-input when they do not | Pending quantitative helper integration | Thorough boundary/missing-input/sensitivity tests | PENDING |
| Actual sale candidates show criteria/exclusions; no invented condition, rehab, market value, payoff, lien priority, equity, or forecast guarantee | Pending Norfolk transfer candidate integration | Package-sale/unit/provenance/label regressions and E2E | PENDING |

## D. Feedback-based transparent bounded prioritization

| Requirement | Implementation handle | Test handle | Status |
| --- | --- | --- | --- |
| Capture useful/not useful, verified unresolved/wrong match/stale, investigation vs opportunity, known offer/close, reason, and research time | Pending attributed review/outcome model | Validation/persistence/audit/E2E tests | PENDING |
| Report transparent performance by signal combination and market with versioned baseline rationale using real reviews only | Pending aggregate report | Denominator/grouping/version regressions | PENDING |
| Optional bounded adjustments expose sample counts/minimum thresholds; sparse data is insufficient, never learned confidence | Pending bounded prioritization helper | Threshold/reversal/no-held-out-leakage tests | PENDING |
| Baseline ranking remains available; adjustments can be toggled/reset with audit and buy box remains authoritative | Pending ranking profile state | Toggle/reset/audit/filter regressions | PENDING |

## E. Blind CSV benchmark

| Requirement | Implementation handle | Test handle | Status |
| --- | --- | --- | --- |
| Same-market/date/buy-box benchmark accepts licensed user CSV; live state honestly empty without an import | Pending benchmark/import tables and UI | Empty state and import E2E | PENDING |
| Validated mapping, exact property identifier matching/dedupe, uncertain missing IDs, source counts, and overlap | Pending CSV importer | Mapping/dedupe/unknown/injection regressions | PENDING |
| Persist anonymized randomized review order and hide origin/vendor scores/filenames/IDs/links until explicit reveal | Pending blind assignment/reveal state | Blind-leakage/order/reveal tests | PENDING |
| Review captures correctness/unknown, worthwhile yes/no/unknown, time, reason; metrics distinguish missing reviews and overlap and show denominators/agreement | Pending review model and decision-support metrics handoff | Metrics and reviewer-flow tests | PENDING |
| Post-reveal comparison/export reports useful proportion, verified-state correctness, and time per useful lead without unsupported significance/outperformance claims | Pending reveal metrics/export | Calculation/export/label regressions | PENDING |

The quantitative helper worker is restricted to `/tmp/property-watch-decision-support/`. Its tested scenario and benchmark helpers will be reviewed and integrated when its `handoff.md` appears; the application will not grow a competing math implementation in the meantime.

## Production gates and truthful limitations

- Production OAuth, D1 migration, live targeted Norfolk enrichment, controlled mutation/restoration, screenshots, and deployment are `PRODUCTION GATE` items for the supervisor; this implementation task must not deploy.
- Overall completion requires the original five features and additive A–E. Finishing the foundation alone is an intermediate milestone, not task completion.
- Assessed value is not market value. Sales candidates are not an appraisal. Current mortgage payoff and equity are unknown without verified current balances.
- Publication refresh proves what a publisher delivered at that publication, not that every property status was reconfirmed at refresh time.
- Complete-snapshot disappearance means verification is required; it never proves paid, cured, withdrawn, or otherwise resolved.
