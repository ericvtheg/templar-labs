import assert from "node:assert/strict";
import { test } from "node:test";
import type { WebSearchService } from "@templar/web-search";
import { WebSearchProviderError } from "@templar/web-search";
import { Effect, Either } from "effect";
import { makeAskUserTool } from "../src/tools/ask-user.ts";
import { makeGetWebContentsTool } from "../src/tools/get-web-contents.ts";
import { makeWebSearchTool } from "../src/tools/web-search.ts";

const context = { runId: "run-1", toolCallId: "call-1", attempt: 1 };

test("web_search forwards provider inputs and reports normalized cost", async () => {
  let received: unknown;
  const raw = { provider: "raw" };
  const service = {
    search: (input: unknown) => {
      received = input;
      return Effect.succeed({
        results: [
          {
            url: "https://example.com",
            title: "Example",
            text: "Visible once",
            raw: { url: "https://example.com", text: "Visible once", score: 0.9 },
          },
        ],
        grounding: [],
        requestId: "request-1",
        costUsd: 0.02,
        raw,
      });
    },
    getContents: () => Effect.die("Not used"),
  } as unknown as WebSearchService;

  const result = await Effect.runPromise(
    makeWebSearchTool(service).execute(
      {
        query: "espresso",
        numResults: 2.5,
        includeDomains: ["example.com"],
        startPublishedDateIso8601: "2026-07-01T00:00:00Z",
        endPublishedDateIso8601: "2026-07-31T23:59:59Z",
        mode: "future-provider-mode",
        contents: { highlights: true, livecrawl: "preferred" },
      },
      context,
    ),
  );

  assert.deepEqual(received, {
    query: "espresso",
    numResults: 2.5,
    includeDomains: ["example.com"],
    startPublishedDate: "2026-07-01T00:00:00Z",
    endPublishedDate: "2026-07-31T23:59:59Z",
    mode: "future-provider-mode",
    contents: { highlights: true, livecrawl: "preferred" },
  });
  assert.equal(result.kind, "result");
  if (result.kind === "result") {
    assert.equal(result.costUsd, 0.02);
    assert.equal(result.raw, raw);
    assert.deepEqual(result.value, {
      results: [{ url: "https://example.com", title: "Example", text: "Visible once" }],
      grounding: [],
      requestId: "request-1",
    });
  }
});

test("get_web_contents defaults to text and preserves provider metadata", async () => {
  let received: unknown;
  const service = {
    search: () => Effect.die("Not used"),
    getContents: (input: unknown) => {
      received = input;
      return Effect.succeed({
        results: [
          {
            url: "https://example.com",
            text: "Page",
            raw: { url: "https://example.com", text: "Page", score: 1 },
          },
        ],
        requestId: "contents-1",
        costUsd: 0.01,
        raw: { raw: true },
      });
    },
  } as unknown as WebSearchService;

  const result = await Effect.runPromise(
    makeGetWebContentsTool(service).execute({ urls: ["https://example.com"] }, context),
  );

  assert.deepEqual(received, {
    urls: ["https://example.com"],
    contents: { text: true },
  });
  assert.equal(result.kind === "result" ? result.costUsd : undefined, 0.01);
  assert.deepEqual(result.kind === "result" ? result.value : undefined, {
    results: [{ url: "https://example.com", text: "Page" }],
    requestId: "contents-1",
  });
});

test("provider authentication failures become unrecoverable tool failures", async () => {
  const service = {
    search: () =>
      Effect.fail(
        new WebSearchProviderError({
          provider: "exa",
          operation: "search",
          status: 401,
          message: "Invalid key",
        }),
      ),
    getContents: () => Effect.die("Not used"),
  } as unknown as WebSearchService;

  const result = await Effect.runPromise(
    Effect.either(makeWebSearchTool(service).execute({ query: "espresso" }, context)),
  );

  assert.equal(Either.isLeft(result), true);
  if (Either.isLeft(result)) {
    assert.equal(result.left.code, "provider_error");
    assert.equal(result.left.recoverable, false);
  }
});

test("provider transport failures are recoverable and retryable", async () => {
  const service = {
    search: () =>
      Effect.fail(
        new WebSearchProviderError({
          provider: "exa",
          operation: "search",
          message: "Connection closed",
        }),
      ),
    getContents: () => Effect.die("Not used"),
  } as unknown as WebSearchService;

  const result = await Effect.runPromise(
    Effect.either(makeWebSearchTool(service).execute({ query: "espresso" }, context)),
  );

  assert.equal(Either.isLeft(result), true);
  if (Either.isLeft(result)) {
    assert.equal(result.left.recoverable, true);
    assert.equal(result.left.retryable, true);
  }
});

test("ask_user suspends with the model-authored question", async () => {
  const result = await Effect.runPromise(
    makeAskUserTool().execute(
      { question: "How wide is the counter?", reason: "Compatibility" },
      context,
    ),
  );

  assert.deepEqual(result, {
    kind: "suspend",
    request: { question: "How wide is the counter?", reason: "Compatibility" },
  });
});
