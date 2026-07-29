export { makeShopperAgent } from "./agent.ts";
export {
  defaultShopperFinalizationModel,
  defaultShopperHardCostLimitUsd,
  defaultShopperModel,
  defaultShopperSoftCostLimitUsd,
  resolveShopperAgentConfig,
  type ShopperAgentConfig,
} from "./config.ts";
export {
  disciplinedResearchInstructions,
  disciplinedResearchInstructionsVersion,
  genericResearchInstructions,
  genericResearchInstructionsVersion,
  shopperFinalizationInstructions,
  shopperInstructions,
  shopperInstructionsVersion,
} from "./instructions.ts";
export * from "./tools/index.ts";
export type {
  ContinueShoppingInput,
  ShopperAgent,
  ShopperCitation,
  ShopperOutcome,
  ShopperRun,
  StartShoppingInput,
} from "./types.ts";
