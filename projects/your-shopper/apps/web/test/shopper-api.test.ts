import assert from "node:assert/strict";
import test from "node:test";
import type { AgentRun } from "@templar/agent";
import type { ShopperRun } from "your-shopper-agent";
import {
  parseCreateShoppingRunInput,
  ShoppingApiInputError,
  shoppingRunResponse,
} from "../src/lib/shopper-api.ts";

test("parses and trims a shopping request", () => {
  assert.deepEqual(
    parseCreateShoppingRunInput({ intent: "  Find a quiet dishwasher  ", context: " EU plug " }),
    { intent: "Find a quiet dishwasher", context: "EU plug" },
  );
});

test("rejects requests without an intent", () => {
  assert.throws(() => parseCreateShoppingRunInput({ context: "Stockholm" }), ShoppingApiInputError);
});

test("publishes a completed answer without the internal agent trace", () => {
  const response = shoppingRunResponse(
    run({
      status: "completed",
      outcome: {
        kind: "answer",
        text: "Buy this one.",
        citations: [{ url: "https://example.com/product", title: "Product" }],
      },
    }),
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.status, "completed");
  assert.equal("agentRun" in response.body, false);
});

test("maps failed agent runs to a stable upstream error", () => {
  const response = shoppingRunResponse(run({ status: "failed", failureCode: "hard_cost_limit" }));

  assert.equal(response.status, 502);
  assert.deepEqual(response.body, {
    id: "run-test",
    status: "failed",
    error: {
      code: "hard_cost_limit",
      message: "Shopping research could not be completed.",
    },
    usage: {
      modelTurns: 0,
      toolCalls: 0,
      totalTokens: 0,
      totalCostUsd: 0,
      durationMs: 0,
    },
  });
});

function run(input: {
  readonly status: ShopperRun["status"];
  readonly outcome?: ShopperRun["outcome"];
  readonly failureCode?: "hard_cost_limit";
}): ShopperRun {
  const agentRun = {
    id: "run-test",
    status: input.status,
    config: {},
    messages: [],
    events: [],
    trace: { toolCalls: [] },
    usage: {
      modelTurns: 0,
      toolCalls: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      llmCostUsd: 0,
      toolCostUsd: 0,
      totalCostUsd: 0,
      durationMs: 0,
    },
    startedAt: new Date(0).toISOString(),
    ...(input.failureCode === undefined
      ? {}
      : {
          failure: {
            code: input.failureCode,
            message: "internal detail",
          },
        }),
  } as unknown as AgentRun;

  return {
    id: agentRun.id,
    status: input.status,
    ...(input.outcome === undefined ? {} : { outcome: input.outcome }),
    usage: agentRun.usage,
    agentRun,
  };
}
