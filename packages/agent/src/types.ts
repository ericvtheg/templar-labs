import type { LLMMessage, LLMService, LLMToolCall, LLMUsage } from "@templar/llm";
import type { AgentFailure } from "./errors.ts";
import type { AgentConfigSnapshot, AgentEvent } from "./events.ts";
import type { AgentTool } from "./tool.ts";
import type { AgentTrace } from "./trace.ts";

export type AgentStatus = "running" | "waiting_for_input" | "completed" | "failed" | "cancelled";

export type AgentUsage = {
  readonly modelTurns: number;
  readonly toolCalls: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
  readonly llmCostUsd: number;
  readonly toolCostUsd: number;
  readonly totalCostUsd: number;
  readonly durationMs: number;
};

export type AgentCompletion = { readonly kind: "completion"; readonly text: string };
export type AgentSuspension = {
  readonly kind: "suspension";
  readonly toolCallId: string;
  readonly toolName: string;
  readonly request: unknown;
};
export type AgentOutcome = AgentCompletion | AgentSuspension;

export type AgentRun = {
  readonly id: string;
  readonly status: AgentStatus;
  readonly config: AgentConfigSnapshot;
  readonly messages: ReadonlyArray<LLMMessage>;
  readonly events: ReadonlyArray<AgentEvent>;
  readonly trace: AgentTrace;
  readonly usage: AgentUsage;
  readonly outcome?: AgentOutcome;
  readonly failure?: AgentFailure;
  readonly pendingToolCall?: LLMToolCall;
  readonly startedAt: string;
};

export type AgentConfig = {
  readonly llm: LLMService;
  readonly model: string;
  readonly finalizationModel?: string;
  readonly reasoning?: unknown;
  readonly temperature?: number;
  readonly toolChoice?: unknown;
  readonly parallelToolCalls?: boolean;
  readonly instructions: string;
  readonly instructionsVersion: string;
  readonly finalizationInstructions?: string;
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
  readonly tools: ReadonlyArray<AgentTool>;
  readonly now?: () => number;
  readonly createRunId?: () => string;
  readonly onEvent?: (event: AgentEvent) => void;
};

export type StartAgentInput = {
  readonly messages: ReadonlyArray<LLMMessage>;
  readonly runId?: string;
};

export type ContinueAgentInput = {
  readonly run: AgentRun;
  readonly toolResult: unknown;
};

export type AgentService = {
  readonly start: (input: StartAgentInput) => import("effect").Effect.Effect<AgentRun>;
  readonly continue: (input: ContinueAgentInput) => import("effect").Effect.Effect<AgentRun>;
};

export function emptyUsage(): AgentUsage {
  return {
    modelTurns: 0,
    toolCalls: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    llmCostUsd: 0,
    toolCostUsd: 0,
    totalCostUsd: 0,
    durationMs: 0,
  };
}

export function addLLMUsage(usage: AgentUsage, llmUsage?: LLMUsage): AgentUsage {
  return {
    ...usage,
    modelTurns: usage.modelTurns + 1,
    inputTokens: usage.inputTokens + (llmUsage?.inputTokens ?? 0),
    outputTokens: usage.outputTokens + (llmUsage?.outputTokens ?? 0),
    totalTokens: usage.totalTokens + (llmUsage?.totalTokens ?? 0),
    llmCostUsd: addUsd(usage.llmCostUsd, llmUsage?.costUsd ?? 0),
    totalCostUsd: addUsd(usage.totalCostUsd, llmUsage?.costUsd ?? 0),
  };
}

export function addUsd(left: number, right: number): number {
  return Math.round((left + right) * 1_000_000_000_000) / 1_000_000_000_000;
}
