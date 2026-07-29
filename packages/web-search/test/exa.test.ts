import assert from "node:assert/strict";
import { test } from "node:test";
import { Effect, Either } from "effect";
import { z } from "zod";
import { makeExaWebSearch } from "../src/drivers/exa.ts";
import {
  WebSearchMalformedResponseError,
  WebSearchProviderError,
  WebSearchRateLimitError,
} from "../src/errors.ts";

test("Exa driver translates search filters, content options, and output schema", async () => {
  let requestUrl = "";
  let requestInit: RequestInit | undefined;
  const service = makeExaWebSearch({
    apiKey: "exa-test",
    defaultHeaders: { "X-Test": "yes" },
    fetch: (url, init) => {
      requestUrl = String(url);
      requestInit = init;
      return Promise.resolve(
        Response.json({
          results: [
            {
              url: "https://shop.example/machine",
              title: "Machine",
              author: "Shop",
              publishedDate: "2026-01-02",
              text: "Full text",
              highlights: ["Sale price"],
            },
          ],
          output: {
            content: { best: "Machine" },
            grounding: [
              {
                field: "best",
                citations: [{ url: "https://shop.example/machine", title: "Machine" }],
              },
            ],
          },
          requestId: "exa-request-1",
          costDollars: { total: 0.012 },
        }),
      );
    },
  });

  const result = await Effect.runPromise(
    service.search({
      query: "best narrow espresso machine",
      numResults: 7,
      includeDomains: ["shop.example"],
      excludeDomains: ["spam.example"],
      startPublishedDate: "2025-01-01",
      endPublishedDate: "2026-07-29",
      userLocation: "SE",
      mode: "deep",
      contents: {
        text: { maxCharacters: 2_000, includeHtmlTags: false },
        highlights: { query: "price width", maxCharacters: 3_000 },
        livecrawl: "preferred",
        livecrawlTimeoutMs: 8_000,
      },
      schema: z.object({ best: z.string() }),
      providerOptions: { systemPrompt: "Prefer primary sources." },
    }),
  );
  const body = JSON.parse(String(requestInit?.body));
  const headers = new Headers(requestInit?.headers);

  assert.equal(requestUrl, "https://api.exa.ai/search");
  assert.equal(requestInit?.method, "POST");
  assert.equal(headers.get("x-api-key"), "exa-test");
  assert.equal(headers.get("x-test"), "yes");
  assert.deepEqual(body, {
    systemPrompt: "Prefer primary sources.",
    query: "best narrow espresso machine",
    numResults: 7,
    includeDomains: ["shop.example"],
    excludeDomains: ["spam.example"],
    startPublishedDate: "2025-01-01",
    endPublishedDate: "2026-07-29",
    userLocation: "SE",
    type: "deep",
    contents: {
      text: { maxCharacters: 2_000, includeHtmlTags: false },
      highlights: { query: "price width", maxCharacters: 3_000 },
      livecrawl: "preferred",
      livecrawlTimeout: 8_000,
    },
    outputSchema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: { best: { type: "string" } },
      required: ["best"],
      additionalProperties: false,
    },
  });
  assert.deepEqual(result.output, { best: "Machine" });
  assert.equal(result.results[0]?.text, "Full text");
  assert.deepEqual(result.grounding, [
    {
      field: "best",
      citations: [{ url: "https://shop.example/machine", title: "Machine" }],
    },
  ]);
  assert.equal(result.requestId, "exa-request-1");
  assert.equal(result.costUsd, 0.012);
  assert.equal((result.raw as { requestId: string }).requestId, "exa-request-1");
});

test("Exa driver translates content retrieval and preserves metadata", async () => {
  let requestInit: RequestInit | undefined;
  const raw = {
    results: [{ url: "https://example.com", text: "Page" }],
    requestId: "contents-1",
    costDollars: { total: 0.001 },
  };
  const service = makeExaWebSearch({
    apiKey: "test",
    fetch: (_url, init) => {
      requestInit = init;
      return Promise.resolve(Response.json(raw));
    },
  });

  const result = await Effect.runPromise(
    service.getContents({
      urls: ["https://example.com"],
      contents: { text: true, highlights: true },
      providerOptions: { subpages: 1 },
    }),
  );

  assert.deepEqual(JSON.parse(String(requestInit?.body)), {
    subpages: 1,
    ids: ["https://example.com"],
    text: true,
    highlights: true,
  });
  assert.deepEqual(result.raw, raw);
  assert.equal(result.requestId, "contents-1");
  assert.equal(result.costUsd, 0.001);
});

test("Exa driver maps provider validation and rate-limit failures", async () => {
  const provider = makeExaWebSearch({
    apiKey: "test",
    fetch: () => Promise.resolve(Response.json({ message: "denied" }, { status: 401 })),
  });
  const limited = makeExaWebSearch({
    apiKey: "test",
    fetch: () =>
      Promise.resolve(
        Response.json(
          { error: { message: "slow down" } },
          { status: 429, headers: { "x-request-id": "rate-1" } },
        ),
      ),
  });
  const validation = makeExaWebSearch({
    apiKey: "test",
    fetch: () => Promise.resolve(Response.json({ message: "query is required" }, { status: 400 })),
  });

  const providerResult = await Effect.runPromise(
    Effect.either(provider.search({ query: "hello" })),
  );
  const rateResult = await Effect.runPromise(Effect.either(limited.search({ query: "hello" })));
  const validationResult = await Effect.runPromise(Effect.either(validation.search({ query: "" })));

  assert.equal(
    Either.isLeft(providerResult) && providerResult.left instanceof WebSearchProviderError,
    true,
  );
  assert.equal(
    Either.isLeft(rateResult) && rateResult.left instanceof WebSearchRateLimitError,
    true,
  );
  assert.equal(
    Either.isLeft(validationResult) && validationResult.left instanceof WebSearchProviderError,
    true,
  );
  if (Either.isLeft(rateResult) && rateResult.left instanceof WebSearchRateLimitError) {
    assert.equal(rateResult.left.requestId, "rate-1");
  }
});

test("Exa driver rejects malformed provider responses", async () => {
  const service = makeExaWebSearch({
    apiKey: "test",
    fetch: () => Promise.resolve(Response.json({ answer: "missing results" })),
  });
  const result = await Effect.runPromise(Effect.either(service.search({ query: "hello" })));

  assert.equal(
    Either.isLeft(result) && result.left instanceof WebSearchMalformedResponseError,
    true,
  );
});

test("Exa driver passes the Effect interruption signal to fetch", async () => {
  let receivedSignal: AbortSignal | null | undefined;
  const service = makeExaWebSearch({
    apiKey: "test",
    fetch: (_url, init) => {
      receivedSignal = init?.signal;
      return Promise.resolve(Response.json({ results: [] }));
    },
  });

  await Effect.runPromise(service.search({ query: "hello" }));

  assert.equal(receivedSignal instanceof AbortSignal, true);
});
