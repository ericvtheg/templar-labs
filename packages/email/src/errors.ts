import { Data } from "effect";

export type EmailOperation = "send";

export class EmailValidationError extends Data.TaggedError("EmailValidationError")<{
  readonly field: string;
  readonly message: string;
  readonly cause?: unknown;
}> {}

export class EmailProviderError extends Data.TaggedError("EmailProviderError")<{
  readonly provider: string;
  readonly operation: EmailOperation;
  readonly message: string;
  readonly code?: string;
  readonly cause?: unknown;
}> {}

export type EmailError = EmailValidationError | EmailProviderError;
