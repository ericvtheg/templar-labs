import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  GenerateObjectInput,
  GenerateObjectResult,
  GenerateTextInput,
  GenerateTurnInput,
  GenerateTurnResult,
  LLMError,
  LLMService,
} from "@templar/llm";
import { LLMProviderError, LLMRateLimitError } from "@templar/llm";
import { Effect, Fiber } from "effect";
import { z } from "zod";
import { AgentToolError } from "../src/errors.ts";
import type { AgentConfig, AgentEvent } from "../src/index.ts";
import { makeAgent } from "../src/run.ts";
import { type AgentTool, suspendAgent, toolResult } from "../src/tool.ts";

test("returns a final answer without executing tools", async () => {
  const { llm, requests } = scriptedLLM([succeedingTurn({ text: "Buy the first option." })]);
  const run = await Effect.runPromise(
    makeAgent(baseConfig(llm)).start({
      messages: [{ role: "user", content: "Find a machine" }],
      runId: "run-final",
    }),
  );

  assert.equal(run.status, "completed");
  assert.deepEqual(run.outcome, { kind: "answer", text: "Buy the first option." });
  assert.equal(run.id, "run-final");
  assert.deepEqual(requests[0]?.messages, [
    { role: "system", content: "Be useful." },
    { role: "user", content: "Find a machine" },
  ]);
  assert.equal(run.config.model, "openai/gpt-5.6-sol");
  assert.equal(run.trace.modelTurns.length, 1);
  assert.deepEqual(
    run.events.map((event) => event.type),
    ["run.started", "model.turn.started", "model.turn.completed", "run.completed"],
  );
});

test("executes a tool and sends its result to the next model turn", async () => {
  const { llm, requests } = scriptedLLM([
    succeedingTurn({
      toolCalls: [call("search-1", "search", { query: "machine" })],
      assistantProviderData: {
        reasoning_details: [{ type: "reasoning.encrypted", data: "opaque", index: 0 }],
      },
    }),
    succeedingTurn({ text: "Answer with evidence." }),
  ]);
  const search = successTool("search", z.object({ query: z.string() }), ({ query }) => ({
    results: [{ title: query }],
  }));
  const run = await Effect.runPromise(
    makeAgent(baseConfig(llm, [search])).start({
      messages: [{ role: "user", content: "Research" }],
    }),
  );

  assert.equal(run.status, "completed");
  assert.equal(run.usage.toolCalls, 1);
  assert.equal(requests.length, 2);
  assert.deepEqual(requests[1]?.messages.at(-2), {
    role: "assistant",
    toolCalls: [call("search-1", "search", { query: "machine" })],
    providerData: {
      reasoning_details: [{ type: "reasoning.encrypted", data: "opaque", index: 0 }],
    },
  });
  assert.deepEqual(requests[1]?.messages.at(-1), {
    role: "tool",
    toolCallId: "search-1",
    name: "search",
    content: '{"results":[{"title":"machine"}]}',
  });
});

test("executes independent tool calls in parallel while preserving result order", async () => {
  let active = 0;
  let maximumActive = 0;
  const tool = asyncTool("lookup", async ({ id }) => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    await new Promise((resolve) => setTimeout(resolve, id === 1 ? 8 : 2));
    active -= 1;
    return { id };
  });
  const { llm, requests } = scriptedLLM([
    succeedingTurn({
      toolCalls: [call("one", "lookup", { id: 1 }), call("two", "lookup", { id: 2 })],
    }),
    succeedingTurn({ text: "Done" }),
  ]);
  const run = await Effect.runPromise(
    makeAgent(baseConfig(llm, [tool])).start({ messages: [{ role: "user", content: "Both" }] }),
  );

  assert.equal(run.status, "completed");
  assert.equal(maximumActive, 2);
  const toolMessages = requests[1]?.messages.filter((message) => message.role === "tool");
  assert.deepEqual(
    toolMessages?.map((message) => message.toolCallId),
    ["one", "two"],
  );
});

test("bounds parallel tool execution with the configured local ceiling", async () => {
  let active = 0;
  let maximumActive = 0;
  const tool = asyncTool("lookup", async ({ id }) => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    await new Promise((resolve) => setTimeout(resolve, 2));
    active -= 1;
    return { id };
  });
  const { llm } = scriptedLLM([
    succeedingTurn({
      toolCalls: [call("one", "lookup", { id: 1 }), call("two", "lookup", { id: 2 })],
    }),
    succeedingTurn({ text: "Done" }),
  ]);
  const run = await Effect.runPromise(
    makeAgent({ ...baseConfig(llm, [tool]), maxConcurrentTools: 1 }).start({
      messages: [{ role: "user", content: "Both" }],
    }),
  );

  assert.equal(run.status, "completed");
  assert.equal(maximumActive, 1);
  assert.equal(run.config.maxConcurrentTools, 1);
});

test("returns invalid model-produced arguments to the model for recovery", async () => {
  let executions = 0;
  const tool = successTool("search", z.object({ query: z.string() }), () => {
    executions += 1;
    return {};
  });
  const { llm, requests } = scriptedLLM([
    succeedingTurn({ toolCalls: [{ id: "bad", name: "search", arguments: "{" }] }),
    succeedingTurn({ text: "Recovered" }),
  ]);
  const run = await Effect.runPromise(
    makeAgent(baseConfig(llm, [tool])).start({ messages: [{ role: "user", content: "Search" }] }),
  );

  assert.equal(run.status, "completed");
  assert.equal(executions, 0);
  const observation = requests[1]?.messages.at(-1);
  assert.equal(observation?.role, "tool");
  if (observation?.role === "tool") {
    assert.equal(JSON.parse(observation.content).error.code, "invalid_arguments");
  }
  assert.equal(
    run.events.some((event) => event.type === "tool.call.failed"),
    true,
  );
});

test("recoverable tool failures are observations and retryable failures are bounded", async () => {
  let attempts = 0;
  const retrying: AgentTool = {
    name: "retrying",
    description: "Retries once",
    schema: z.object({}),
    execute: () => {
      attempts += 1;
      return attempts === 1
        ? Effect.fail(
            new AgentToolError({
              tool: "retrying",
              code: "temporary",
              message: "Temporary",
              recoverable: true,
              retryable: true,
            }),
          )
        : Effect.succeed(toolResult({ ok: true }));
    },
  };
  const { llm } = scriptedLLM([
    succeedingTurn({ toolCalls: [call("retry", "retrying", {})] }),
    succeedingTurn({ text: "Recovered" }),
  ]);
  const run = await Effect.runPromise(
    makeAgent({ ...baseConfig(llm, [retrying]), maxToolRetries: 1 }).start({
      messages: [{ role: "user", content: "Retry" }],
    }),
  );

  assert.equal(run.status, "completed");
  assert.equal(attempts, 2);
  assert.equal(run.trace.toolCalls[0]?.attempts, 2);
});

test("unrecoverable tool failures fail the run", async () => {
  const failing: AgentTool = {
    name: "dangerous",
    description: "Fails",
    schema: z.object({}),
    execute: () =>
      Effect.fail(
        new AgentToolError({
          tool: "dangerous",
          code: "broken",
          message: "Broken",
          recoverable: false,
        }),
      ),
  };
  const { llm } = scriptedLLM([succeedingTurn({ toolCalls: [call("fatal", "dangerous", {})] })]);
  const run = await Effect.runPromise(
    makeAgent(baseConfig(llm, [failing])).start({ messages: [{ role: "user", content: "Run" }] }),
  );

  assert.equal(run.status, "failed");
  assert.equal(run.failure?.code, "tool");
});

test("model failures fail the run and remain in the trace", async () => {
  const modelError = new LLMProviderError({
    provider: "test",
    operation: "generateTurn",
    message: "Unavailable",
  });
  const { llm } = scriptedLLM([Effect.fail(modelError)]);
  const run = await Effect.runPromise(
    makeAgent(baseConfig(llm)).start({ messages: [{ role: "user", content: "Run" }] }),
  );

  assert.equal(run.status, "failed");
  assert.equal(run.failure?.code, "model");
  assert.equal(run.trace.modelTurns[0]?.error, modelError);
});

test("retries transient model failures with a local ceiling", async () => {
  const { llm, requests } = scriptedLLM([
    Effect.fail(
      new LLMRateLimitError({
        provider: "test",
        operation: "generateTurn",
        model: "test/model",
        status: 429,
        message: "Try again",
      }),
    ),
    succeedingTurn({ text: "Recovered answer" }),
  ]);
  const run = await Effect.runPromise(
    makeAgent({ ...baseConfig(llm), maxModelRetries: 1 }).start({
      messages: [{ role: "user", content: "Research" }],
    }),
  );

  assert.equal(run.status, "completed");
  assert.equal(requests.length, 2);
  assert.equal(run.trace.modelTurns[0]?.attempts, 2);
  assert.equal(run.config.maxModelRetries, 1);
});

test("a suspending tool supports clarification and continuation on the same run", async () => {
  const askUser: AgentTool = {
    name: "ask_user",
    description: "Ask for material missing information",
    schema: z.object({ question: z.string() }),
    execute: (input) => {
      const { question } = input as { readonly question: string };
      return Effect.succeed(suspendAgent({ question }));
    },
  };
  const { llm, requests } = scriptedLLM([
    succeedingTurn({
      toolCalls: [call("ask-1", "ask_user", { question: "What width fits?" })],
    }),
    succeedingTurn({ text: "Choose the narrow model." }),
  ]);
  const agent = makeAgent(baseConfig(llm, [askUser]));
  const waiting = await Effect.runPromise(
    agent.start({ messages: [{ role: "user", content: "Find a machine" }] }),
  );

  assert.equal(waiting.status, "waiting_for_input");
  assert.deepEqual(waiting.outcome, {
    kind: "suspension",
    toolCallId: "ask-1",
    toolName: "ask_user",
    request: { question: "What width fits?" },
  });

  const completed = await Effect.runPromise(
    agent.continue({ run: waiting, toolResult: { answer: "Under 30 cm" } }),
  );
  assert.equal(completed.id, waiting.id);
  assert.equal(completed.status, "completed");
  assert.deepEqual(requests[1]?.messages.at(-1), {
    role: "tool",
    toolCallId: "ask-1",
    name: "ask_user",
    content: '{"answer":"Under 30 cm"}',
  });
});

test("human suspension time does not consume the active-run duration budget", async () => {
  let now = 0;
  const askUser: AgentTool = {
    name: "ask_user",
    description: "Ask",
    schema: z.object({ question: z.string() }),
    execute: (input) => {
      const { question } = input as { readonly question: string };
      return Effect.succeed(suspendAgent({ question }));
    },
  };
  const { llm } = scriptedLLM([
    succeedingTurn({ toolCalls: [call("ask", "ask_user", { question: "Width?" })] }),
    succeedingTurn({ text: "Done" }),
  ]);
  const agent = makeAgent({
    ...baseConfig(llm, [askUser]),
    maxDurationMs: 100,
    now: () => now,
  });
  const waiting = await Effect.runPromise(
    agent.start({ messages: [{ role: "user", content: "Shop" }] }),
  );

  now = 600_000;
  const completed = await Effect.runPromise(
    agent.continue({ run: waiting, toolResult: { answer: "30 cm" } }),
  );

  assert.equal(completed.status, "completed");
  assert.equal(completed.usage.durationMs, waiting.usage.durationMs);
});

test("active-run duration interrupts a hanging model call", async () => {
  const run = await Effect.runPromise(
    makeAgent({ ...baseConfig(serviceFromTurn(() => Effect.never)), maxDurationMs: 5 }).start({
      messages: [{ role: "user", content: "Wait" }],
    }),
  );

  assert.equal(run.status, "failed");
  assert.equal(run.failure?.code, "duration_limit");
});

test("rejects unbounded local retry and concurrency configuration", () => {
  const { llm } = scriptedLLM([succeedingTurn({ text: "unused" })]);

  assert.throws(
    () => makeAgent({ ...baseConfig(llm), maxModelRetries: Number.POSITIVE_INFINITY }),
    /maxModelRetries/,
  );
  assert.throws(
    () => makeAgent({ ...baseConfig(llm), maxToolRetries: Number.POSITIVE_INFINITY }),
    /maxToolRetries/,
  );
  assert.throws(
    () => makeAgent({ ...baseConfig(llm), maxConcurrentTools: 0 }),
    /maxConcurrentTools/,
  );
});

test("reserves the final turn for synthesis and enforces the tool-call ceiling", async () => {
  let executions = 0;
  const tool = successTool("search", z.object({ query: z.string() }), () => {
    executions += 1;
    return {};
  });
  const { llm, requests } = scriptedLLM([
    succeedingTurn({
      toolCalls: [
        call("allowed", "search", { query: "one" }),
        call("rejected", "search", { query: "two" }),
      ],
    }),
    succeedingTurn({ text: "Best available answer" }),
  ]);
  const run = await Effect.runPromise(
    makeAgent({
      ...baseConfig(llm, [tool]),
      finalModel: "finalizer/model",
      maxModelTurns: 2,
      maxToolCalls: 1,
    }).start({
      messages: [{ role: "user", content: "Search" }],
    }),
  );

  assert.equal(run.status, "completed");
  assert.equal(executions, 1);
  assert.equal(run.usage.toolCalls, 1);
  assert.equal(requests[1]?.tools, undefined);
  assert.equal(requests[1]?.toolChoice, "none");
  assert.equal(requests[0]?.model, "openai/gpt-5.6-sol");
  assert.equal(requests[1]?.model, "finalizer/model");
  assert.equal(run.config.finalModel, "finalizer/model");
  assert.equal(
    requests[1]?.messages.some(
      (message) => message.role === "system" && message.content.includes("Research is over"),
    ),
    true,
  );
});

test("retries a forced synthesis that encodes another tool call", async () => {
  const tool = successTool("search", z.object({ query: z.string() }), () => ({}));
  const { llm, requests } = scriptedLLM([
    succeedingTurn({ toolCalls: [call("search-1", "search", { query: "one" })] }),
    succeedingTurn({
      text: '<tool_calls><invoke name="search">one more fact</invoke></tool_calls>',
    }),
    succeedingTurn({ text: "Best supported final answer." }),
  ]);
  const run = await Effect.runPromise(
    makeAgent({ ...baseConfig(llm, [tool]), maxModelTurns: 3, maxToolCalls: 1 }).start({
      messages: [{ role: "user", content: "Search" }],
    }),
  );

  assert.equal(run.status, "completed");
  assert.equal(run.outcome?.kind, "answer");
  assert.equal(
    run.outcome?.kind === "answer" ? run.outcome.text : undefined,
    "Best supported final answer.",
  );
  assert.equal(requests.length, 3);
  assert.equal(requests[1]?.tools, undefined);
  assert.equal(requests[2]?.tools, undefined);
  assert.equal(
    requests[2]?.messages.some(
      (message) =>
        message.role === "system" && message.content.includes("previous synthesis attempted"),
    ),
    true,
  );
});

test("accumulates model and tool costs and uses a soft research budget", async () => {
  const tool: AgentTool = {
    name: "priced",
    description: "Costs money",
    schema: z.object({}),
    execute: () => Effect.succeed(toolResult({ ok: true }, { costUsd: 0.02 })),
  };
  const { llm, requests } = scriptedLLM([
    succeedingTurn({
      toolCalls: [call("priced-1", "priced", {})],
      usage: {
        inputTokens: 10,
        outputTokens: 5,
        totalTokens: 15,
        costUsd: 0.04,
      },
    }),
    succeedingTurn({
      text: "Synthesized",
      usage: { inputTokens: 8, outputTokens: 4, totalTokens: 12, costUsd: 0.01 },
    }),
  ]);
  const run = await Effect.runPromise(
    makeAgent({ ...baseConfig(llm, [tool]), researchBudgetUsd: 0.05 }).start({
      messages: [{ role: "user", content: "Research" }],
    }),
  );

  assert.equal(requests[1]?.tools, undefined);
  assert.deepEqual(run.usage, {
    modelTurns: 2,
    toolCalls: 1,
    inputTokens: 18,
    outputTokens: 9,
    totalTokens: 27,
    llmCostUsd: 0.05,
    toolCostUsd: 0.02,
    totalCostUsd: 0.07,
    durationMs: run.usage.durationMs,
  });
});

test("hard cost limits terminate before further tool execution", async () => {
  let executed = false;
  const tool = successTool("search", z.object({}), () => {
    executed = true;
    return {};
  });
  const { llm } = scriptedLLM([
    succeedingTurn({
      toolCalls: [call("search-1", "search", {})],
      usage: { costUsd: 0.2 },
    }),
  ]);
  const run = await Effect.runPromise(
    makeAgent({ ...baseConfig(llm, [tool]), hardCostLimitUsd: 0.1 }).start({
      messages: [{ role: "user", content: "Search" }],
    }),
  );

  assert.equal(run.status, "failed");
  assert.equal(run.failure?.code, "hard_cost_limit");
  assert.equal(executed, false);
});

test("hard cost limits reject a terminal answer that crosses the limit", async () => {
  const { llm } = scriptedLLM([
    succeedingTurn({ text: "An over-limit answer", usage: { costUsd: 0.2 } }),
  ]);
  const run = await Effect.runPromise(
    makeAgent({ ...baseConfig(llm), hardCostLimitUsd: 0.1 }).start({
      messages: [{ role: "user", content: "Answer" }],
    }),
  );

  assert.equal(run.status, "failed");
  assert.equal(run.outcome, undefined);
  assert.equal(run.failure?.code, "hard_cost_limit");
  assert.equal(run.usage.totalCostUsd, 0.2);
});

test("Effect interruption cancels the underlying model and emits a cancellation event", async () => {
  const events: AgentEvent[] = [];
  const llm = serviceFromTurn(() => Effect.never);
  const fiber = Effect.runFork(
    makeAgent({ ...baseConfig(llm), onEvent: (event) => events.push(event) }).start({
      messages: [{ role: "user", content: "Wait" }],
    }),
  );

  await new Promise((resolve) => setTimeout(resolve, 1));
  await Effect.runPromise(Fiber.interrupt(fiber));

  assert.equal(
    events.some((event) => event.type === "run.cancelled"),
    true,
  );
});

test("events are monotonically ordered and snapshot the exact effective configuration", async () => {
  const { llm } = scriptedLLM([succeedingTurn({ text: "Done" })]);
  const run = await Effect.runPromise(
    makeAgent({
      ...baseConfig(llm),
      reasoning: { effort: "high" },
      temperature: 0.1,
      toolChoice: "auto",
      parallelToolCalls: false,
      providerOptions: { route: "fixed" },
      maxDurationMs: 10_000,
      researchBudgetUsd: 0.2,
      hardCostLimitUsd: 0.4,
    }).start({ messages: [{ role: "user", content: "Run" }] }),
  );

  assert.deepEqual(
    run.events.map((event) => event.sequence),
    run.events.map((_event, index) => index + 1),
  );
  assert.deepEqual(run.config.reasoning, { effort: "high" });
  assert.equal(run.config.temperature, 0.1);
  assert.equal(run.config.toolChoice, "auto");
  assert.equal(run.config.parallelToolCalls, false);
  assert.deepEqual(run.config.providerOptions, { route: "fixed" });
  assert.equal(run.config.instructionsVersion, "test-v1");
  assert.equal(run.config.maxDurationMs, 10_000);
});

function baseConfig(llm: LLMService, tools: ReadonlyArray<AgentTool> = []): AgentConfig {
  return {
    llm,
    model: "openai/gpt-5.6-sol",
    instructions: "Be useful.",
    instructionsVersion: "test-v1",
    maxModelTurns: 5,
    maxToolCalls: 5,
    tools,
    createRunId: () => "run-1",
  };
}

function call(id: string, name: string, input: unknown) {
  return { id, name, arguments: JSON.stringify(input) };
}

function succeedingTurn(
  input: Partial<GenerateTurnResult>,
): Effect.Effect<GenerateTurnResult, LLMError> {
  return Effect.succeed({
    toolCalls: [],
    model: "resolved/test-model",
    provider: "test",
    ...input,
  });
}

function scriptedLLM(steps: Array<Effect.Effect<GenerateTurnResult, LLMError>>) {
  const requests: GenerateTurnInput[] = [];
  let index = 0;
  const llm = serviceFromTurn((request) => {
    requests.push(request);
    const step = steps[index++];
    return step ?? Effect.die(new Error("No scripted model turn remains."));
  });
  return { llm, requests };
}

function serviceFromTurn(
  generateTurn: (input: GenerateTurnInput) => Effect.Effect<GenerateTurnResult, LLMError>,
): LLMService {
  return {
    generateTurn,
    generateText: (_input: GenerateTextInput) => Effect.die("Not used") as never,
    generateObject: <S extends z.ZodType>(
      _input: GenerateObjectInput<S>,
    ): Effect.Effect<GenerateObjectResult<z.output<S>>, LLMError> => Effect.die("Not used"),
  };
}

function successTool<S extends z.ZodType>(
  name: string,
  schema: S,
  execute: (input: z.output<S>) => unknown,
): AgentTool {
  return {
    name,
    description: `${name} tool`,
    schema,
    execute: (input) => Effect.succeed(toolResult(execute(input as z.output<S>))),
  } as AgentTool;
}

function asyncTool(
  name: string,
  execute: (input: { readonly id: number }) => Promise<unknown>,
): AgentTool {
  return {
    name,
    description: `${name} tool`,
    schema: z.object({ id: z.number() }),
    execute: (input) =>
      Effect.tryPromise({
        try: () => execute(input as { readonly id: number }).then((value) => toolResult(value)),
        catch: (cause) =>
          new AgentToolError({
            tool: name,
            code: "failed",
            message: "Failed",
            recoverable: true,
            cause,
          }),
      }),
  };
}
