import { Data } from "effect";

export type AIOperation = "generateText" | "generateObject";

export class AIValidationError extends Data.TaggedError("AIValidationError")<{
  readonly message: string;
  readonly field?: string;
  readonly cause?: unknown;
}> {}

export class AIProviderError extends Data.TaggedError("AIProviderError")<{
  readonly provider: string;
  readonly operation: AIOperation;
  readonly model?: string;
  readonly status?: number;
  readonly requestId?: string;
  readonly message: string;
  readonly cause?: unknown;
}> {}

export class AIRateLimitError extends Data.TaggedError("AIRateLimitError")<{
  readonly provider: string;
  readonly operation: AIOperation;
  readonly model?: string;
  readonly status?: number;
  readonly requestId?: string;
  readonly message: string;
  readonly cause?: unknown;
}> {}

export class AIParseError extends Data.TaggedError("AIParseError")<{
  readonly operation: "generateObject";
  readonly model: string;
  readonly text: string;
  readonly message: string;
  readonly cause?: unknown;
}> {}

export class AISchemaError extends Data.TaggedError("AISchemaError")<{
  readonly operation: "generateObject";
  readonly message: string;
  readonly cause?: unknown;
}> {}

export type AIError =
  | AIValidationError
  | AIProviderError
  | AIRateLimitError
  | AIParseError
  | AISchemaError;
