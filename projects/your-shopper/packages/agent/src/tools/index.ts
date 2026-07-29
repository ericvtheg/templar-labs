import type { AgentTool } from "@templar/agent";
import type { WebSearchService } from "@templar/web-search";
import { makeAskUserTool } from "./ask-user.ts";
import { makeGetWebContentsTool } from "./get-web-contents.ts";
import { makeWebSearchTool } from "./web-search.ts";

export function makeShopperTools(service: WebSearchService): ReadonlyArray<AgentTool> {
  return [makeWebSearchTool(service), makeGetWebContentsTool(service), makeAskUserTool()];
}

export { askUserToolSchema, makeAskUserTool } from "./ask-user.ts";
export {
  getWebContentsToolSchema,
  makeGetWebContentsTool,
} from "./get-web-contents.ts";
export { makeWebSearchTool, webSearchToolError, webSearchToolSchema } from "./web-search.ts";
