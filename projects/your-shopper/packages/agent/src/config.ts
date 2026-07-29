import type { AgentConfig } from "@templar/agent";
import { exactModels, type LLMService } from "@templar/llm";
import type { WebSearchService } from "@templar/web-search";
import {
  shopperFinalizationInstructions,
  shopperInstructions,
  shopperInstructionsVersion,
} from "./instructions.ts";
import { makeShopperTools } from "./tools/index.ts";

export type ShopperAgentConfig = {
  readonly llm: LLMService;
  readonly webSearch: WebSearchService;
  readonly model?: string;
  readonly finalizationModel?: string;
  readonly reasoning?: unknown;
  readonly temperature?: number;
  readonly toolChoice?: unknown;
  readonly parallelToolCalls?: boolean;
  readonly instructions?: string;
  readonly instructionsVersion?: string;
  readonly finalizationInstructions?: string;
  readonly maxModelTurns?: number;
  readonly maxToolCalls?: number;
  readonly maxConcurrentTools?: number;
  readonly maxDurationMs?: number;
  readonly softCostLimitUsd?: number;
  readonly hardCostLimitUsd?: number;
  readonly maxTokens?: number;
  readonly providerOptions?: Readonly<Record<string, unknown>>;
  readonly maxModelRetries?: number;
  readonly maxToolRetries?: number;
  readonly onEvent?: AgentConfig["onEvent"];
  readonly now?: () => number;
  readonly createRunId?: () => string;
};

export const defaultShopperModel = exactModels.minimaxM3;
export const defaultShopperFinalizationModel = exactModels.glm52;
export const defaultShopperSoftCostLimitUsd = 0.12;
export const defaultShopperHardCostLimitUsd = 0.2;

export function resolveShopperAgentConfig(input: ShopperAgentConfig): AgentConfig {
  return {
    llm: input.llm,
    model: input.model ?? defaultShopperModel,
    finalizationModel: input.finalizationModel ?? defaultShopperFinalizationModel,
    ...(input.reasoning === undefined
      ? { reasoning: { effort: "high" } }
      : { reasoning: input.reasoning }),
    ...(input.temperature === undefined ? {} : { temperature: input.temperature }),
    toolChoice: input.toolChoice ?? "required",
    parallelToolCalls: input.parallelToolCalls ?? true,
    instructions: input.instructions ?? shopperInstructions,
    instructionsVersion: input.instructionsVersion ?? shopperInstructionsVersion,
    finalizationInstructions: input.finalizationInstructions ?? shopperFinalizationInstructions,
    maxModelTurns: input.maxModelTurns ?? 8,
    maxToolCalls: input.maxToolCalls ?? 12,
    maxConcurrentTools: input.maxConcurrentTools ?? 2,
    ...(input.maxDurationMs === undefined
      ? { maxDurationMs: 240_000 }
      : { maxDurationMs: input.maxDurationMs }),
    ...(input.softCostLimitUsd === undefined
      ? { softCostLimitUsd: defaultShopperSoftCostLimitUsd }
      : { softCostLimitUsd: input.softCostLimitUsd }),
    ...(input.hardCostLimitUsd === undefined
      ? { hardCostLimitUsd: defaultShopperHardCostLimitUsd }
      : { hardCostLimitUsd: input.hardCostLimitUsd }),
    ...(input.maxTokens === undefined ? {} : { maxTokens: input.maxTokens }),
    ...(input.providerOptions === undefined ? {} : { providerOptions: input.providerOptions }),
    ...(input.maxModelRetries === undefined
      ? { maxModelRetries: 1 }
      : { maxModelRetries: input.maxModelRetries }),
    ...(input.maxToolRetries === undefined
      ? { maxToolRetries: 1 }
      : { maxToolRetries: input.maxToolRetries }),
    tools: makeShopperTools(input.webSearch),
    ...(input.onEvent === undefined ? {} : { onEvent: input.onEvent }),
    ...(input.now === undefined ? {} : { now: input.now }),
    ...(input.createRunId === undefined ? {} : { createRunId: input.createRunId }),
  };
}
