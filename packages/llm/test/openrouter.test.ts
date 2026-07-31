import assert from "node:assert/strict";
import { test } from "node:test";
import { Effect, Either } from "effect";
import { z } from "zod";
import { makeOpenRouterLLM } from "../src/drivers/openrouter.ts";
import { LLMRateLimitError } from "../src/errors.ts";
import type { GenerateTextInput } from "../src/types.ts";

test("openrouter service serializes chat completions requests", async () => {
  let requestUrl = "";
  let requestInit: RequestInit | undefined;
  const ai = makeOpenRouterLLM({
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
  const ai = makeOpenRouterLLM({
    apiKey: "test-token",
    fetch: (_url, init) => {
      requestInit = init;

      return Promise.resolve(
        Response.json({
          model: "deepseek/deepseek-v4-flash-0731",
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

test("openrouter service maps HTTP 429 to LLMRateLimitError", async () => {
  const ai = makeOpenRouterLLM({
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
    assert.fail("Expected LLMRateLimitError.");
  }

  if (!(result.left instanceof LLMRateLimitError)) {
    assert.fail("Expected LLMRateLimitError.");
  }

  assert.equal(result.left.requestId, "req_123");
});

test("openrouter service passes Effect interruption signal to fetch", async () => {
  let receivedSignal: AbortSignal | null | undefined;
  const ai = makeOpenRouterLLM({
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
  const ai = makeOpenRouterLLM({
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

test("openrouter serializes tool definitions, assistant calls, and tool results", async () => {
  let requestInit: RequestInit | undefined;
  const llm = makeOpenRouterLLM({
    apiKey: "test-token",
    fetch: (_url, init) => {
      requestInit = init;
      return Promise.resolve(
        Response.json({
          model: "openai/gpt-5.6-sol",
          choices: [
            {
              finish_reason: "tool_calls",
              message: {
                content: null,
                reasoning_details: [{ type: "reasoning.encrypted", data: "opaque", index: 0 }],
                tool_calls: [
                  {
                    id: "call-2",
                    type: "function",
                    function: { name: "search", arguments: "{" },
                  },
                  {
                    id: "call-3",
                    type: "function",
                    function: { name: "contents", arguments: '{"urls":[]}' },
                  },
                ],
              },
            },
          ],
          usage: { prompt_tokens: 8, completion_tokens: 5, total_tokens: 13, cost: 0.01 },
        }),
      );
    },
  });

  const result = await Effect.runPromise(
    llm.generateTurn({
      model: "openai/gpt-5.6-sol",
      messages: [
        { role: "user", content: "Research this" },
        {
          role: "assistant",
          providerData: {
            reasoning_details: [{ type: "reasoning.encrypted", data: "prior", index: 0 }],
          },
          toolCalls: [{ id: "call-1", name: "search", arguments: '{"query":"x"}' }],
        },
        { role: "tool", toolCallId: "call-1", name: "search", content: '{"results":[]}' },
      ],
      tools: [
        {
          name: "search",
          description: "Search the web",
          inputSchema: {
            type: "object",
            properties: { query: { type: "string" } },
            required: ["query"],
          },
        },
      ],
      reasoning: { effort: "high" },
      toolChoice: "auto",
      parallelToolCalls: true,
      providerOptions: { seed: 7 },
    }),
  );
  const body = JSON.parse(String(requestInit?.body));

  assert.deepEqual(body.messages, [
    { role: "user", content: "Research this" },
    {
      role: "assistant",
      content: null,
      reasoning_details: [{ type: "reasoning.encrypted", data: "prior", index: 0 }],
      tool_calls: [
        {
          id: "call-1",
          type: "function",
          function: { name: "search", arguments: '{"query":"x"}' },
        },
      ],
    },
    {
      role: "tool",
      tool_call_id: "call-1",
      name: "search",
      content: '{"results":[]}',
    },
  ]);
  assert.deepEqual(body.tools, [
    {
      type: "function",
      function: {
        name: "search",
        description: "Search the web",
        parameters: {
          type: "object",
          properties: { query: { type: "string" } },
          required: ["query"],
        },
      },
    },
  ]);
  assert.deepEqual(body.reasoning, { effort: "high" });
  assert.equal(body.tool_choice, "auto");
  assert.equal(body.parallel_tool_calls, true);
  assert.equal(body.seed, 7);
  assert.deepEqual(result.toolCalls, [
    { id: "call-2", name: "search", arguments: "{" },
    { id: "call-3", name: "contents", arguments: '{"urls":[]}' },
  ]);
  assert.deepEqual(result.assistantProviderData, {
    reasoning_details: [{ type: "reasoning.encrypted", data: "opaque", index: 0 }],
  });
  assert.deepEqual(result.usage, {
    inputTokens: 8,
    outputTokens: 5,
    totalTokens: 13,
    costUsd: 0.01,
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
