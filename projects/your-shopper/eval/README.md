# Your Shopper evaluation laboratory

The paid evaluation runner compares frozen strategy configurations against a request-specific
protocol. It blinds and shuffles outputs, pools candidate URLs, independently re-fetches selected
sources with claim-focused summaries, and asks a local subscription-backed Codex Sol judge to rank
outputs and audit every hard requirement. Live artifacts are written beneath `eval/artifacts` and
ignored by Git. The evaluation command is intentionally developer-only and is not run in CI.

## Cost-safe defaults

The default owned harness uses the current production model pairing:

| Role | Default |
| --- | --- |
| Research model | `minimax/minimax-m3` |
| Finalization model | `openai/gpt-5.6-luna` |
| Protocol model | Local Codex CLI `gpt-5.6-sol` through ChatGPT authentication |
| Judge model | Local Codex CLI `gpt-5.6-sol` through ChatGPT authentication |
| Search | Exa Search and Contents through `@templar/web-search` |
| Agent bounds | 8 model turns, 12 tool calls, 2 concurrent tools, 240 seconds |
| Per-strategy bounds | $0.12 research soft limit, $0.20 hard limit |

Protocol generation and judgment never use OpenRouter and cannot be switched to another model.
`codex exec` runs ephemerally in a temporary directory, disables tools and web search, strips API-key
environment variables, and reuses the machine's saved ChatGPT login. Its marginal API cost is
recorded as zero while token usage remains in the artifact. OpenRouter is reserved for strategy
model calls that exercise the production agent path. The real adapter refuses to start when a `CI`
environment variable is present; unit tests inject a no-cost fake executor.

The OpenRouter managed-search strategy is not in the default matrix. It remains an explicit
benchmark only when that server-side search route is being considered as a production alternative.

Exa Agent is not a default baseline. It is expensive and requires both an explicit strategy and
`--allow-exa-agent`. Routine development uses the owned shopper and owned controls. Exa Search
remains the ordinary low-cost retrieval provider.
The Exa Agent timeout bounds local polling; because the baseline has no cancellation call, a timed
out remote run may still finish and bill, which is another reason to use the baseline sparingly.

The run-level cost ceiling is checked between atomic cases. A final in-flight case can therefore
take the recorded total above the ceiling, but the next case will not start.

## Commands

List cases, strategies, and exact defaults without spending credits:

```sh
pnpm --filter your-shopper eval -- --list
```

Run one controlled comparison:

```sh
pnpm --filter your-shopper eval -- \
  --case dual-boiler-width-limit \
  --strategy your-shopper,disciplined-generic-agent \
  --max-run-cost 0.50
```

Pin every production model role for a reproducible sweep; the evaluator remains fixed to local Sol:

```sh
pnpm --filter your-shopper eval -- \
  --cases dual-boiler-width-limit,laptop-dock-compatibility \
  --strategy your-shopper,disciplined-generic-agent \
  --model minimax/minimax-m3 \
  --finalization-model openai/gpt-5.6-luna \
  --strategy-concurrency 1 \
  --tool-concurrency 2 \
  --agent-timeout-ms 240000 \
  --evaluator-timeout-ms 300000 \
  --max-verification-candidates 24 \
  --max-run-cost 1.00
```

GPT-5.6 Luna became the default finalization model on 2026-07-31 after its OpenRouter pricing fell
below GLM 5.2. The July four-case sweep also found Luna operationally stronger: all four shopper
finalizations were usable after human audit, compared with one of four for GLM. Luna's recorded
strategy cost was higher in that sweep because of an unusually large finalization context, so the
historical artifact cost should not be read as the current list-price comparison. GLM 5.2 remains
registered as an exact model for reproducing historical experiments.

Resume stage checkpoints without repeating completed strategy or verification work:

```sh
pnpm --filter your-shopper eval -- \
  --cases dual-boiler-width-limit,laptop-dock-compatibility \
  --strategy your-shopper,disciplined-generic-agent \
  --resume projects/your-shopper/eval/artifacts/<run>
```

Resume reuse is gated by a SHA-256 fingerprint over the complete case, exact strategy prompts and
controls, evaluator and judge configuration/prompts, and verification settings. A completed
checkpoint is reused directly. Any mismatch is rejected before another paid stage starts.

Run Exa Agent only after cheaper baselines show a useful signal:

```sh
pnpm --filter your-shopper eval -- \
  --case dual-boiler-width-limit \
  --strategy your-shopper,exa-agent \
  --allow-exa-agent \
  --exa-agent-timeout-ms 180000
```

Required environment variables for the production-path strategy and retrieval calls are
`OPENROUTER_API_TOKEN` and `EXA_API_KEY`. The local evaluator additionally requires the Codex login
status to report ChatGPT authentication; it refuses API-key authentication. The command reads the
ignored repository `.env` followed by `projects/your-shopper/.env`. Artifacts retain exact model,
prompt version, controls, budgets, costs, local evaluator token usage, raw traces, random seed,
failed evaluator attempts, and source verification evidence.
