import assert from "node:assert/strict";
import { test } from "node:test";
import { Effect, Either } from "effect";
import { z } from "zod";
import type { LLMDriver } from "../src/driver.ts";
import { LLMParseError, LLMSchemaError } from "../src/errors.ts";
import { exactModels } from "../src/models.ts";
import { makeLLMService } from "../src/service.ts";
import type { GenerateTurnResult, ResolvedGenerateTurnInput } from "../src/types.ts";

test("default model is the balanced Templar tier", async () => {
  let received: ResolvedGenerateTurnInput | undefined;
  const llm = makeLLMService({ driver: makeDriver((input) => (received = input)) });

  await Effect.runPromise(llm.generateText({ messages: [{ role: "user", content: "Hello" }] }));

  assert.equal(received?.model, "deepseek/deepseek-v4-flash");
  assert.equal(received?.fallbackModels, undefined);
});

test("model tiers retain configured fallback routes", async () => {
  let received: ResolvedGenerateTurnInput | undefined;
  const llm = makeLLMService({ driver: makeDriver((input) => (received = input)) });

  await Effect.runPromise(
    llm.generateText({ model: "frontier", messages: [{ role: "user", content: "Hello" }] }),
  );

  assert.equal(received?.model, "openai/gpt-5.6-sol");
  assert.deepEqual(received?.fallbackModels, [
    "anthropic/claude-opus-5",
    "~google/gemini-pro-latest",
  ]);
});

test("explicit provider model identifiers bypass tier routing", async () => {
  let received: ResolvedGenerateTurnInput | undefined;
  const llm = makeLLMService({ driver: makeDriver((input) => (received = input)) });

  await Effect.runPromise(
    llm.generateTurn({
      model: "anthropic/claude-sonnet-4.5",
      messages: [{ role: "user", content: "Hello" }],
    }),
  );

  assert.equal(received?.model, "anthropic/claude-sonnet-4.5");
  assert.equal(received?.fallbackModels, undefined);
});

test("exports exact model identifiers for reproducible evaluations", () => {
  assert.deepEqual(exactModels, {
    deepSeekV4Flash: "deepseek/deepseek-v4-flash",
    qwen37Flash: "qwen/qwen3.7-flash",
    qwen36Flash: "qwen/qwen3.6-flash",
    minimaxM3: "minimax/minimax-m3",
    glm52: "z-ai/glm-5.2",
    gpt56Luna: "openai/gpt-5.6-luna",
    gpt56Sol: "openai/gpt-5.6-sol",
  });
});

test("generateTurn forwards tools and model-native controls", async () => {
  let received: ResolvedGenerateTurnInput | undefined;
  const toolCall = { id: "call-1", name: "search", arguments: "{" };
  const llm = makeLLMService({
    driver: makeDriver((input) => (received = input), { toolCalls: [toolCall] }),
  });

  const result = await Effect.runPromise(
    llm.generateTurn({
      model: "openai/gpt-5.6-sol",
      messages: [{ role: "user", content: "Research this" }],
      tools: [
        {
          name: "search",
          description: "Search the web",
          inputSchema: { type: "object", properties: { query: { type: "string" } } },
        },
      ],
      reasoning: { effort: "high" },
      toolChoice: "auto",
      parallelToolCalls: true,
      providerOptions: { seed: 42 },
    }),
  );

  assert.deepEqual(result.toolCalls, [toolCall]);
  assert.equal(received?.tools?.[0]?.name, "search");
  assert.deepEqual(received?.reasoning, { effort: "high" });
  assert.equal(received?.toolChoice, "auto");
  assert.equal(received?.parallelToolCalls, true);
  assert.deepEqual(received?.providerOptions, { seed: 42 });
});

test("provider-facing message validation remains with the provider", async () => {
  let received: ResolvedGenerateTurnInput | undefined;
  const llm = makeLLMService({ driver: makeDriver((input) => (received = input)) });

  await Effect.runPromise(llm.generateTurn({ messages: [] }));

  assert.deepEqual(received?.messages, []);
});

test("generateObject parses and validates JSON responses", async () => {
  const llm = makeLLMService({ driver: makeDriver(undefined, { text: '{"name":"Ada"}' }) });
  const result = await Effect.runPromise(
    llm.generateObject({
      messages: [{ role: "user", content: "Return JSON." }],
      schema: z.object({ name: z.string() }),
    }),
  );

  assert.deepEqual(result.value, { name: "Ada" });
});

test("generateObject passes package-owned structured output to the driver", async () => {
  let received: ResolvedGenerateTurnInput | undefined;
  const llm = makeLLMService({
    driver: makeDriver((input) => (received = input), { text: '{"name":"Ada"}' }),
  });

  await Effect.runPromise(
    llm.generateObject({
      messages: [{ role: "user", content: "Return JSON." }],
      schema: z.object({ name: z.string() }),
    }),
  );

  assert.deepEqual(received?.structuredOutput, {
    name: "response",
    strict: true,
    schema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: { name: { type: "string" } },
      required: ["name"],
      additionalProperties: false,
    },
  });
});

test("generateObject returns parse errors for malformed or mismatched JSON", async () => {
  await Promise.all(
    ["{", '{"name":123}'].map(async (text) => {
      const llm = makeLLMService({ driver: makeDriver(undefined, { text }) });
      const result = await Effect.runPromise(
        Effect.either(
          llm.generateObject({
            messages: [{ role: "user", content: "Return JSON." }],
            schema: z.object({ name: z.string() }),
          }),
        ),
      );

      assert.equal(Either.isLeft(result) && result.left instanceof LLMParseError, true);
    }),
  );
});

test("generateObject returns schema errors for unrepresentable Zod schemas", async () => {
  const llm = makeLLMService({ driver: makeDriver(undefined, { text: "{}" }) });
  const result = await Effect.runPromise(
    Effect.either(
      llm.generateObject({
        messages: [{ role: "user", content: "Return JSON." }],
        schema: z.object({ createdAt: z.date() }),
      }),
    ),
  );

  assert.equal(Either.isLeft(result) && result.left instanceof LLMSchemaError, true);
});

function makeDriver(
  onGenerate?: (input: ResolvedGenerateTurnInput) => void,
  result: Partial<GenerateTurnResult> = {},
): LLMDriver {
  return {
    provider: "test",
    generateTurn: (input) =>
      Effect.sync(() => {
        onGenerate?.(input);
        return {
          text: "ok",
          toolCalls: [],
          model: input.model,
          provider: "test",
          ...result,
        };
      }),
  };
}
