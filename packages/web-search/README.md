# `@templar/web-search`

Effect-based web search and content retrieval backed by Exa. The public API exposes `search` and
`getContents`, preserves raw responses, request IDs, costs, grounding, and optional caller-schema
output, and deliberately excludes Exa Agent lifecycle methods.

Provider-facing inputs are passed through; Exa owns their validation. The package validates only
local schema conversion and parsing. Use `pnpm --filter @templar/web-search smoke:live` with
`EXA_API_KEY` set for the opt-in live smoke test.
