import type { LLMUsage } from "@templar/llm";
import type { AgentFailure } from "./errors.ts";

export type AgentEventBase = {
  readonly runId: string;
  readonly sequence: number;
  readonly timestamp: string;
};

export type AgentEvent = AgentEventBase &
  (
    | { readonly type: "run.started"; readonly config: AgentConfigSnapshot }
    | { readonly type: "model.turn.started"; readonly turn: number }
    | {
        readonly type: "model.turn.completed";
        readonly turn: number;
        readonly model: string;
        readonly durationMs: number;
        readonly usage?: LLMUsage;
        readonly finishReason?: string;
      }
    | {
        readonly type: "tool.call.started";
        readonly callId: string;
        readonly tool: string;
      }
    | {
        readonly type: "tool.call.completed";
        readonly callId: string;
        readonly tool: string;
        readonly durationMs: number;
        readonly costUsd?: number;
      }
    | {
        readonly type: "tool.call.failed";
        readonly callId: string;
        readonly tool: string;
        readonly durationMs: number;
        readonly code: string;
        readonly recoverable: boolean;
      }
    | { readonly type: "run.waiting_for_input"; readonly request: unknown }
    | { readonly type: "run.completed"; readonly durationMs: number }
    | { readonly type: "run.failed"; readonly durationMs: number; readonly failure: AgentFailure }
    | { readonly type: "run.cancelled"; readonly durationMs: number }
  );

export type AgentEventInput = AgentEvent extends infer Event
  ? Event extends AgentEvent
    ? Omit<Event, keyof AgentEventBase>
    : never
  : never;

export type AgentConfigSnapshot = {
  readonly model: string;
  readonly finalizationModel?: string;
  readonly reasoning?: unknown;
  readonly temperature?: number;
  readonly toolChoice?: unknown;
  readonly parallelToolCalls: boolean;
  readonly instructions: string;
  readonly instructionsVersion: string;
  readonly finalizationInstructions: string;
  readonly maxModelTurns: number;
  readonly maxToolCalls: number;
  readonly maxConcurrentTools: number;
  readonly maxDurationMs?: number;
  readonly softCostLimitUsd?: number;
  readonly hardCostLimitUsd?: number;
  readonly maxTokens?: number;
  readonly providerOptions?: Readonly<Record<string, unknown>>;
  readonly maxModelRetries: number;
  readonly maxToolRetries: number;
  readonly tools: ReadonlyArray<{
    readonly name: string;
    readonly description: string;
    readonly inputSchema: Readonly<Record<string, unknown>>;
  }>;
};
