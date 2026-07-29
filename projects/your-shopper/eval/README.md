# Your Shopper evaluation laboratory

The paid evaluation runner compares frozen strategy configurations against a request-specific
protocol. It blinds and shuffles outputs, pools candidate URLs, independently re-fetches selected
sources with claim-focused summaries, and asks a separate judge to rank outputs and audit every
hard requirement. Live artifacts are written beneath `eval/artifacts` and ignored by Git.

## Cost-safe defaults

The default owned harness uses the best cost/quality pairing found in the July 2026 development
sweep:

| Role | Default |
| --- | --- |
| Research model | `minimax/minimax-m3` |
| Finalization model | `z-ai/glm-5.2` |
| Protocol model | `deepseek/deepseek-v4-flash` |
| Judge model | `deepseek/deepseek-v4-flash` |
| Search | Exa Search and Contents through `@templar/web-search` |
| Agent bounds | 8 model turns, 12 tool calls, 2 concurrent tools, 240 seconds |
| Per-strategy bounds | $0.12 research soft limit, $0.20 hard limit |

Exa Agent is not a default baseline. It is expensive and requires both an explicit strategy and
`--allow-exa-agent`. Routine development uses the owned shopper, owned controls, and optionally the
OpenRouter managed-search baseline. Exa Search remains the ordinary low-cost retrieval provider.
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

Pin every model role for a reproducible sweep:

```sh
pnpm --filter your-shopper eval -- \
  --cases dual-boiler-width-limit,laptop-dock-compatibility \
  --strategy your-shopper,disciplined-generic-agent \
  --model minimax/minimax-m3 \
  --finalization-model z-ai/glm-5.2 \
  --evaluator-model deepseek/deepseek-v4-flash \
  --judge-model deepseek/deepseek-v4-flash \
  --strategy-concurrency 1 \
  --tool-concurrency 2 \
  --agent-timeout-ms 240000 \
  --evaluator-timeout-ms 300000 \
  --max-verification-candidates 24 \
  --max-run-cost 1.00
```

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

Required environment variables are `OPENROUTER_API_TOKEN` and `EXA_API_KEY`. The command reads the
ignored repository `.env` followed by `projects/your-shopper/.env`. Artifacts retain exact model,
prompt version, controls, budgets, costs, raw traces, random seed, failed evaluator attempts, and
source verification evidence.
