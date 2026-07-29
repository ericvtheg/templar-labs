# `@templar/llm`

Provider-backed LLM integration for one model turn at a time. It supports text, structured output,
serialized tool definitions and calls, exact benchmark model IDs, model-native controls, and
usage/cost normalization. It never executes tools or owns an agent run.

OpenRouter is the default provider. `generateText` and `generateObject` are conveniences built on
the same `generateTurn` primitive used by `@templar/agent`.

Evaluation harnesses can pin an exact provider model ID and every quality-affecting control:

```ts
llm.generateTurn({
  model: "openai/gpt-5.6-sol",
  reasoning: { effort: "high" },
  temperature: 0.1,
  parallelToolCalls: true,
  providerOptions: { seed: 7 },
  messages,
  tools,
});
```

Exact IDs bypass Templar tier routing. Results expose the resolved model, provider, usage/cost,
raw response, and opaque assistant provider state. The OpenRouter driver preserves reasoning
details verbatim so `@templar/agent` can replay them across tool turns.

The package exports `exactModels` for reproducible eval choices while continuing to accept any
provider model ID without client-side allowlisting:

```ts
import { exactModels } from "@templar/llm";

llm.generateTurn({ model: exactModels.qwen36Flash, messages });
```
