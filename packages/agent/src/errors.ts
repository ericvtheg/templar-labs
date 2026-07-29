import { Data } from "effect";

export class AgentToolError extends Data.TaggedError("AgentToolError")<{
  readonly tool: string;
  readonly code: string;
  readonly message: string;
  readonly recoverable: boolean;
  readonly retryable?: boolean;
  readonly cause?: unknown;
}> {}

export class AgentConfigurationError extends Data.TaggedError("AgentConfigurationError")<{
  readonly field: string;
  readonly message: string;
  readonly cause?: unknown;
}> {}

export type AgentFailure = {
  readonly code:
    | "configuration"
    | "model"
    | "tool"
    | "model_turn_limit"
    | "hard_cost_limit"
    | "duration_limit";
  readonly message: string;
  readonly cause?: unknown;
};
