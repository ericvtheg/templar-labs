# Your Shopper

Your Shopper is an evaluation-first shopping research agent with a deployed TanStack Start product
surface and authenticated API.

The local product stack is:

```text
your-shopper-agent
  → @templar/agent       model/tool loop, limits, events, traces
      → @templar/llm     provider-backed model turns
  → @templar/web-search  Exa-backed search and contents
```

The current evaluated default uses MiniMax M3 for tool-driven research and GLM 5.2 only for
forced finalization. Both run through OpenRouter. DeepSeek V4 Flash authors the evaluation protocol
and performs the blinded hard-requirement audit. Exa supplies Search and Contents; the production
agent never delegates its run to Exa Agent.

The web application has a public landing page and an admin-only dashboard for issuing and revoking
app-local credentials. `POST /api/v1/runs` accepts a buying brief under the `runs:create`
permission and runs the evaluated product agent synchronously. Public accounts, payments, durable
run history, and continuation endpoints remain deferred.

Hermes integration is maintained in the homelab repository at
`agents/skills/shopping/your-shopper`. The shared skill calls the production API through a profile
credential; the credential itself remains in each Hermes profile's runtime `.env`.

See [plan.md](./plan.md) for the architecture, [eval/README.md](./eval/README.md) for commands, and
[eval/RESULTS.md](./eval/RESULTS.md) for the recorded development signal.
