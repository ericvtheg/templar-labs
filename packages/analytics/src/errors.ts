import { Data } from "effect";

export type AnalyticsOperation = "track" | "identify";

export class AnalyticsValidationError extends Data.TaggedError("AnalyticsValidationError")<{
  readonly operation: AnalyticsOperation;
  readonly field: string;
  readonly message: string;
  readonly cause?: unknown;
}> {}

export class AnalyticsProviderError extends Data.TaggedError("AnalyticsProviderError")<{
  readonly provider: string;
  readonly operation: AnalyticsOperation;
  readonly status?: number;
  readonly message: string;
  readonly cause?: unknown;
}> {}

export type AnalyticsError = AnalyticsValidationError | AnalyticsProviderError;
