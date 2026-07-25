import assert from "node:assert/strict";
import { test } from "node:test";
import { Effect, Either } from "effect";
import { z } from "zod";
import type { AIDriver } from "./driver.ts";
import { AIParseError, AISchemaError, AIValidationError } from "./errors.ts";
import { makeAIService } from "./service.ts";
import type { GenerateTextResult, ResolvedGenerateTextInput } from "./types.ts";

test("default model is the balanced templar tier", async () => {
  let received: ResolvedGenerateTextInput | undefined;
  const ai = makeAIService({
    driver: makeDriver("openrouter", (input) => {
      received = input;
    }),
  });

  await Effect.runPromise(
    ai.generateText({
      messages: [{ role: "user", content: "Hello" }],
    }),
  );

  assert.equal(received?.model, "deepseek/deepseek-v4-flash");
  assert.equal(received?.fallbackModels, undefined);
});

test("free tier delegates model selection to OpenRouter", async () => {
  let received: ResolvedGenerateTextInput | undefined;
  const ai = makeAIService({
    driver: makeDriver("openrouter", (input) => {
      received = input;
    }),
  });

  await Effect.runPromise(
    ai.generateText({
      model: "free",
      messages: [{ role: "user", content: "Try this for free." }],
    }),
  );

  assert.equal(received?.model, "openrouter/free");
  assert.equal(received?.fallbackModels, undefined);
});

test("callers select model tiers, not provider model IDs", async () => {
  let received: ResolvedGenerateTextInput | undefined;
  const ai = makeAIService({
    driver: makeDriver("openrouter", (input) => {
      received = input;
    }),
  });

  await Effect.runPromise(
    ai.generateText({
      model: "auto",
      messages: [{ role: "user", content: "Choose a model for this task." }],
    }),
  );

  assert.equal(received?.model, "openrouter/auto-beta");
  assert.equal(received?.fallbackModels, undefined);
});

test("generateText validates messages", async () => {
  const ai = makeAIService({
    driver: makeDriver("openrouter"),
  });

  const result = await Effect.runPromise(
    Effect.either(
      ai.generateText({
        messages: [],
      }),
    ),
  );

  if (!Either.isLeft(result)) {
    assert.fail("Expected AIValidationError.");
  }
  assert.equal(result.left instanceof AIValidationError, true);
});

test("generateObject parses and validates JSON responses", async () => {
  const ai = makeAIService({
    driver: makeDriver("openrouter", undefined, '{"name":"Ada"}'),
  });

  const result = await Effect.runPromise(
    ai.generateObject({
      messages: [{ role: "user", content: "Return JSON." }],
      schema: z.object({ name: z.string() }),
    }),
  );

  assert.deepEqual(result.value, { name: "Ada" });
});

test("generateObject passes structured output to the driver", async () => {
  let received: ResolvedGenerateTextInput | undefined;
  const ai = makeAIService({
    driver: makeDriver(
      "openrouter",
      (input) => {
        received = input;
      },
      '{"name":"Ada"}',
    ),
  });

  await Effect.runPromise(
    ai.generateObject({
      messages: [{ role: "user", content: "Return JSON." }],
      schema: z.object({ name: z.string() }),
    }),
  );

  assert.equal(received?.structuredOutput?.name, "response");
  assert.equal(received?.structuredOutput?.strict, true);
  assert.deepEqual(received?.structuredOutput?.schema, {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    properties: {
      name: { type: "string" },
    },
    required: ["name"],
    additionalProperties: false,
  });
});

test("generateObject returns parse errors for malformed JSON", async () => {
  const ai = makeAIService({
    driver: makeDriver("openrouter", undefined, "{"),
  });

  const result = await Effect.runPromise(
    Effect.either(
      ai.generateObject({
        messages: [{ role: "user", content: "Return JSON." }],
        schema: z.object({ name: z.string() }),
      }),
    ),
  );

  if (!Either.isLeft(result)) {
    assert.fail("Expected AIParseError.");
  }
  assert.equal(result.left instanceof AIParseError, true);
});

test("generateObject returns parse errors for schema mismatches", async () => {
  const ai = makeAIService({
    driver: makeDriver("openrouter", undefined, '{"name":123}'),
  });

  const result = await Effect.runPromise(
    Effect.either(
      ai.generateObject({
        messages: [{ role: "user", content: "Return JSON." }],
        schema: z.object({ name: z.string() }),
      }),
    ),
  );

  if (!Either.isLeft(result)) {
    assert.fail("Expected AIParseError.");
  }
  assert.equal(result.left instanceof AIParseError, true);
});

test("generateObject returns schema errors for unrepresentable Zod schemas", async () => {
  const ai = makeAIService({
    driver: makeDriver("openrouter", undefined, '{"createdAt":"2026-05-18"}'),
  });

  const result = await Effect.runPromise(
    Effect.either(
      ai.generateObject({
        messages: [{ role: "user", content: "Return JSON." }],
        schema: z.object({ createdAt: z.date() }),
      }),
    ),
  );

  if (!Either.isLeft(result)) {
    assert.fail("Expected AISchemaError.");
  }
  assert.equal(result.left instanceof AISchemaError, true);
});

function makeDriver(
  provider: string,
  onGenerate?: (input: ResolvedGenerateTextInput) => void,
  text = "ok",
): AIDriver {
  return {
    provider,
    generateText: (input) =>
      Effect.sync((): GenerateTextResult => {
        onGenerate?.(input);

        return {
          text,
          model: input.model,
          provider,
        };
      }),
  };
}
