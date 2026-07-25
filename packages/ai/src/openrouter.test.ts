import assert from "node:assert/strict";
import { test } from "node:test";
import { Effect, Either } from "effect";
import { z } from "zod";
import { makeOpenRouterAI } from "./drivers/openrouter.ts";
import { AIRateLimitError } from "./errors.ts";
import type { GenerateTextInput } from "./types.ts";

test("openrouter service serializes chat completions requests", async () => {
  let requestUrl = "";
  let requestInit: RequestInit | undefined;
  const ai = makeOpenRouterAI({
    apiKey: "test-token",
    appName: "test-app",
    siteUrl: "https://example.com",
    fetch: (url, init) => {
      requestUrl = String(url);
      requestInit = init;

      return Promise.resolve(
        Response.json({
          model: "openai/gpt-4.1-mini",
          choices: [
            {
              finish_reason: "stop",
              message: { content: "Hello" },
            },
          ],
          usage: {
            prompt_tokens: 3,
            completion_tokens: 4,
            total_tokens: 7,
          },
        }),
      );
    },
  });

  const result = await Effect.runPromise(ai.generateText(makeInput()));
  const headers = new Headers(requestInit?.headers);

  assert.equal(requestUrl, "https://openrouter.ai/api/v1/chat/completions");
  assert.equal(requestInit?.method, "POST");
  assert.equal(headers.get("authorization"), "Bearer test-token");
  assert.equal(headers.get("http-referer"), "https://example.com");
  assert.equal(headers.get("x-title"), "test-app");
  assert.deepEqual(JSON.parse(String(requestInit?.body)), {
    model: "openai/gpt-5.6-sol",
    models: ["anthropic/claude-opus-5", "~google/gemini-pro-latest"],
    messages: [{ role: "user", content: "Say hello." }],
    temperature: 0.2,
    max_tokens: 128,
  });
  assert.equal(result.text, "Hello");
  assert.deepEqual(result.usage, {
    inputTokens: 3,
    outputTokens: 4,
    totalTokens: 7,
  });
});

test("openrouter service configures Auto Beta for cost-biased routing", async () => {
  let requestInit: RequestInit | undefined;
  const ai = makeOpenRouterAI({
    apiKey: "test-token",
    fetch: (_url, init) => {
      requestInit = init;

      return Promise.resolve(
        Response.json({
          model: "deepseek/deepseek-v4-flash",
          choices: [{ message: { content: "Hello" } }],
        }),
      );
    },
  });

  await Effect.runPromise(
    ai.generateText({
      model: "auto",
      messages: [{ role: "user", content: "Choose a model for this task." }],
    }),
  );

  assert.deepEqual(JSON.parse(String(requestInit?.body)), {
    model: "openrouter/auto-beta",
    plugins: [{ id: "auto-router", cost_quality_tradeoff: 9 }],
    messages: [{ role: "user", content: "Choose a model for this task." }],
  });
});

test("openrouter service maps HTTP 429 to AIRateLimitError", async () => {
  const ai = makeOpenRouterAI({
    apiKey: "test-token",
    fetch: () =>
      Promise.resolve(
        Response.json(
          {
            error: {
              message: "Rate limit exceeded",
            },
          },
          {
            status: 429,
            headers: {
              "x-request-id": "req_123",
            },
          },
        ),
      ),
  });

  const result = await Effect.runPromise(Effect.either(ai.generateText(makeInput())));

  if (!Either.isLeft(result)) {
    assert.fail("Expected AIRateLimitError.");
  }

  if (!(result.left instanceof AIRateLimitError)) {
    assert.fail("Expected AIRateLimitError.");
  }

  assert.equal(result.left.requestId, "req_123");
});

test("openrouter service passes Effect interruption signal to fetch", async () => {
  let receivedSignal: AbortSignal | null | undefined;
  const ai = makeOpenRouterAI({
    apiKey: "test-token",
    fetch: (_url, init) => {
      receivedSignal = init?.signal;

      return Promise.resolve(
        Response.json({
          model: "openai/gpt-4.1-mini",
          choices: [{ message: { content: "Hello" } }],
        }),
      );
    },
  });

  await Effect.runPromise(ai.generateText(makeInput()));

  assert.equal(receivedSignal instanceof AbortSignal, true);
});

test("openrouter service serializes structured output response format", async () => {
  let requestInit: RequestInit | undefined;
  const ai = makeOpenRouterAI({
    apiKey: "test-token",
    fetch: (_url, init) => {
      requestInit = init;

      return Promise.resolve(
        Response.json({
          model: "openai/gpt-4.1-mini",
          choices: [{ message: { content: '{"name":"Ada"}' } }],
        }),
      );
    },
  });

  await Effect.runPromise(
    ai.generateObject({
      ...makeInput(),
      schema: z.object({ name: z.string() }),
    }),
  );

  assert.deepEqual(JSON.parse(String(requestInit?.body)), {
    model: "openai/gpt-5.6-sol",
    models: ["anthropic/claude-opus-5", "~google/gemini-pro-latest"],
    messages: [{ role: "user", content: "Say hello." }],
    temperature: 0.2,
    max_tokens: 128,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "response",
        strict: true,
        schema: {
          $schema: "https://json-schema.org/draft/2020-12/schema",
          type: "object",
          properties: {
            name: { type: "string" },
          },
          required: ["name"],
          additionalProperties: false,
        },
      },
    },
  });
});

function makeInput(): GenerateTextInput {
  return {
    model: "frontier",
    messages: [{ role: "user", content: "Say hello." }],
    temperature: 0.2,
    maxTokens: 128,
  };
}
