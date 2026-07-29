import type { AgentRun, AgentToolOutput } from "@templar/agent";
import type { LLMService } from "@templar/llm";
import type { WebSearchService } from "@templar/web-search";
import { Effect } from "effect";
import {
  disciplinedResearchInstructions,
  disciplinedResearchInstructionsVersion,
  genericResearchInstructions,
  genericResearchInstructionsVersion,
  makeShopperAgent,
  shopperInstructions,
  shopperInstructionsVersion,
} from "your-shopper-agent";
import type { EvaluationStrategy, EvaluationStrategyResult } from "../types.ts";

export type OwnedStrategyOptions = {
  readonly llm: LLMService;
  readonly webSearch: WebSearchService;
  readonly model: string;
  readonly finalizationModel?: string;
  readonly reasoning?: unknown;
  readonly temperature?: number;
  readonly toolChoice?: unknown;
  readonly parallelToolCalls?: boolean;
  readonly maxModelTurns: number;
  readonly maxToolCalls: number;
  readonly maxConcurrentTools?: number;
  readonly maxDurationMs?: number;
  readonly softCostLimitUsd?: number;
  readonly hardCostLimitUsd?: number;
  readonly maxTokens?: number;
  readonly providerOptions?: Readonly<Record<string, unknown>>;
  readonly maxModelRetries?: number;
  readonly maxToolRetries?: number;
};

const legacyShopperInstructionsV1 = `You are Your Shopper, a purchasing research agent. Your goal is to find the best available fit for this specific user, not merely a popular product.

Infer a request-specific definition of value. Distinguish hard requirements from preferences, and consider price, total acquisition cost, quality, compatibility, availability, risk, and alternative acquisition strategies when they matter to this request.

Use web search broadly or precisely as warranted. Fetch source contents when snippets are insufficient. Verify material claims and current price or availability where possible. Prefer direct and authoritative sources for decision-critical facts. Never present an unknown fact as known.

Call ask_user only when one missing answer can materially change the research or available recommendation. Ask one focused question at a time; do not interrogate the user or ask ceremonial questions.

Continue researching while another call has meaningful expected decision value. Stop when marginal value is low relative to the remaining budget. Your final response must make an actionable recommendation, explain important tradeoffs and uncertainty, and include direct source URLs for claims the user may need to verify.`;

export function yourShopperStrategy(options: OwnedStrategyOptions): EvaluationStrategy {
  return ownedStrategy("your-shopper", shopperInstructionsVersion, undefined, options);
}

export function legacyShopperStrategy(options: OwnedStrategyOptions): EvaluationStrategy {
  return ownedStrategy(
    "legacy-shopper-v1",
    "your-shopper-v1",
    legacyShopperInstructionsV1,
    options,
  );
}

export function genericAgentStrategy(options: OwnedStrategyOptions): EvaluationStrategy {
  return ownedStrategy(
    "generic-owned-agent",
    genericResearchInstructionsVersion,
    genericResearchInstructions,
    options,
  );
}

export function disciplinedAgentStrategy(options: OwnedStrategyOptions): EvaluationStrategy {
  return ownedStrategy(
    "disciplined-generic-agent",
    disciplinedResearchInstructionsVersion,
    disciplinedResearchInstructions,
    options,
  );
}

function ownedStrategy(
  id: string,
  instructionsVersion: string,
  instructions: string | undefined,
  options: OwnedStrategyOptions,
): EvaluationStrategy {
  const reasoning = options.reasoning ?? { effort: "high" };
  const toolChoice = options.toolChoice ?? "required";
  const parallelToolCalls = options.parallelToolCalls ?? true;
  const maxConcurrentTools = options.maxConcurrentTools ?? 4;
  const maxDurationMs = options.maxDurationMs ?? 180_000;
  const hardCostLimitUsd = options.hardCostLimitUsd ?? 1;
  const maxModelRetries = options.maxModelRetries ?? 1;
  const maxToolRetries = options.maxToolRetries ?? 1;
  const effectiveInstructions = instructions ?? shopperInstructions;
  const agent = makeShopperAgent({
    llm: options.llm,
    webSearch: options.webSearch,
    model: options.model,
    ...(options.finalizationModel === undefined
      ? {}
      : { finalizationModel: options.finalizationModel }),
    reasoning,
    ...(options.temperature === undefined ? {} : { temperature: options.temperature }),
    toolChoice,
    parallelToolCalls,
    instructions: effectiveInstructions,
    instructionsVersion,
    maxModelTurns: options.maxModelTurns,
    maxToolCalls: options.maxToolCalls,
    maxConcurrentTools,
    maxDurationMs,
    ...(options.softCostLimitUsd === undefined
      ? {}
      : { softCostLimitUsd: options.softCostLimitUsd }),
    hardCostLimitUsd,
    ...(options.maxTokens === undefined ? {} : { maxTokens: options.maxTokens }),
    ...(options.providerOptions === undefined ? {} : { providerOptions: options.providerOptions }),
    maxModelRetries,
    maxToolRetries,
  });
  return {
    id,
    model: options.model,
    ...(options.finalizationModel === undefined
      ? {}
      : { finalizationModel: options.finalizationModel }),
    reasoning,
    ...(options.temperature === undefined ? {} : { temperature: options.temperature }),
    toolChoice,
    parallelToolCalls,
    instructionsVersion,
    instructions: effectiveInstructions,
    tools: ["web_search", "get_web_contents", "ask_user"],
    maxModelTurns: options.maxModelTurns,
    maxToolCalls: options.maxToolCalls,
    maxConcurrentTools,
    maxDurationMs,
    ...(options.softCostLimitUsd === undefined
      ? {}
      : { softCostLimitUsd: options.softCostLimitUsd }),
    hardCostLimitUsd,
    ...(options.maxTokens === undefined ? {} : { maxTokens: options.maxTokens }),
    ...(options.providerOptions === undefined ? {} : { providerOptions: options.providerOptions }),
    maxModelRetries,
    maxToolRetries,
    runner: (evaluationCase) => {
      const initial = agent.start({
        intent: evaluationCase.intent,
        ...(evaluationCase.context === undefined ? {} : { context: evaluationCase.context }),
      });
      const completed = Effect.flatMap(initial, (run) =>
        evaluationCase.track === "end_to_end" &&
        run.status === "waiting_for_input" &&
        evaluationCase.hiddenContext !== undefined
          ? agent.continue({ run, message: evaluationCase.hiddenContext })
          : Effect.succeed(run),
      );
      return Effect.map(completed, (run): EvaluationStrategyResult => {
        const output = run.outcome?.text ?? run.agentRun.failure?.message ?? "No output";
        return {
          status:
            run.status === "waiting_for_input"
              ? "waiting_for_input"
              : run.status === "completed"
                ? "completed"
                : "failed",
          output,
          citations: run.outcome?.kind === "answer" ? run.outcome.citations : [],
          candidates: candidatesFromRun(run.agentRun),
          usage: {
            aiCostUsd: run.usage.llmCostUsd,
            searchCostUsd: run.usage.toolCostUsd,
            totalCostUsd: run.usage.totalCostUsd,
            durationMs: run.usage.durationMs,
            modelTurns: run.usage.modelTurns,
            toolCalls: run.usage.toolCalls,
          },
          trace: run.agentRun.trace,
          raw: run.agentRun,
          ...(run.agentRun.failure === undefined ? {} : { failure: run.agentRun.failure }),
        };
      });
    },
  };
}

function candidatesFromRun(
  run: AgentRun,
): ReadonlyArray<{ readonly url: string; readonly title?: string }> {
  const candidates = new Map<string, { readonly url: string; readonly title?: string }>();
  for (const toolCall of run.trace.toolCalls) {
    const output = toolCall.output as AgentToolOutput | undefined;
    if (output?.kind !== "result") {
      continue;
    }
    for (const candidate of candidatesFromValue(output.value)) {
      candidates.set(candidate.url, candidate);
    }
  }
  return [...candidates.values()];
}

function candidatesFromValue(
  value: unknown,
): ReadonlyArray<{ readonly url: string; readonly title?: string }> {
  if (typeof value !== "object" || value === null || !("results" in value)) {
    return [];
  }
  const results = (value as { readonly results?: unknown }).results;
  if (!Array.isArray(results)) {
    return [];
  }
  return results.flatMap((result: unknown) => {
    if (typeof result !== "object" || result === null || !("url" in result)) {
      return [];
    }
    const url = result.url;
    if (typeof url !== "string") {
      return [];
    }
    const title = "title" in result ? result.title : undefined;
    return [typeof title === "string" ? { url, title } : { url }];
  });
}
