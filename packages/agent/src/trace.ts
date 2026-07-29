import type { GenerateTurnInput, GenerateTurnResult, LLMMessage, LLMToolCall } from "@templar/llm";
import type { AgentToolOutput } from "./tool.ts";

export type AgentModelTurnTrace = {
  readonly turn: number;
  readonly attempts: number;
  readonly startedAt: string;
  readonly durationMs: number;
  readonly request: GenerateTurnInput;
  readonly response?: GenerateTurnResult;
  readonly error?: unknown;
};

export type AgentToolCallTrace = {
  readonly call: LLMToolCall;
  readonly startedAt: string;
  readonly durationMs: number;
  readonly attempts: number;
  readonly parsedInput?: unknown;
  readonly output?: AgentToolOutput;
  readonly error?: unknown;
};

export type AgentTrace = {
  readonly initialMessages: ReadonlyArray<LLMMessage>;
  readonly modelTurns: ReadonlyArray<AgentModelTurnTrace>;
  readonly toolCalls: ReadonlyArray<AgentToolCallTrace>;
};
