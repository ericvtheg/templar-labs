# `@templar/agent`

Policy-free LLM/tool execution mechanics. The package owns model/tool iteration, validation of
model-produced arguments before local execution, bounded parallel calls and model/tool retries, budgets,
suspension and continuation, cancellation, ordered events, and traces.

Run snapshots include the exact model, reasoning, temperature, tool-choice and parallel-call
settings, provider options, budgets, retry policy, concurrency ceiling, instructions, and tool
schemas. Duration limits interrupt active model/tool execution and exclude time spent waiting for
human clarification.

Consumers may set `finalizationModel` to use a different exact model after a soft cost limit or
another execution limit ends the tool-enabled phase. Finalization instructions are configurable,
and the effective instructions and model IDs are retained in the run snapshot. Each turn request
remains visible in the trace.

Product instructions, enabled tools, value judgments, provider integrations, persistence, and
external outcome schemas belong to consuming applications.
