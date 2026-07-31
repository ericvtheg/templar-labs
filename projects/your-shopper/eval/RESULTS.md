# Your Shopper development results

Recorded 2026-07-29. These are development results, not a permanent leaderboard. Live web
inventory changes and the matrix is intentionally small; exact ignored artifacts remain under
`eval/artifacts` for local audit.

The production and evaluation-runner finalization default changed from GLM 5.2 to GPT-5.6 Luna on
2026-07-31 after OpenRouter's Luna price reduction. The tables below preserve the exact models and
costs of the recorded historical runs.

The recorded live runs use artifact format v1. The current runner writes v2 artifacts with a
canonical paid-stage resume fingerprint and intentionally refuses to resume v1 data. The v1 runs
remain valid audit evidence; the post-run safety changes affected checkpoint reuse, cost gates,
and the opt-in Exa Agent baseline, not the recorded shopper outputs. No paid rerun was made solely
to migrate artifact metadata.

All scored runs below predate the local-judge change and used DeepSeek V4 Flash for protocol
generation and judgment through OpenRouter. The current v3 harness instead locks both roles to
subscription-backed local Codex `gpt-5.6-sol`, and the historical scores have not been mechanically
rejudged. Manual-audit corrections called out below remain the authoritative caveats.

## Historical harness used for these results

| Role | Exact model |
| --- | --- |
| Research and tool use | `minimax/minimax-m3` |
| Finalization | `z-ai/glm-5.2` |
| Frozen evaluation protocol | `deepseek/deepseek-v4-flash` |
| Blinded judge | `deepseek/deepseek-v4-flash` |

The owned harness uses Exa Search and Contents, at most two concurrent tools, eight model turns,
twelve tool calls, a 240-second duration bound, a $0.12 research soft limit, and a $0.20
per-strategy hard limit. Exa Agent was not called after the cost policy was introduced.

MiniMax was the best low-cost research model tested, but it was unreliable at no-tool final
synthesis. GLM 5.2 was therefore used only for the final synthesis turn. That preserved MiniMax's
cheap search behavior while avoiding its encoded-tool-call failure mode. DeepSeek was much cheaper
than GLM as a judge and became dependable after the judge schema required an explicit status for
every hard requirement.

## Model and harness sweep

Earlier runs used less strict judge protocols, so reliability counts are useful within a run but
should not be compared mechanically across every row.

| Configuration | Cases | Shopper signal | Recorded run cost | Main finding |
| --- | ---: | --- | ---: | --- |
| DeepSeek V4 Flash research and synthesis | 4 | 1 win, 1 reliability pass | $0.7668 | Mixed product identity and weak synthesis |
| Qwen 3.6 Flash research and synthesis | 3 | 0 wins | $0.5471 | Cheap but incomplete and hallucination-prone |
| MiniMax M3 research and synthesis | 3 | 2 wins, 1 reliability pass | $0.8785 | Strong search, unreliable forced finalization |
| GLM 5.2 research and synthesis | 3 | 3 wins, 2 reliability passes | $1.1435 | Best all-in-one quality, highest latency and cost |
| MiniMax M3 + GLM 5.2, shopper v8 | 4 | 3 wins, average rank 1.25, 2 reliability passes | $1.0748 | Best cost/quality pairing; one unnecessary suspension |

Fixed-evidence finalizer probes supported the split. Qwen 3.7 Flash was extremely cheap but added
unsupported alternatives and later hit upstream shared-pool rate limits. DeepSeek at low reasoning
returned a usable answer but added unsupported generalizations. GLM 5.2 cost about $0.025 for the
long failure-case synthesis and kept the most useful source identity and uncertainty discipline.

## Final prompt signal

The coherent v8 comparison is stored in `eval/artifacts/2026-07-29T19-29-23.528Z`:

| Strategy | Wins | Average rank | Strict reliability | Completed | Strategy cost |
| --- | ---: | ---: | ---: | ---: | ---: |
| Your Shopper v8 | 3/4 | 1.25 | 2/4 | 3/4 | $0.3786 |
| Disciplined generic control | 1/4 | 1.75 | 2/4 | 4/4 | $0.5365 |

The v8 shopper corrected the earlier dual-boiler failure: it chose the fully verified Profitec Pro
300 rather than a newer option with unknown delivery and warranty. It also stopped recommending an
over-budget camera kit. The camera answer still failed strict reliability because professionally
inspected used inventory was not clearly refurbished, which is a legitimate remaining gap.

The only v8 ranking loss was the dock case. The shopper found the correct M3 MacBook Air clamshell
constraint but suspended to ask permission for a reversible setup tradeoff. Shopper v9 added a
general rule to present such tradeoffs with an actionable recommendation instead of blocking.

The final acquisition-aware v9 dock regression is stored in
`eval/artifacts/2026-07-29T19-57-43.902Z`:

- Your Shopper ranked first and passed all four hard requirements.
- The disciplined control ranked second and failed price and acquisition verification.
- Shopper cost was $0.0917 versus $0.1494 for the control.
- The primary i-Tec dock was tied to an exact current ProShop listing at 2,047 SEK, free shipping,
  and 4–5 day delivery; native dual 4K 60 Hz requires M3 clamshell mode.

This targeted regression is not presented as a fresh four-case matrix. Substituting it for the only
behavior changed by v9 yields the expected final shape—four completed shopper outputs, four ranking
wins, and three strict reliability passes—but that composite is explicitly not a single run.

## Travel retrieval and GPT-5.6 Luna finalizer probe

A paired live probe on `stockholm-tokyo-flight` compared the existing MiniMax M3 research model
with GPT-5.6 Luna or GLM 5.2 as the forced finalizer. The Luna run is stored in
`eval/artifacts/2026-07-29T22-42-27.152Z`; the GLM run is stored in
`eval/artifacts/2026-07-29T22-48-13.891Z`.

| Finalizer | Shopper status | Shopper reliability | Shopper rank | Shopper cost | Shopper duration | Whole comparison cost |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| GPT-5.6 Luna | completed | failed | 2/2 | $0.0905 | 84.9 s | $0.2536 |
| GLM 5.2 | completed | failed | 2/2 | $0.1169 | 58.7 s | $0.2917 |

Neither shopper found a fully verified itinerary for the exact dates with at most one stop, no
self-transfer, one checked bag, a total at or below 11,000 SEK, and a direct booking link. Luna
produced the more concrete shopper answer: it retained exact-date Google Flights candidates and
audited the missing return, baggage, currency, flight-number, and checkout evidence. GLM stayed at
route and schedule-level tradeoffs and did not surface an exact-date candidate. Both disciplined
generic controls ranked ahead of the shopper, and all four outputs failed strict reliability.

This is evidence that Luna is a viable finalization candidate, not evidence that it should replace
GLM. The runs used independent live research traces, random seeds, and generated protocols, so they
do not isolate finalizer quality. The dominant failure was retrieval: generic web search could not
obtain live, baggage-inclusive flight inventory and a stable direct booking offer. A fixed-evidence
finalizer comparison and an integration-backed travel case are needed before changing the default.

## Four-case GPT-5.6 Luna and GLM 5.2 sweep

A matched live sweep used MiniMax M3 for research and compared GPT-5.6 Luna with GLM 5.2 as the
forced finalizer on `dual-boiler-width-limit`, `refurbished-camera-kit`,
`laptop-dock-compatibility`, and `impossible-compact-fridge`. The Luna run is stored in
`eval/artifacts/2026-07-29T22-54-27.563Z`; the GLM run is stored in
`eval/artifacts/2026-07-29T23-19-05.240Z`.

| Finalizer | Automated shopper wins | Strict shopper reliability | Usable shopper answers after human audit | Shopper strategy cost | Whole comparison cost |
| --- | ---: | ---: | ---: | ---: | ---: |
| GPT-5.6 Luna | 4/4 | 1/4 | 4/4 | $0.4223 | $0.8401 |
| GLM 5.2 | 2/4 | 0/4 | 1/4 | $0.1994 | $0.5802 |

Luna returned a normal no-tool synthesis in every shopper case. It found the stronger dual-boiler
candidate without recommending it as fully verified, preserved the unresolved refurbished-lens
and total-cost failures in the camera case, and correctly concluded that the fridge constraints
required a tradeoff. The dock shopper was too conservative because its research did not verify a
native candidate, but its answer remained well-formed and transparent.

GLM's lower recorded cost is not a quality/cost win. Its finalizer emitted encoded `<tool_call>`
text instead of an answer in the dual-boiler, camera, and dock shopper runs, and in all four
disciplined-control runs, even though the provider reported `finishReason: stop`. Only the fridge
shopper produced a usable synthesis. CoreWeave served all eight GLM finalization turns in this
sweep; earlier successful GLM artifacts were served by a mix of CoreWeave, Friendli, and GMICloud,
so provider-route or model variance remains a material operational risk.

The automated Luna dock judgment is not trustworthy. Its reasoning claimed that an M3 MacBook Air
cannot drive two external displays natively, but Apple's M3-specific support documentation says it
can drive two simultaneously when the lid is closed. The judgment's ranking and hard-requirement
audit should therefore be excluded from model-selection conclusions.

The Luna run also exposed a cost outlier: the camera finalizer received about 94,000 input tokens
and cost $0.0700 by itself. Context size and evidence selection should be controlled before treating
Luna's cost profile as stable. One DeepSeek camera judge request timed out before checkpointed
resume; its potential upstream cost is not represented in the successful artifact's recorded
total.

This sweep makes Luna the stronger operational finalization candidate under the current OpenRouter
routes. It does not establish a broad quality win over a healthy GLM response because research
traces and evaluator protocols were generated independently. A fixed-evidence replay remains the
cleanest next comparison, while production use also needs a defense against encoded tool-call text
being accepted as a completed final answer.

## Evaluation lessons

- A judge that only ranks prose is not enough. Reliability now includes a schema-enforced audit of
  every hard requirement; `passes: true` is invalid when any requirement is unknown or failed.
- Current acquisition feasibility is an implicit hard requirement for find/buy missions. Protocol
  generation now requires an exact current seller or listing, supported availability, compatible
  delivery or pickup, and total acquisition cost unless the request says list price only.
- Claim-focused Exa summaries are supplied to the judge alongside capped page text. This fixed a
  false negative where relevant dimensions appeared beyond the first 2,000 characters.
- Clarification tracks can reward a focused suspension question. Research-decision and end-to-end
  tracks treat `waiting_for_input` as incomplete.
- Stage checkpoints and resume are essential: protocol, strategy, and verification work can be
  reused after evaluator timeouts without paying for search again.

## Known limitations

- Four final development cases are enough for directional signal, not statistical confidence.
- Marketplace and retailer state is volatile; reruns can legitimately change outcomes.
- The strict camera failure remains unresolved and should be part of the next holdout expansion.
- The historical DeepSeek judge occasionally violated the structured-output schema; one bounded
  correction was retained and its usage was included in artifacts and cost. The current local Sol
  judge retains the same bounded schema-correction path.
- Human audit is still required for economically important or surprising conclusions even when the
  structured judge passes them.
