import type { AgentUsage } from "@templar/agent";
import { makeLLM } from "@templar/llm";
import { makeWebSearch } from "@templar/web-search";
import { Effect } from "effect";
import { makeShopperAgent, type ShopperRun } from "your-shopper-agent";

export type CreateShoppingRunInput = {
  readonly intent: string;
  readonly context?: string;
};

export class ShoppingApiInputError extends Error {
  readonly code = "invalid-request";
}

export function parseCreateShoppingRunInput(value: unknown): CreateShoppingRunInput {
  if (typeof value !== "object" || value === null) {
    throw new ShoppingApiInputError("The request body must be a JSON object.");
  }

  const input = value as { readonly intent?: unknown; readonly context?: unknown };
  if (typeof input.intent !== "string" || input.intent.trim() === "") {
    throw new ShoppingApiInputError("intent must be a non-empty string.");
  }
  if (input.context !== undefined && typeof input.context !== "string") {
    throw new ShoppingApiInputError("context must be a string when provided.");
  }

  return {
    intent: input.intent.trim(),
    ...(input.context === undefined || input.context.trim() === ""
      ? {}
      : { context: input.context.trim() }),
  };
}

export async function createShoppingRun(
  input: CreateShoppingRunInput,
  siteUrl: string,
  signal?: AbortSignal,
): Promise<ShopperRun> {
  const { env } = await import("cloudflare:workers");
  const bindings = env as unknown as {
    readonly EXA_API_KEY: string;
    readonly OPENROUTER_API_TOKEN: string;
  };
  const shopper = makeShopperAgent({
    llm: makeLLM({
      apiKey: bindings.OPENROUTER_API_TOKEN,
      appName: "Your Shopper",
      siteUrl,
    }),
    webSearch: makeWebSearch({ apiKey: bindings.EXA_API_KEY }),
  });

  return Effect.runPromise(shopper.start(input), signal === undefined ? undefined : { signal });
}

export function shoppingRunResponse(run: ShopperRun): {
  readonly body: ShoppingRunResponse;
  readonly status: number;
} {
  const usage = publicUsage(run.usage);

  if (run.status === "completed" && run.outcome?.kind === "answer") {
    return {
      status: 200,
      body: {
        id: run.id,
        status: run.status,
        outcome: {
          kind: "answer",
          text: run.outcome.text,
          citations: run.outcome.citations,
        },
        usage,
      },
    };
  }

  if (run.status === "waiting_for_input" && run.outcome?.kind === "question") {
    return {
      status: 200,
      body: {
        id: run.id,
        status: run.status,
        outcome: { kind: "question", text: run.outcome.text },
        usage,
      },
    };
  }

  return {
    status: 502,
    body: {
      id: run.id,
      status: "failed",
      error: {
        code: run.agentRun.failure?.code ?? "run-failed",
        message: "Shopping research could not be completed.",
      },
      usage,
    },
  };
}

export type ShoppingRunResponse =
  | {
      readonly id: string;
      readonly status: "completed";
      readonly outcome: {
        readonly kind: "answer";
        readonly text: string;
        readonly citations: ReadonlyArray<{ readonly url: string; readonly title?: string }>;
      };
      readonly usage: PublicAgentUsage;
    }
  | {
      readonly id: string;
      readonly status: "waiting_for_input";
      readonly outcome: { readonly kind: "question"; readonly text: string };
      readonly usage: PublicAgentUsage;
    }
  | {
      readonly id: string;
      readonly status: "failed";
      readonly error: { readonly code: string; readonly message: string };
      readonly usage: PublicAgentUsage;
    };

type PublicAgentUsage = Pick<
  AgentUsage,
  "modelTurns" | "toolCalls" | "totalTokens" | "totalCostUsd" | "durationMs"
>;

function publicUsage(usage: AgentUsage): PublicAgentUsage {
  return {
    modelTurns: usage.modelTurns,
    toolCalls: usage.toolCalls,
    totalTokens: usage.totalTokens,
    totalCostUsd: usage.totalCostUsd,
    durationMs: usage.durationMs,
  };
}
