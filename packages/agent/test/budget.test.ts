import assert from "node:assert/strict";
import { test } from "node:test";
import { reachedHardLimit, shouldForceSynthesis } from "../src/budget.ts";
import { emptyUsage } from "../src/types.ts";

test("hard limits report duration, cost, and model-turn exhaustion", () => {
  assert.equal(
    reachedHardLimit({ usage: emptyUsage(), elapsedMs: 100, maxModelTurns: 5, maxDurationMs: 100 }),
    "duration",
  );
  assert.equal(
    reachedHardLimit({
      usage: { ...emptyUsage(), totalCostUsd: 1 },
      elapsedMs: 0,
      maxModelTurns: 5,
      hardCostLimitUsd: 1,
    }),
    "hard_cost",
  );
  assert.equal(
    reachedHardLimit({
      usage: { ...emptyUsage(), modelTurns: 3 },
      elapsedMs: 0,
      maxModelTurns: 3,
    }),
    "model_turn",
  );
});

test("synthesis reserves the final model turn and reacts to research cost", () => {
  assert.equal(
    shouldForceSynthesis({
      usage: { ...emptyUsage(), modelTurns: 2 },
      maxModelTurns: 3,
    }),
    true,
  );
  assert.equal(
    shouldForceSynthesis({
      usage: { ...emptyUsage(), totalCostUsd: 0.1 },
      maxModelTurns: 5,
      researchBudgetUsd: 0.1,
    }),
    true,
  );
});
