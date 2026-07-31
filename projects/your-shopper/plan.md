# Your Shopper Implementation Plan

## Status

This document records the agreed product and implementation direction as of
2026-07-31. It is intended to be sufficient context for beginning implementation
in a fresh agent context without re-deriving the architecture.

The product is named **Your Shopper**.

Architecture amendment agreed on 2026-07-29: the provider integration is named
`@templar/llm`, reusable policy-free model/tool execution lives in
`@templar/agent`, and the shopping behavior remains in `your-shopper-agent`.

Implementation update: the local agent stack, Exa-backed retrieval package,
tool-capable LLM layer, exact-model controls, resumable paid evaluation harness,
and development matrix are implemented. The current product default uses MiniMax M3 for research
and GPT-5.6 Luna for forced finalization through OpenRouter. A local subscription-backed GPT-5.6
Sol model creates the frozen protocol and judges blinded outputs with per-hard-requirement audits.
Exa Agent is an expensive explicit opt-in baseline and is not part of routine development or the
product run.

The deployed web app now exposes the first thin product surface: a public
landing page, admin-only API-key management, and synchronous authenticated
shopping runs. See `eval/RESULTS.md` for the current empirical signal rather
than treating the model pairing or prompt as permanent.

The immediate goal is not to build a production-complete procurement API. The
goal is to build and benchmark the strongest shopping research agent harness we
can: we choose the model, own the complete agent run, give it excellent search
and category-specific tools, and measure whether the resulting decisions create
material purchasing value.

## Product Thesis

Your Shopper accepts nearly arbitrary purchasing intent and spends a controlled
amount of model and tool budget to find a materially better decision than a
general-purpose agent would find.

The value may take several forms:

- a lower total price for the same or equivalent option
- a better-fitting product or service at a similar price
- a meaningfully higher-quality option worth its price premium
- an option, supplier, redemption, or purchasing strategy that other agents miss
- avoidance of an incompatible, unavailable, misleading, or otherwise poor
  purchase

The economic intuition is that spending cents or dollars on AI research can be
highly rational when it saves 10–15% on a meaningful purchase or materially
improves what the buyer receives.

A useful long-term north-star metric is:

```text
value leverage = estimated or realized purchasing uplift / AI research cost
```

This does not require every improvement to be converted into dollars. Price
savings, user preference, quality improvement, risk avoidance, and unique
discovery should remain separately visible until a defensible way to combine
them exists.

## Foundational Decisions

### We Own The Agent Run

The agent run is the product and the prospective moat.

Your Shopper owns:

- the selected model and its native capabilities
- the system instructions and harness
- the model/tool loop
- the tool registry
- conversation and working context
- research budget enforcement
- tool execution and parallelism
- retries and recoverable tool failures
- the decision to ask the user for more information
- the decision to continue or stop searching
- evidence handling and final synthesis
- the complete run trace

Exa is a search and content-retrieval provider. The production Your Shopper
agent must not delegate its run to the Exa Agent API. Exa Agent may be called by
the evaluation harness only as an explicit, cost-gated external baseline after
cheaper comparisons show useful signal.

### The Model Owns Request-Specific Reasoning

The model should decide, for each request:

- what “best” means
- which constraints are hard versus negotiable
- which value dimensions matter
- what missing information is worth asking for
- which tools and sources are useful
- how to compare heterogeneous options
- which claims require verification
- whether another search is likely to improve the decision
- when the result is good enough to return

Do not encode this intelligence as a large static category ontology, fixed
forms, or category-specific workflow graph. The model may construct an
ephemeral decision frame during a run, but that frame is generated from the
specific user intent rather than loaded from a rigid taxonomy.

### Category Specialization Primarily Means Integrations

Category-specific value should initially come from better capabilities and
data, not hardcoded reasoning.

For example, a points-redemption travel integration could expose:

- live award inventory
- cash fares
- airline schedules and fare classes
- transfer partners and ratios
- current transfer bonuses
- the user's points balances
- taxes and carrier surcharges
- change and cancellation rules
- positioning-flight alternatives
- hotel award inventory

The model decides which of those facts matter and how to evaluate them for the
specific trip. It might decide that nominal cents per point is less important
than direct routing, cancellation flexibility, an expiring balance, or avoiding
an irreversible transfer.

Future category integrations should use the same general tool contract. Only
extract an integration into a shared package after an actual reuse case exists.

### Optimize For The Best Model, Not Lowest-Common-Denominator Portability

The model and harness are one benchmarked configuration. The harness should use
the strongest native capabilities of the best-performing model, including its
tool-call format, reasoning controls, parallel tool calls, structured output,
and streaming behavior.

The shared LLM package may normalize common concepts, but it must retain an
escape hatch for model/provider-specific features. Portability is secondary to
measured shopping performance.

Model choice must be empirical. Every evaluation run records the exact model,
reasoning configuration, harness version, available tools, and budgets. The
winning configuration becomes the product default until a later benchmark
displaces it.

### Prefer Learning Over Production Architecture

The first implementation should be locally runnable and evaluation-first.

Defer until the harness demonstrates value:

- durable public run storage
- queue or Workflow orchestration
- API lifecycle hardening
- concurrency control
- idempotency and iteration locking
- retention and audit policy
- billing and quotas
- stable backwards-compatible public schemas
- a broad cross-product policy framework beyond the deliberately narrow
  `@templar/agent` execution package

Breaking changes are acceptable during this phase.

## Existing Repository Baseline

The repository already contains:

- `projects/your-shopper`, a deployed TanStack Start/Cloudflare application
- Google sign-in through the shared Templar auth service
- app-local API key creation and revocation
- an admin-gated API-key dashboard and protected `POST /api/v1/runs` endpoint
- a D1 database with users and API-auth migrations
- `@templar/llm`, an Effect-based OpenRouter abstraction supporting text and
  Zod-backed structured generation
- `@templar/db`, `@templar/queue`, and deployment primitives that can be used
  later if durable runs become necessary

These were the important limitations at plan creation and are now addressed by
the implementation described above:

- tool definitions, assistant calls, and tool-result messages are represented
  by `@templar/llm`
- arbitrary exact provider model identifiers are first-class inputs and common
  eval choices are exported as constants
- the product-specific shopper behavior is locally runnable outside the web app
- the web app now calls the product agent through a thin synchronous route

The authentication UI and HTTP route do not dictate the core agent design. The
agent and evaluation runner continue to work locally without the web
application.

## Target Dependency Structure

```text
projects/your-shopper
├── packages/agent                 # Product-specific moat
│   ├── @templar/agent
│   └── @templar/web-search
├── eval                           # App-owned evaluation laboratory
└── apps/web                       # Thin UI/API adapter
    ├── your-shopper-agent
    ├── @templar/api-auth
    └── @templar/users

packages/web-search
└── Exa search/content provider

packages/agent
└── @templar/llm                   # Provider-neutral model/tool runtime

packages/llm
└── OpenRouter model provider
```

There are three foundational changes:

1. Create `@templar/web-search`.
2. Rename the provider integration package to `@templar/llm` and add native
   tool-call turns.
3. Create a deliberately narrow `@templar/agent` package for reusable model/tool
   execution mechanics.

The Your Shopper agent remains product-specific at
`projects/your-shopper/packages/agent`. Shopping instructions, enabled tools,
default budgets, clarification semantics, and outcome mapping must not move into
`@templar/agent`.

## Package: `@templar/web-search`

### Purpose

`@templar/web-search` is an Effect-based wrapper around Exa's search and content
retrieval APIs. It supplies web evidence to agents; it does not run an agent.

The name is intentionally `web-search`, not `agent-search`. This makes the
ownership boundary clear: Your Shopper owns agent runs, while this package owns
provider-backed web retrieval.

### Location And Shape

```text
packages/web-search
├── package.json
├── tsconfig.json
├── src
│   ├── driver.ts
│   ├── drivers/exa.ts
│   ├── errors.ts
│   ├── index.ts
│   ├── logging.ts
│   ├── service.ts
│   └── types.ts
└── test
    ├── exa.test.ts
    └── service.test.ts
```

Follow the existing provider-backed package conventions used by `@templar/llm`,
`@templar/email`, and similar packages:

- `service.ts` defines the public service, Effect tag, constructor, and layer
- `driver.ts` defines the narrow provider contract
- `drivers/exa.ts` contains all Exa-specific translation
- `types.ts` contains normalized public types
- `errors.ts` contains tagged validation/provider/rate-limit errors
- `logging.ts` adds package, provider, operation, request, duration, and cost
  annotations where available
- `index.ts` exports the intentionally small public surface

### V1 Operations

The package should expose only retrieval primitives:

- `search`
- `getContents`

Do not expose Exa Agent run creation, continuation, polling, cancellation, or
events through this package.

### Dynamic Responses

Exa can return conventional search results, extracted page contents, grounding,
and caller-defined structured output. The wrapper must not force all requests
into a universal commerce or search entity schema.

The public API should support both raw/unstructured and caller-schema-driven
responses. A target shape is:

```ts
export type WebSearchService = {
  readonly search: <S extends z.ZodType | undefined = undefined>(
    input: WebSearchInput<S>,
  ) => Effect.Effect<WebSearchResult<OutputFor<S>>, WebSearchError>;

  readonly getContents: (
    input: GetWebContentsInput,
  ) => Effect.Effect<GetWebContentsResult, WebSearchError>;
};
```

The exact generic design may change during implementation, but it must preserve
these properties:

- callers optionally provide a Zod schema
- structured provider output is parsed and validated when a schema is present
- dynamic output remains `unknown` when no schema is present
- ordinary search results and content metadata remain accessible
- grounding/citations remain accessible
- provider request ID and cost remain accessible
- the original provider payload can be retained as `raw`

The package must not define product, provider, price, constraint-match, or
recommendation types. Those interpretations belong to the calling agent.

### Exa Driver

Use the official Exa TypeScript client if it is compatible with the Cloudflare
runtime and supports the needed API surface cleanly. Keep it isolated behind the
driver so direct HTTP can replace it without changing callers if SDK behavior or
Workers compatibility becomes a problem.

The driver should support dependency injection suitable for tests. Avoid live
network calls in normal unit tests.

Production agent tools should begin with Exa's retrieval-oriented search modes
and content fetching. Exa's deeper agentic modes may be exercised in evaluation,
but they must not silently replace the Your Shopper model/tool loop.

### Search Inputs

Support the useful provider-neutral subset first:

- query
- requested result count
- include/exclude domains
- publication date bounds
- user country/location hint
- search mode where appropriate
- content options such as highlights or full text
- optional output schema
- optional provider-specific options escape hatch

Do not expose every Exa option before a real use case needs it.

### Search Outputs

Preserve enough source information for the agent and evaluator:

- URL
- title
- author when available
- published date when available
- extracted text/highlights when requested
- structured output when requested
- field grounding/citations
- provider request ID
- provider-reported cost
- raw response

### Failure Behavior

Search is core product behavior, so errors must not be swallowed.

Normalize at least:

- validation errors
- authentication/provider errors
- rate limits
- structured-output parsing failures
- malformed provider responses

Effect interruption should propagate to the underlying request.

### Package Tests

Tests belong in `packages/web-search/test` and should cover:

- request translation
- domain/date/location/content options
- raw response preservation
- schema-driven dynamic output parsing
- malformed structured output
- provider HTTP errors
- rate-limit mapping
- request IDs and cost normalization
- abort/interruption propagation
- logging annotations where practical

## Extension: `@templar/llm` Tool-Call Support

### Purpose

`@templar/llm` should provide a model-turn primitive rich enough for Your Shopper
to own the agent loop. It should not execute tools or decide how long an agent
runs.

### Required Message Model

Replace or extend the current string-only message type with a discriminated
message/content model that can represent:

- system messages
- user messages
- assistant text
- assistant tool calls
- tool results tied to a tool-call ID

A conceptual target is:

```ts
type LLMMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | {
      role: "assistant";
      content?: string;
      toolCalls?: ReadonlyArray<LLMToolCall>;
    }
  | {
      role: "tool";
      toolCallId: string;
      name: string;
      content: string;
    };
```

Exact types should follow the chosen model/provider's requirements closely
rather than prematurely generalizing every possible content block.

### Tool Definitions

Tool definitions require:

- stable name
- useful model-facing description
- JSON Schema input

Your Shopper will generally construct these definitions from Zod-backed tool
implementations, but `@templar/llm` only needs the serialized model-facing form.

### Model-Turn Primitive

Add a primitive such as `generateTurn`:

```ts
llm.generateTurn({
  model,
  messages,
  tools,
  reasoning,
  maxTokens,
  providerOptions,
});
```

The result must expose:

- assistant text, if any
- zero or more tool calls
- model/provider identifiers
- finish/stop reason
- token usage and cost when available
- raw provider response

`generateText` and `generateObject` may remain as conveniences, ideally built
on the same lower-level turn implementation once doing so is clean.

### Model Selection

Evaluation needs to compare explicit models, not only fixed tier aliases.

Support either:

- a Templar model tier, or
- an explicit provider model identifier

The Your Shopper agent configuration must record the resolved exact model. Do
not allow provider auto-routing in a benchmark run unless auto-routing itself is
the configuration being tested.

### Model-Native Controls

Expose the capabilities that affect agent quality:

- reasoning effort/configuration
- tool choice behavior
- parallel tool calls if supported
- structured final-response format if supported
- streaming if needed
- provider-specific options

Do not reduce these to a generic temperature-only interface.

OpenRouter is the repository's current model transport and is the sensible
first implementation target. It is not a permanent architectural constraint.
If the best benchmarked model exposes materially better tool use, reasoning,
streaming, or state through its first-party API, add a direct driver and design
the shipped harness around that path.

### Non-Responsibilities

`@templar/llm` must not own:

- tool execution
- agent run IDs
- run persistence
- max tool turns
- research budgets
- search strategy
- user clarification policy
- final shopping semantics

### LLM Package Tests

Extend `packages/llm/test` to cover:

- tool definition serialization
- one and multiple assistant tool calls
- tool-result message serialization
- assistant final-text turns
- reasoning/provider options
- explicit model identifiers
- usage/cost preservation
- malformed tool arguments remaining available for harness validation
- backwards compatibility for existing text/structured calls where retained

## Package: `@templar/agent`

### Purpose

`@templar/agent` owns the reusable execution mechanics between an LLM and a
registry of locally implemented tools. It depends on `@templar/llm`, but remains
independent of Exa, shopping, and any category ontology.

It owns:

- Zod-backed tool registration and model-facing JSON Schema conversion
- validation of model-produced tool arguments before local execution
- bounded parallel tool execution
- recoverable tool observations and bounded retries
- model-turn, tool-call, duration, soft-cost, and hard-cost limits
- suspension and continuation through tools
- ordered run events, usage accumulation, and complete local traces
- Effect interruption propagation

It does not own:

- product instructions or value judgments
- which tools a product enables
- provider integrations
- shopper citation or recommendation semantics
- persistence, queues, billing, or public API schemas

This boundary is intentionally smaller than a universal agent framework. The
package exposes the recurring run-loop mechanism while Your Shopper continues
to own the behavior being benchmarked.

### Agent Package Tests

Tests belong in `packages/agent/test` and use fake LLMs and tools. They cover
parallel execution, validation recovery, recoverable and fatal tool failures,
bounded retry, clarification suspension and continuation, budgets and hard
limits, cancellation, cost accumulation, event ordering, and exact effective
configuration snapshots.

## Project Package: Your Shopper Agent

### Location

```text
projects/your-shopper/packages/agent
├── package.json
├── tsconfig.json
├── src
│   ├── agent.ts
│   ├── config.ts
│   ├── index.ts
│   ├── instructions.ts
│   ├── types.ts
│   └── tools
│       ├── ask-user.ts
│       ├── get-web-contents.ts
│       ├── index.ts
│       └── web-search.ts
└── test
    ├── agent.test.ts
    └── tools.test.ts
```

The proposed package name is `your-shopper-agent`. It is private and
product-specific.

### Core Principle

The product composition is deliberately small. It configures `@templar/agent`
to enable the frontier model to reason and use tools rather than decomposing the
task into a fixed pipeline of intent interpreter, planner, ranker, and response
generator.

The basic loop is:

```text
create or continue run
  -> compose model context
  -> request one model turn
  -> if tool calls:
       validate calls
       execute tools, in bounded parallel where possible
       append tool results
       update cost/budget/trace
       repeat
  -> if the model asks the user a question:
       return waiting-for-input outcome
  -> if the model returns a final answer:
       return completed outcome
  -> if a hard harness budget is reached:
       ask the model for the best-supported answer possible, then stop
```

The model chooses the search and evaluation behavior. The harness supplies
capabilities, reliable execution, limits, and observability.

### Run Configuration

A run must snapshot its effective configuration. A conceptual configuration is:

```ts
type ShopperAgentConfig = {
  readonly model: string;
  readonly reasoning?: unknown;
  readonly instructionsVersion: string;
  readonly maxModelTurns: number;
  readonly maxToolCalls: number;
  readonly maxDurationMs?: number;
  readonly softCostLimitUsd?: number;
  readonly tools: ReadonlyArray<ShopperTool>;
  readonly providerOptions?: Readonly<Record<string, unknown>>;
};
```

Exact budget enforcement will be imperfect because some provider cost is only
known after calls complete. V1 should combine:

- model-turn limit
- tool-call limit
- optional wall-clock limit
- provider-reported accumulated cost
- prompt instruction describing the research budget

The model decides how to spend the allowed budget; the harness enforces hard
ceilings.

### Tool Contract

All tools, including future category integrations, implement the shared narrow
`@templar/agent` contract while remaining app-owned implementations:

```ts
type AgentTool<S extends z.ZodType = z.ZodType> = {
  readonly name: string;
  readonly description: string;
  readonly schema: S;
  readonly execute: (
    input: z.output<S>,
    context: AgentToolContext,
  ) => Effect.Effect<AgentToolOutput, AgentToolError>;
};
```

Requirements:

- validate every model-produced argument before execution
- serialize tool results into JSON-safe model context
- preserve a richer raw result in the trace when useful
- give the model a concise, accurate tool description
- emit start/completion/failure events
- report duration and provider cost when available
- allow cancellation through Effect interruption

Do not invent category-specific tool interfaces outside this registry.

### Initial Tools

V1 should start with:

- `web_search`, backed by `@templar/web-search.search`
- `get_web_contents`, backed by `@templar/web-search.getContents`

A deterministic calculator/code capability and category integrations can follow
after the basic loop is benchmarkable. Points-redemption travel is a strong
first integration candidate, but it should not block the generic harness.

### Instructions

The initial system instructions should express the product objective and
behavioral principles, not an exhaustive workflow.

They should tell the model to:

- seek the best available fit for the specific user
- infer a request-specific definition of value
- distinguish hard requirements from preferences
- ask only when an answer can materially change the research or decision
- search broadly or precisely as the request warrants
- explore alternative acquisition strategies when useful
- verify material claims
- expose uncertainty and unavailable facts
- continue while another search has meaningful expected value
- stop when marginal value becomes low relative to the remaining budget
- return a recommendation another agent or user can act on

Avoid prescribing fixed search branches or a universal candidate-scoring
formula.

Version the instructions explicitly. Every evaluation artifact must identify
the instructions version or content hash.

### Run State And Outcomes

The harness owns run identity even before durable persistence exists.

Minimal run statuses:

- `running`
- `waiting_for_input`
- `completed`
- `failed`
- `cancelled`

Use one run for one purchasing intent, including clarification turns.

Keep the stable external outcome envelope thin because recommendations are
dynamic:

```ts
type ShopperOutcome =
  | {
      readonly kind: "question";
      readonly text: string;
      readonly data?: unknown;
    }
  | {
      readonly kind: "answer";
      readonly text: string;
      readonly data?: unknown;
      readonly citations: ReadonlyArray<ShopperCitation>;
    };
```

The answer text, optional structured data, decision frame, candidate
representation, and comparison may vary by request. Do not prematurely require
all products, services, redemptions, and purchasing strategies to fit one large
static schema.

### Run Events And Trace

Benchmarking requires complete, inspectable traces. Events should be append-only
and ordered within a run.

Initial event types:

- `run.started`
- `model.turn.started`
- `model.turn.completed`
- `tool.call.started`
- `tool.call.completed`
- `tool.call.failed`
- `run.waiting_for_input`
- `run.completed`
- `run.failed`
- `run.cancelled`

Each relevant event should include:

- run ID
- monotonic sequence number
- timestamp
- model and harness configuration where relevant
- tool name and call ID where relevant
- duration
- usage/cost
- error classification where relevant
- payload or reference to a stored payload

Local evaluation traces should retain enough raw data to reproduce and diagnose
behavior:

- full input and conversation
- effective system instructions
- every model request/response
- every tool request/result
- resolved model identifier
- token usage
- search-provider cost
- total duration
- final output
- failure or stop reason

Production retention and redaction are intentionally deferred. Never log API
keys or authorization headers.

### Context Management

Begin by replaying the complete conversation and tool history within the model's
context window. Record context size and failures.

Do not build summarization, compaction, retrieval memory, or external working
memory until evaluation traces show that context limits or distraction are a
real bottleneck. When added, context management becomes part of the benchmarked
harness configuration.

### Failure Handling

V1 behavior:

- invalid tool arguments return a structured tool error to the model so it can
  retry
- recoverable search/provider failures return a structured observation to the
  model
- rate limits may use a small bounded retry policy
- unrecoverable model failures fail the run
- hitting a soft budget asks the model to synthesize the best supported result
- hitting an absolute hard limit terminates with a clear stop reason

Keep retry policy visible in the trace and bounded to prevent hidden runaway
cost.

### Agent Package Tests

All tests belong in the package's `test` directory. Use fake LLM and tool
services; normal tests must not spend model or Exa credits.

Cover:

- a final answer without tool use
- one search call followed by an answer
- multiple sequential tool calls
- parallel tool calls
- invalid tool arguments and model recovery
- recoverable and unrecoverable tool failures
- model failure
- user clarification outcome and continuation
- model-turn limit
- tool-call limit
- cost and duration accumulation
- soft-budget synthesis
- hard-budget termination
- cancellation/interruption
- ordered event emission
- exact run configuration snapshotting

## Evaluation Laboratory

### Purpose

Evaluation is a first-class product-development loop, not a test suite added
after implementation. It determines:

- which model to ship
- which system instructions to ship
- which tools create value
- how much search budget is worthwhile
- where the agent fails
- which category integration should be built next

Keep evaluation app-owned at `projects/your-shopper/eval` initially. Do not
create a foundational `@templar/evals` package until another project has the
same needs.

### Suggested Layout

```text
projects/your-shopper/eval
├── README.md
├── cases
│   ├── development
│   └── holdout
├── strategies
│   ├── exa-agent-baseline.ts
│   ├── generic-agent-baseline.ts
│   └── your-shopper.ts
├── artifacts                 # gitignored generated runs
├── compare.ts
├── evaluator.ts
├── pool.ts
├── report.ts
├── run.ts
└── types.ts
```

Add project-level scripts for targeted and full evaluation runs. Keep expensive
live evaluations out of normal `pnpm test` and CI.

### What A Strategy Means

A benchmark strategy is a fully specified model-and-harness configuration, not
just a model name:

```ts
type EvaluationStrategy = {
  readonly id: string;
  readonly model: string;
  readonly reasoning?: unknown;
  readonly instructionsVersion: string;
  readonly tools: ReadonlyArray<string>;
  readonly maxModelTurns: number;
  readonly maxToolCalls: number;
  readonly softCostLimitUsd?: number;
  readonly runner: EvaluationStrategyRunner;
};
```

Never compare unnamed “general agent” behavior with an undocumented shopper
configuration. Store the complete effective setup in every artifact.

### Initial Baselines

Run at least:

1. **Exa Agent baseline**: Exa's own agentic research product, called only from
   the evaluation strategy.
2. **Generic owned-harness baseline**: the selected frontier model with the same
   tools and budget but minimal generic research instructions.
3. **Your Shopper**: the same or best-performing model with shopper-specific
   instructions and harness configuration.

The generic owned-harness baseline isolates the value of shopper specialization.
The Exa Agent baseline tests whether owning the run beats buying the capability.

Additional model candidates should use the same tools and comparable budgets
where possible. Because providers price and expose reasoning differently,
report quality/cost frontiers rather than pretending every run is perfectly
controlled.

### Evaluation Tracks

Use three related tracks so failures are diagnosable:

#### Clarification

Tests whether the agent:

- asks or researches at the right time
- asks about information that can change an available action
- selects the highest-value missing detail
- avoids duplicate or ceremonial questions
- progresses rather than interrogating the user

#### Research And Decision

Give all strategies the same complete user context and measure:

- discovery of strong options
- constraint compliance
- evidence support
- option diversity where useful
- tradeoff quality
- recommendation quality
- cost and latency

This separates search quality from clarification behavior.

#### End To End

Run realistic multi-turn missions from incomplete intent through final answer.
Use these for blinded user preference and overall product assessment after the
component tracks are useful.

### Dynamic Evaluation Protocol

Evaluation should also be request-specific and primarily model-authored.

For each case:

1. An independent evaluator model receives the user request and context.
2. Before seeing any strategy output, it creates a request-specific evaluation
   protocol.
3. Freeze that protocol in the run artifact.
4. Run all strategies.
5. Pool and deduplicate every candidate they discover.
6. Verify material facts with tools or direct sources.
7. Use an independent judge to apply the frozen protocol to blinded outputs and
   candidates.
8. Human-review a sample and all economically important or surprising wins.

The evaluated agent must not write or modify its own grading protocol after
seeing its result. The evaluator and judge may use models, but they are separate
roles with separate traces.

The evaluation protocol should identify, as appropriate:

- the likely user objective
- non-negotiable requirements
- request-specific value dimensions
- material facts that require evidence
- failure conditions
- what would constitute a dominant or meaningfully better option
- what cannot be known from available tools

### Best-Known Candidate Pool

It is impossible to prove that a live-web agent found the globally best option.
Use a pooled best-known approximation:

1. Union candidates from all strategy runs and repeated runs.
2. Normalize and deduplicate them.
3. Optionally add candidates found by careful human/category-expert research.
4. Verify availability, price, and decision-critical facts at a recorded time.
5. Rank or score the pool against the frozen request-specific protocol.

The best verified candidate in the pool becomes the temporary oracle. If a new
strategy later finds something better, the benchmark oracle improves. That is a
feature, not a defect.

### Core Metrics

Report metrics separately rather than collapsing everything into one score.

#### Reliability Gates

- hard-constraint violation rate
- valid direct-link rate
- support rate for critical claims
- availability/price verification status
- rate of unknown facts presented as known

An attractive answer with fabricated or unavailable options must not win.

#### Search And Decision Value

- **Frontier recall**: share of the pooled best price/fit tradeoffs discovered
- **Top-choice regret**: gap between the strategy recommendation and the pooled
  best-known option
- **Exclusive winner rate**: frequency with which a strategy uniquely discovers
  the ultimately preferred option
- **Dominance rate**: frequency with which a strategy finds an option that is
  cheaper and at least as good, or better and no more expensive, than the
  baseline recommendation
- **User-choice win rate**: frequency with which blinded users prefer the
  strategy's recommendation
- **Search yield**: improvement in best-found value per additional dollar or
  tool/model turn
- **Run variance**: stability across repeated runs of the same configuration

#### Economic Value

Keep three levels separate:

- **discovered value**: the answer claims a saving or improvement
- **verified value**: current source/tool evidence supports the option and value
- **realized value**: a user actually purchases or redeems it and experiences
  the outcome

For equivalent products, compare total landed cost. For heterogeneous options,
use blinded user preference, request-specific evaluation, and—where useful—the
user's stated willingness to pay for the preferred option.

#### Operational Cost

- AI cost
- search/integration cost
- total run cost
- latency
- model turns
- tool calls
- pages/results inspected

Plot best-found value against accumulated research spend. This is the primary
way to learn whether more “scouring” is valuable and when the model should stop.

### Initial Cases

Begin with roughly 10–12 carefully authored development missions rather than a
large synthetic dataset. Add 8–12 holdout missions before extensive prompt
tuning.

Cover:

- expensive standardized goods, where price savings are measurable
- products with important compatibility or quality tradeoffs
- local, used, refurbished, or open-market goods
- fragmented services with quote-based pricing
- broad exploratory intent
- strict constraints
- missing but actionable information
- impossible or nearly impossible constraints
- alternative acquisition strategies

Seed ideas from the original directional spec include:

- a great espresso machine
- a dual-boiler espresso machine under a strict price and width
- a used sofa under a local budget
- a premium antique sofa
- an outdoor sauna for a Swedish summer house
- a wedding photographer around a target budget
- a wedding shuttle

Points-redemption travel should become an early integration-backed mission once
the generic agent loop is stable.

### Human Evaluation

For early development, manual blinded review is higher signal than an elaborate
automated judge stack.

When comparing outputs:

- remove strategy identity
- randomize presentation order
- lock user preferences before showing options
- normalize candidate cards enough to avoid formatting bias
- ask which option/output the user would act on
- ask why
- record willingness to pay where meaningful
- manually verify the winning option's material claims

Use model judges to scale request-specific criteria, not to replace all human
calibration. Periodically measure agreement between the judge and human review.

### Live-Web Variability

Initially, run competing strategies in the same time window and store all raw
artifacts. This is enough for fast learning.

Do not build a frozen web corpus immediately. Add a snapshot/frozen-corpus
regression track only when changing web results make it difficult to attribute
quality changes to the model or harness.

### Evaluation Artifacts

Each saved run should contain:

- case ID and complete case input
- hidden context revealed during simulation
- frozen evaluator protocol
- strategy configuration
- model and provider identifiers
- instructions version/hash
- available tool definitions
- full run trace
- candidates and citations
- usage, cost, and latency
- judge output and rationale
- human annotations if any
- artifact format version
- run timestamp

Generated artifacts may be large and should be gitignored by default. Curated
cases, evaluator prompts, schemas, and summary reports should be committed.

## Web Application And API

### Role

The deployed application should be a thin adapter over the product-specific
agent package. Do not put the run loop inside a TanStack route.

The web layer owns:

- user and API-key authentication
- request parsing
- run-store selection
- HTTP and streaming representation
- playground/dashboard UI

The agent package owns the actual run.

### API Direction

The first synchronous resource is implemented:

- `POST /api/v1/runs` — start a shopping run

Possible durable follow-on resources remain:

- `POST /api/v1/runs/:id/messages` — continue with user input
- `GET /api/v1/runs/:id` — retrieve current state/outcome
- `GET /api/v1/runs/:id/events` — stream or replay events
- `POST /api/v1/runs/:id/cancel` — cancel a run when supported

Exact schemas and paths remain intentionally unstable until local evaluation
establishes the run behavior.

The earlier `/api/v1/hello` route and `hello:read` permission have been replaced
by `POST /api/v1/runs` and `runs:create`.

### Persistence

Local evaluation should use an in-memory store plus filesystem artifacts.

When the deployed API needs durable runs, add a run-store interface to the agent
or app boundary and implement it with the existing D1 database. A likely minimal
model includes:

- runs
- conversation messages
- ordered run events
- final outcome and usage summary

Do not design migrations before the in-memory run representation stabilizes.

Queues or Cloudflare Workflows should only be introduced if observed run
duration, disconnections, retry behavior, or concurrency make them necessary.

### UI Direction

The existing API-key dashboard remains useful. Later additions may include:

- a simple shopping prompt playground
- live run-event display
- clarification input
- final answer and citations
- per-run cost and tool trace for development

UI polish is not part of the initial agent-quality milestone.

## Implementation Sequence

### Phase 0: Confirm The First Experimental Matrix

Before writing prompts around one model, record:

- initial frontier model candidates
- reasoning settings to compare
- Exa search modes available to the owned harness
- initial tool/model budget levels
- first development cases
- artifact location and environment-variable names

Do not delay implementation for a perfect matrix. One strong initial model and
one baseline are enough to exercise the system; expand once the runner works.

Exit condition:

- at least one documented Your Shopper strategy and one baseline configuration
- initial cases exist before shopper prompt tuning begins

### Phase 1: Build `@templar/web-search`

Tasks:

1. Scaffold `packages/web-search` following repository conventions.
2. Define normalized inputs/results and tagged errors.
3. Implement the Exa driver.
4. Support dynamic caller-provided schemas and raw output.
5. Add logging, request IDs, usage/cost, and interruption.
6. Add mocked unit tests.
7. Add a manual live smoke test mechanism that is excluded from normal CI.

Exit condition:

- the package can search and fetch contents from mocked Exa responses
- a manual authenticated search works
- no Exa Agent lifecycle appears in the public package API

### Phase 2: Extend `@templar/llm`

Tasks:

1. Add tool-call-capable message and response types.
2. Add tool definition serialization.
3. Add `generateTurn` to the service and driver.
4. Implement OpenRouter tool-call translation.
5. Support explicit model identifiers and model-native options.
6. Add a direct provider driver if the selected model's strongest capabilities
   are not available faithfully through OpenRouter.
7. Preserve current `generateText` and `generateObject` behavior or migrate their
   current consumers deliberately.
8. Add comprehensive mocked tests.

Exit condition:

- a mocked model can request multiple tools and receive tool-result messages
- a final assistant response can be distinguished from a tool-call turn
- exact model/configuration and usage are available to the caller

### Phase 3: Build `@templar/agent` And The Product-Specific Composition

Tasks:

1. Scaffold `packages/agent` for policy-free execution mechanics.
2. Define generic run configuration, event, trace, tool, suspension, and error
   types.
3. Implement the model/tool loop with bounded parallel execution.
4. Implement budget tracking, hard limits, continuation, and cancellation.
5. Scaffold `projects/your-shopper/packages/agent` as the product composition.
6. Implement the initial shopper instructions and `ask_user` control tool.
7. Add `web_search` and `get_web_contents` adapters.
8. Implement an in-memory run object suitable for local
   evaluation.
9. Add full fake-model/fake-tool tests at both ownership boundaries.

Exit condition:

- a local run can autonomously make several searches and return an answer
- every model and tool turn is traceable
- model and harness configuration are captured exactly
- clarification and continuation work without a database

### Phase 4: Build The Evaluation Loop

Tasks:

1. Define case, strategy, artifact, evaluator, and judgment formats.
2. Author the first cases before prompt iteration.
3. Implement the generic owned-harness baseline.
4. Implement the Your Shopper strategy.
5. Implement the Exa Agent baseline separately from production packages.
6. Add dynamic pre-output evaluator protocol generation.
7. Add candidate pooling and basic deduplication.
8. Produce a human-readable comparison report with cost/latency.
9. Run initial blinded manual reviews.

Exit condition:

- one command can run selected cases against selected strategies
- artifacts make every result inspectable
- reports show quality dimensions and cost, not only an aggregate score
- observed failures can be attributed to model, harness, retrieval, evidence, or
  evaluation behavior

### Phase 5: Select And Improve The Model/Harness

Use the benchmark to test:

- frontier models
- reasoning effort
- instruction variants
- search and tool budgets
- parallel versus sequential searching
- source-content depth
- whether a separate final verification turn improves results
- whether model-generated decision frames improve results

Only add machinery that improves measured outcomes. Prefer model capability and
better tools over fixed workflow stages.

Exit condition:

- a documented default configuration beats the strongest relevant baseline on
  decision value or the quality/cost frontier
- reliability gates do not regress
- repeated runs show acceptable variance

### Phase 6: Add The First Category Integration

Points-redemption travel is a strong candidate because:

- it has high economic leverage
- general web search cannot reliably expose live award inventory
- cash price, points price, fees, transfer ratios, and availability are
  independently measurable
- bad transfers and phantom availability are costly
- the integration adds facts while leaving evaluation to the model

Build it as one or more tools under the app-owned integration area first. Do not
extract a shared package until another consumer exists.

Exit condition:

- the integration is available through the generic tool registry
- the model chooses when to call it
- integration-backed cases show measurable value over web search alone

### Phase 7: Expose The Agent Through The App

Tasks:

1. Add run-oriented API-key permissions.
2. Add the initial run endpoints.
3. Add a durable store only as required by deployment behavior.
4. Add streaming/event replay if useful.
5. Add a minimal playground to the existing dashboard.
6. Preserve complete benchmark-compatible traces in development.

Exit condition:

- an authenticated caller can start and continue a run
- the server uses the same agent package and configuration as local evaluation
- deployed behavior is represented by a benchmark strategy configuration

## Verification And Repository Rules

For every implementation phase:

- put tests in the owning workspace's `test` directory
- run targeted package tests while iterating
- run package typecheck/check before handoff
- run the appropriate root checks before completing broad cross-package changes
- keep live paid evaluations out of default CI
- work directly on `main`
- preserve unrelated user changes
- commit completed changes and push directly to `origin/main`

The repository had an unrelated untracked `.codex-breli-staging/` directory when
this plan was written. Do not modify, delete, or commit it as part of Your
Shopper work unless explicitly requested.

## Explicit Non-Goals For The First Milestone

- checkout or booking
- guaranteed price or inventory
- seller/provider messaging
- a marketplace
- a universal product/service schema
- a fixed taxonomy for every shopping category
- category-specific scoring code
- a policy-heavy universal agent framework
- long-term memory
- multi-agent orchestration
- a production SLA
- public API stability
- billing users for research
- perfect search completeness
- automatic claims that an option is globally optimal

The agent should aim for the best possible fit while truthfully describing the
best result it found and the evidence/uncertainty around it.

## Decisions To Make Empirically

Do not settle these by architecture preference alone:

- best model and reasoning configuration
- best shopper instructions
- maximum useful model/tool budget
- how much parallel search helps
- which Exa search modes produce the best evidence for the owned harness
- whether structured Exa output is useful versus raw results plus model
  interpretation
- whether a separate verification turn is worth its cost
- whether an explicit model-generated decision frame improves decisions
- when full page contents are worth retrieving
- when context compaction becomes necessary
- which first category integration produces the greatest marginal value
- when frozen-corpus evaluation becomes worth maintaining
- when durable execution infrastructure becomes necessary

## First Fresh-Context Checklist

At the beginning of implementation after the context reset:

1. Read this entire file and the repository `AGENTS.md`.
2. Inspect `git status` and preserve unrelated changes, especially the existing
   `.codex-breli-staging/` directory.
3. Inspect the latest `@templar/llm` implementation and tests in case they changed
   after this plan.
4. Verify the current official Exa TypeScript SDK/API surface and Cloudflare
   compatibility before adding a dependency.
5. Create the first small development evaluation cases before tuning the
   shopper instructions.
6. Implement Phase 1 (`@templar/web-search`) first.
7. Continue phase-by-phase, testing and committing completed work directly to
   `main` as required by the repository instructions.

## Final Architectural Summary

```text
                         ┌──────────────────────────┐
                         │   Evaluation Laboratory │
                         │ models + harnesses + ROI │
                         └────────────┬─────────────┘
                                      │ selects
                                      ▼
┌──────────────┐          ┌──────────────────────────┐
│ Your Shopper │ requests │ Product-Specific Agent   │
│ API / UI     ├─────────►│ model + owned run loop   │
└──────────────┘          └────────────┬─────────────┘
                                      │ model chooses tools
                      ┌───────────────┼────────────────┐
                      ▼               ▼                ▼
              ┌──────────────┐ ┌────────────┐ ┌──────────────────┐
              │ Web Search   │ │ Calculator │ │ Category Tools   │
              │ Exa-backed   │ │ / Code     │ │ e.g. award travel│
              └──────────────┘ └────────────┘ └──────────────────┘
```

The essential boundary is:

> The model decides how to shop. Your Shopper owns and benchmarks the run.
> Integrations make better facts and actions available.
