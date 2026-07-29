import type { AgentUsage } from "./types.ts";

export type AgentLimit = "duration" | "hard_cost" | "model_turn" | undefined;

export function reachedHardLimit(input: {
  readonly usage: AgentUsage;
  readonly elapsedMs: number;
  readonly maxModelTurns: number;
  readonly maxDurationMs?: number;
  readonly hardCostLimitUsd?: number;
}): AgentLimit {
  if (input.maxDurationMs !== undefined && input.elapsedMs >= input.maxDurationMs) {
    return "duration";
  }
  if (input.hardCostLimitUsd !== undefined && input.usage.totalCostUsd >= input.hardCostLimitUsd) {
    return "hard_cost";
  }
  if (input.usage.modelTurns >= input.maxModelTurns) {
    return "model_turn";
  }
  return undefined;
}

export function shouldForceSynthesis(input: {
  readonly usage: AgentUsage;
  readonly maxModelTurns: number;
  readonly researchBudgetUsd?: number;
}): boolean {
  return (
    input.usage.modelTurns + 1 >= input.maxModelTurns ||
    (input.researchBudgetUsd !== undefined && input.usage.totalCostUsd >= input.researchBudgetUsd)
  );
}
