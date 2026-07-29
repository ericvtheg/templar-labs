import assert from "node:assert/strict";
import { test } from "node:test";
import { Effect, Either } from "effect";
import { z } from "zod";
import type { WebSearchDriver } from "../src/driver.ts";
import { WebSearchParseError } from "../src/errors.ts";
import { makeWebSearchService } from "../src/service.ts";
import type { GetWebContentsResult, WebSearchResult } from "../src/types.ts";

test("search validates and parses caller-provided structured output", async () => {
  const service = makeWebSearchService(
    driverWithSearch({
      results: [],
      output: { offers: [{ name: "Machine", price: 499 }] },
      grounding: [],
      raw: { response: true },
    }),
  );
  const result = await Effect.runPromise(
    service.search({
      query: "espresso machine",
      schema: z.object({ offers: z.array(z.object({ name: z.string(), price: z.number() })) }),
    }),
  );

  assert.deepEqual(result.output, { offers: [{ name: "Machine", price: 499 }] });
});

test("search leaves dynamic output unknown when no schema is supplied", async () => {
  const output = { any: ["shape"] };
  const service = makeWebSearchService(
    driverWithSearch({ results: [], output, grounding: [], raw: {} }),
  );

  const result = await Effect.runPromise(service.search({ query: "anything" }));

  assert.equal(result.output, output);
});

test("search converts schemas before calling the driver", async () => {
  let receivedSchema: Readonly<Record<string, unknown>> | undefined;
  const service = makeWebSearchService({
    ...driverWithSearch({ results: [], output: { name: "Ada" }, grounding: [], raw: {} }),
    search: (input) => {
      receivedSchema = input.outputSchema;
      return Effect.succeed({ results: [], output: { name: "Ada" }, grounding: [], raw: {} });
    },
  });

  await Effect.runPromise(
    service.search({ query: "person", schema: z.object({ name: z.string() }) }),
  );

  assert.deepEqual(receivedSchema, {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    properties: { name: { type: "string" } },
    required: ["name"],
    additionalProperties: false,
  });
});

test("search reports malformed structured output", async () => {
  const service = makeWebSearchService(
    driverWithSearch({ results: [], output: { price: "cheap" }, grounding: [], raw: {} }),
  );
  const result = await Effect.runPromise(
    Effect.either(service.search({ query: "machine", schema: z.object({ price: z.number() }) })),
  );

  assert.equal(Either.isLeft(result), true);
  if (Either.isLeft(result)) {
    assert.equal(result.left instanceof WebSearchParseError, true);
  }
});

function driverWithSearch(searchResult: WebSearchResult<unknown>): WebSearchDriver {
  const contentsResult: GetWebContentsResult = { results: [], raw: {} };
  return {
    provider: "test",
    search: () => Effect.succeed(searchResult),
    getContents: () => Effect.succeed(contentsResult),
  };
}
