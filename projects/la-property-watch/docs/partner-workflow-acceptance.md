# Property Watch partner workflow acceptance

This document is the durable delivery ledger for the approved partner workflow. A row is marked complete only when its production code and named regression coverage exist. Local fixtures are test-only; production acceptance remains a separate supervisor-run gate.

Status legend: `RELEASE VERIFIED` means deployed code plus owning regression coverage and the relevant production workflow accepted. Edge-case failure fixtures remain local tests unless explicitly identified below. Human Google callback completion is a separate unverified boundary.

Deployment checkpoint: complete product code `9110d1b53a2bdbf7eb3197b4f5b5d679ba891424` was deployed without a full source refresh in [run 42419654050](https://github.com/ericvtheg/templar-labs/actions/runs/42419654050). Additive migrations 0007/0008 applied successfully; previously applied 0006 remains unchanged. Protected data/export, Google chooser/PKCE initiation, and desktop/mobile acceptance passed. The earlier query regression and stale source-link locator are resolved.

Supervisor checkpoint: the parent independently reran **145 unit/API/integration tests**, strict project and web TypeScript, production build, and **10 built-Worker desktop/mobile tests**. Expanded read-only production browser [run 42420859323](https://github.com/ericvtheg/templar-labs/actions/runs/42420859323) passed loaded qualification, investigation, feedback, economics, change feed, pipeline, buy-box and blind-benchmark screens for both approved identities. Guarded production mutation [run 42421826417](https://github.com/ericvtheg/templar-labs/actions/runs/42421826417) passed on exact property `norfolk-va:32464650`, including actual-D1 rollback, fresh cross-partner reads, flip/rental revisions, actual sale-candidate snapshots, premature-reveal rejection, complete blind review, frozen criteria, classified CSV, alerts, assessment, qualification override, feedback, ranking reset and exact cleanup. Real assessor data, one extension, ten sale candidates, one enrichment run and one fresh tax/code recheck were retained. Test-only state was removed. These checks use secret-backed approved CI sessions, not a completed human Google login.

## 1. Qualified shortlist

| Requirement | Implementation handle | Test handle | Status |
| --- | --- | --- | --- |
| Separate distress strength, evidence confidence, and buy-box fit; never describe a foreclosure probability | `repository.ts` ranked-property model plus shortlist cards in `index.tsx` | `partner-workflow.test.ts`; built-Worker desktop/mobile shortlist flows | RELEASE VERIFIED |
| Explain every contribution, independence limit, missing input, dates, and status/freshness uncertainty | `repository.ts` score/confidence reasons and `partner.server.ts` fit reasons | Distress equality, named-basis fit, and deal-brief regressions | RELEASE VERIFIED |
| Unknown fit is not a match and unknown confidence is not verified | `evaluateBuyBox` and explicit confidence labels | Missing-input and named-assumption fit regressions | RELEASE VERIFIED |
| Useful ranking, sorting, and filters without a default buy box hiding all properties | Server-side distress/confidence/fit/recent sorts and bounded filters | API filter tests plus desktop/mobile triage E2E | RELEASE VERIFIED |

## 2. Change tracking and saved-property alerts

| Requirement | Implementation handle | Test handle | Status |
| --- | --- | --- | --- |
| Successful-publication-only events for new installment, material balance change, independent signal, foreclosure initiation, explicit status change, and complete-snapshot disappearance | `change-tracking.ts` publication diff statements wired into `repository.ts` | Event-type, exact-status, signal-dedupe, and repeated-cycle regressions | RELEASE VERIFIED |
| Failed/incomplete publication emits nothing; successful evidence, events, ranking, and run state publish atomically | One publication D1 batch in `repository.ts` | Injected later-statement failure atomicity regression | RELEASE VERIFIED |
| Deterministic dedupe, reappearance/restoration, and missing-is-not-cured semantics | State-transition/run-aware event IDs in `change-tracking.ts` | Replay, same-publication cycle, restoration, and disappearance regressions | RELEASE VERIFIED |
| Initial import creates an explicit baseline and no fabricated historical/new-distress alerts; published and detected times remain distinct | `source_publications.baseline_established_at` and event clocks | First-publication baseline regression | RELEASE VERIFIED |
| New/worsening activity feed has property navigation and before/after/source/date context | Paginated partner workspace activity in `partner.server.ts` and `index.tsx` | Protected API and built-Worker feed flows | RELEASE VERIFIED |
| Persistent saved-property and due-follow-up alerts, read state, and in-app preferences; no claimed external delivery | Recipient-scoped alerts/preferences in `partner.server.ts`; external delivery labeled not configured | 200-ID read, casing, lifecycle, preferences, persistence, API, and E2E regressions | RELEASE VERIFIED |

## 3. Buying criteria

| Requirement | Implementation handle | Test handle | Status |
| --- | --- | --- | --- |
| Shared editable buy boxes cover type, market/neighborhood/ZIP, size, named reliable value basis/range, and distress phase | Versioned `buy_boxes`, `upsertBuyBox`, and workspace editor | Mutation/persistence and partner-visible desktop E2E | RELEASE VERIFIED |
| Property-type normalization uses only authoritative mappings; unknown stays unknown | Exact Norfolk official class/use mapping with provenance in `norfolk-deal-data.ts` | Published class vocabulary mapping regression | RELEASE VERIFIED |
| Missing size/value/type is shown and produces unknown fit, not a silent match | `evaluateBuyBox` missing-input contract | Unknown-fit and deal-brief regressions | RELEASE VERIFIED |
| Working filters and transparent fit results/reasons persist across reload and authorized partners | Dashboard query plus shared buy-box state | API filters and two-identity desktop/mobile E2E | RELEASE VERIFIED |
| Assessed value, sourced sale amount, and dated user assumption remain distinct | Separate enrichment/sale/assumption tables and named assumption basis | Named-assumption dashboard/detail parity regression | RELEASE VERIFIED |

## 4. Source-backed deal brief

| Requirement | Implementation handle | Test handle | Status |
| --- | --- | --- | --- |
| Property view covers why surfaced, real changes, owner provenance, characteristics, evidence/debt/status/dates/links, missing facts, and next checks | `loadDealBrief` plus detail workspace in `index.tsx` | Detail API, explicit evidence pagination, and built-Worker deal-brief flow | RELEASE VERIFIED |
| Official Norfolk parcel/assessment/sales enrichment uses an exact authoritative join and live targeted ingestion | Stable-publication adapter and `--enrich-norfolk=PIN` source-specific runner | Exact join, pagination/bound, class mapping, persistence, and metadata-drift regressions | RELEASE VERIFIED |
| Sales are labeled candidate/recent sales with selection criteria and limitations, never appraisal; assessment is not market value | Bounded candidate coverage and deal-brief labels | Candidate/package/unit/label regressions | RELEASE VERIFIED |
| Mortgage payoff/equity stay unknown absent verified balances; dated user assumptions never overwrite sourced facts | Separate source facts and append-only assumptions in `partner.server.ts` | Deal-brief/assumption mutation regression | RELEASE VERIFIED |
| No paid/private/contact enrichment or invented crosswalk | Public official adapter with exact literal PIN only | Source adapter inspection and `source-research.md` | RELEASE VERIFIED |

## 5. Shared review pipeline

| Requirement | Implementation handle | Test handle | Status |
| --- | --- | --- | --- |
| Durable shared save/dismiss/reopen, stage, two-identity assignment, follow-up, and explicit pass reason | Versioned `partner_properties` and atomic `updatePipelineProperty` | Authenticated mutation, first-create conflict, rollback, lifecycle, persistence, and E2E regressions | RELEASE VERIFIED |
| Append-only attributed notes and timestamps with optimistic concurrency/no lost edits | `property_notes`, canonical authors, and versioned shared state | Note retention, ghost-key rejection, and stale-version conflict regressions | RELEASE VERIFIED |
| Personal alert/read/preferences state is distinguished from shared property/review state | Recipient-scoped alert state and shared pipeline/buy boxes | Two-identity state model and E2E assertions | RELEASE VERIFIED |
| Desktop/mobile pipeline views and filters | Responsive workspace/pipeline in `index.tsx` and `styles.css` | Built-Worker desktop and mobile Playwright flows | RELEASE VERIFIED |
| Selected-key evidence CSV is protected, snapshot-coherent, exact, injection-safe, and not silently truncated | Exact-key paginated `selectedEvidenceCsv` with publication token | 100-key D1 boundary, missing-key, mid-export mutation, amount typing, and injection regressions | RELEASE VERIFIED |
| Research state survives source refresh/ranking replacement and disappearing properties | Partner tables remain independent of watchlist replacement and require retained evidence only on create | Source-refresh/disappearance note/assumption/state regressions | RELEASE VERIFIED |

## Cross-cutting security and operations

| Requirement | Implementation handle | Test handle | Status |
| --- | --- | --- | --- |
| Preserve literal verified-email allowlist and existing account-switch/login behavior | Existing auth architecture retained; canonicalization occurs after allowlist authentication | Existing auth/API/browser regressions | RELEASE VERIFIED |
| All reads, mutations, alerts, buy boxes, briefs, and exports require auth; mutations require exact same origin and validated bounded payloads | Protected routes in `research.server.ts` | Auth, CSRF, table-driven wrong-type/extra-field/zero-write regressions | RELEASE VERIFIED |
| Production acceptance mutations are explicit opt-in, first prove actual-D1 batch rollback with one exact disposable sentinel, select an unused real Norfolk property, verify two sessions plus C/E, retain official observations, and atomically clean only exact synthetic IDs/versions | `verify-production-mutations.ts`, `verify-production-queries.ts`, `mutation-acceptance-cleanup.ts`, and manual `la-partner-mutation-acceptance.yml`; provider row metadata is reported when present | SQL guard rollback tests for preference, ranking, scenario, and benchmark tokens; actual-provider run 42421826417 passed | RELEASE VERIFIED |
| Diagnostics-only acceptance executes bounded current dashboard logic directly through the Cloudflare D1 REST adapter and requires deployed API 200 for qualification plus persisted buy box | `verify-production-queries.ts` and the workflow `diagnostics_only` option | Built-Worker 200 assertion; actual-provider run 42421826417 passed | RELEASE VERIFIED |
| Normal read-only acceptance remains read-only; deployment stays scoped and is not performed by this implementation task | Existing read-only verifier plus separate mutation workflow | Workflow review and local build | RELEASE VERIFIED |
| Read-only browser acceptance waits for the exact filtered property and cannot click stale rows while search is pending | `apps/web/scripts/verify-browser.ts` and disabled pending shortlist rows | Existing production verifier plus built-Worker ranked search flows; expanded production run 42420859323 passed | RELEASE VERIFIED |

## A. Evidence-backed investigation and contradictions

| Requirement | Implementation handle | Test handle | Status |
| --- | --- | --- | --- |
| Concise sourced brief answers what happened, what remains unresolved as of which date, contradictions, and next checks; every fact retains record/date/link provenance | `decision-support.server.ts` append-only `property_assessments` ledger and attributed assessment UI in `index.tsx` | `decision-support.test.ts` provenance/contradiction/no-unsupported-claim regression; built-Worker assessment flow | RELEASE VERIFIED |
| Reconcile explicit legal releases/withdrawals/cures/stays, tax/code state, ownership transfers, and identity conflicts without broad lien release or debt-extinguishment inference | Signal-record-specific reconciliation in `qualificationSummary` and deterministic assessment contradictions | Exact cured-plus-active-code/lien-release/owner-conflict regressions | RELEASE VERIFIED |
| Safe selected-property recheck preserves dataset-as-of, event, fetched, reviewed, and verified clocks separately; failures/cache hits never refresh verification | Fresh Norfolk Socrata `recheckSelectedProperty`, `property_rechecks`, and recheck status UI | Fresh stable-fetch success and HTTP failure clock regression; production fresh fetch in run 42421826417 passed | RELEASE VERIFIED |
| Reusable assessment workflow includes evidence ledger and outstanding questions rather than unsupported sales claims | Protected `/api/research/assessments/:key`, persisted history, linked assertion ledger, contradictions and open questions UI | API protection/validation plus desktop built-Worker create/reload/second-partner visibility | RELEASE VERIFIED |

## B. Active bad-lead filtering

| Requirement | Implementation handle | Test handle | Status |
| --- | --- | --- | --- |
| Visible reversible deprioritization reasons cover sourced resolution, ownership/sale review, duplicate/unmatched identity, staleness, buy-box mismatch, and research unknowns | `qualificationSummary`, server-side `qualification` shortlist filter, reason ledger and override controls | Multi-reason and server filter regressions; desktop/mobile filter/detail E2E | RELEASE VERIFIED |
| Negative evidence changes active qualification without deleting raw evidence, notes, or audit; concurrent signals remain independent | Record-specific active/negative classification; source evidence and research tables remain untouched | Cured-tax plus active code/lien retention and note/evidence-count regressions | RELEASE VERIFIED |
| Overrides store actor, reason, and date without modifying sourced truth | Versioned `property_qualification_overrides` plus append-only audit in migration 0006 | Optimistic conflict, reversal, protected API, and second-partner E2E visibility | RELEASE VERIFIED |

## C. Named flip and rental economics

| Requirement | Implementation handle | Test handle | Status |
| --- | --- | --- | --- |
| Persist multiple named flip and rental/hold scenarios with explicit dated user-assumption inputs and no forged record binding | `scenario-benchmark.server.ts`, migration 0007, protected scenario routes, and deal-brief scenario workspace | `decision-support-domain.test.ts`; `scenario-benchmark.test.ts`; `scenario-benchmark-api.test.ts`; built-Worker persistence flow | RELEASE VERIFIED |
| Line-item profit, cash invested, return, break-even/maximum purchase price, and sensitivity math is complete when inputs exist and missing-input when they do not | Integrated `decision-support/economics.ts`; money accepts visible USD dollars and persists validated integer cents | Independent flip/rental/zero/missing/amortization/yield tests plus persisted calculation and sensitivity assertions | RELEASE VERIFIED |
| Actual sale candidates show criteria/exclusions; no invented condition, rehab, market value, payoff, lien priority, equity, or forecast guarantee | Exact subject-scoped `property_sales` references with support/exclusion reason and explicit non-appraisal boundary | Cross-subject rejection, exact persisted-candidate, package/unit/provenance tests and desktop E2E | RELEASE VERIFIED |

## D. Feedback-based transparent bounded prioritization

| Requirement | Implementation handle | Test handle | Status |
| --- | --- | --- | --- |
| Capture useful/not useful/unknown, unresolved/wrong match/stale/resolved/unknown, investigation interest, known offer/close, reason, and research time | Versioned per-property/reviewer `property_feedback`, append-only audit, protected API and property feedback UI | Validation, optimistic version, dedup/revision, API and desktop E2E regressions | RELEASE VERIFIED |
| Report transparent performance by signal combination and market with versioned baseline rationale using real reviews only | Stored review-time market/signal context and transparent grouped performance in `loadDecisionSupport`/UI | Judgment-vs-unique-property denominators, revision context, offer/close/time grouping tests | RELEASE VERIFIED |
| Optional bounded adjustments expose sample counts/minimum thresholds; sparse data is insufficient, never learned confidence | Shared versioned ranking profile, 3–100 minimum samples, 1–20 bounded points, `adjusted` sort | Threshold/bound/reversal regression and built-Worker insufficient-evidence display | RELEASE VERIFIED |
| Baseline ranking remains available; adjustments can be toggled/reset with audit and buy box remains authoritative | Default distress sort unchanged; optional adjusted sort; profile/audit UI; fit remains an independent server filter | Toggle/reset audit, adjusted-order score, fit regression, and desktop E2E | RELEASE VERIFIED |

## E. Blind CSV benchmark

| Requirement | Implementation handle | Test handle | Status |
| --- | --- | --- | --- |
| Same-market/date/immutable-buy-box benchmark accepts licensed user CSV; live state honestly empty without an import | `blind_benchmarks`/private imports in migration 0007, exact buy-box fingerprint, protected benchmark routes, and benchmark workspace | Empty-state, import, persistence, API, and built-Worker import/reload tests | RELEASE VERIFIED |
| Validated mapping, exact property identifier matching/dedupe, uncertain missing IDs, source counts, and overlap | Integrated bounded RFC4180 `decision-support/csv.ts`; server-controlled Norfolk tax-account pattern | Mapping/dedupe/quarantine/overlap/oversize tests | RELEASE VERIFIED |
| Persist anonymized randomized review order and hide origin/vendor scores/filenames/IDs/links until explicit reveal | Cryptographic persisted blind state, sanitized server projection, setup-creator/reviewer split, irreversible reveal | Pre-reveal response-string leakage, corrupt-state/order, partner reload, reveal-gate, and E2E assertions | RELEASE VERIFIED |
| Review captures correctness/unknown, worthwhile yes/no/unknown, time, reason; metrics distinguish missing reviews and overlap and show denominators/agreement | Independent reviewer rows/audit and held-out benchmark metrics; every assigned reviewer covers every card | Optimistic conflict, unknown/missing, denominators, agreement, reload, and training-isolation tests | RELEASE VERIFIED |
| Post-reveal comparison/export reports useful proportion, verified-state correctness, and time per useful lead without unsupported significance/outperformance claims | Post-reveal source metrics and formula-safe CSV export from persisted reviews | Calculation, irreversible reveal, export, formula neutralization, and built-Worker download tests | RELEASE VERIFIED |

The supplied quantitative package is integrated once under `apps/web/src/lib/decision-support/`; persistence and UI consume those helpers rather than maintaining competing math.

## Production gates and truthful limitations

- Production migration/deployment, loaded desktop/mobile screens, two-partner persistence, fresh selected-property recheck, actual-D1 qualification-plus-buy-box HTTP 200, rollback and guarded cleanup gates are verified by the linked runs. The qualification-plus-buy-box query returned ten rows with matching direct/provider API totals of 6,395. Human Google login/callback remains unverified; provider initiation/account choice and existing access controls passed. No real competitor export has been supplied, so no competitive-performance result is claimed.
- Overall completion requires the original five features and additive A–E. Finishing the foundation alone is an intermediate milestone, not task completion.
- Assessed value is not market value. Sales candidates are not an appraisal. Current mortgage payoff and equity are unknown without verified current balances.
- Publication refresh proves what a publisher delivered at that publication, not that every property status was reconfirmed at refresh time.
- Complete-snapshot disappearance means verification is required; it never proves paid, cured, withdrawn, or otherwise resolved.
- C is integrated through `apps/web/src/lib/decision-support/economics.ts`, versioned scenario persistence and editable UI. No-op edits preserve per-input dates and sensitivities; immutable candidate snapshots survive source changes and disappearance.
- E is integrated through the shared CSV/benchmark helpers and server-private randomized state. Every assigned reviewer/card judgment is required before reveal; review/audit writes are atomic and frozen after reveal. Test-only classification survives export, and held-out reviews cannot train ranking.
