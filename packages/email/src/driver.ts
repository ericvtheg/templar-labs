import type { Effect } from "effect";
import type { EmailProviderError } from "./errors.ts";
import type { ResolvedSendEmailInput, SendEmailResult } from "./types.ts";

export type EmailDriver = {
  readonly send: (
    input: ResolvedSendEmailInput,
  ) => Effect.Effect<SendEmailResult, EmailProviderError>;
};
