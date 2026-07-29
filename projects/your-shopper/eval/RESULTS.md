# Your Shopper development results

Recorded 2026-07-29. These are development results, not a permanent leaderboard. Live web
inventory changes and the matrix is intentionally small; exact ignored artifacts remain under
`eval/artifacts` for local audit.

The recorded live runs use artifact format v1. The current runner writes v2 artifacts with a
canonical paid-stage resume fingerprint and intentionally refuses to resume v1 data. The v1 runs
remain valid audit evidence; the post-run safety changes affected checkpoint reuse, cost gates,
and the opt-in Exa Agent baseline, not the recorded shopper outputs. No paid rerun was made solely
to migrate artifact metadata.

## Selected harness

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
- DeepSeek occasionally violates the structured-output schema; one bounded correction is retained
  and its usage is included in artifacts and cost.
- Human audit is still required for economically important or surprising conclusions even when the
  structured judge passes them.
