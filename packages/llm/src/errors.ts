import { Data } from "effect";
import type { LLMUsage } from "./types.ts";

export type LLMOperation = "generateTurn" | "generateText" | "generateObject";

export class LLMValidationError extends Data.TaggedError("LLMValidationError")<{
  readonly message: string;
  readonly field?: string;
  readonly cause?: unknown;
}> {}

export class LLMProviderError extends Data.TaggedError("LLMProviderError")<{
  readonly provider: string;
  readonly operation: LLMOperation;
  readonly model?: string;
  readonly status?: number;
  readonly requestId?: string;
  readonly message: string;
  readonly cause?: unknown;
}> {}

export class LLMRateLimitError extends Data.TaggedError("LLMRateLimitError")<{
  readonly provider: string;
  readonly operation: LLMOperation;
  readonly model?: string;
  readonly status?: number;
  readonly requestId?: string;
  readonly message: string;
  readonly cause?: unknown;
}> {}

export class LLMParseError extends Data.TaggedError("LLMParseError")<{
  readonly operation: "generateObject";
  readonly model: string;
  readonly provider?: string;
  readonly text: string;
  readonly usage?: LLMUsage;
  readonly raw?: unknown;
  readonly message: string;
  readonly cause?: unknown;
}> {}

export class LLMSchemaError extends Data.TaggedError("LLMSchemaError")<{
  readonly operation: "generateObject";
  readonly message: string;
  readonly cause?: unknown;
}> {}

export type LLMError =
  | LLMValidationError
  | LLMProviderError
  | LLMRateLimitError
  | LLMParseError
  | LLMSchemaError;
