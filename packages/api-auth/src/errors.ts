import { Data } from "effect";

export class ApiAuthConfigError extends Data.TaggedError("ApiAuthConfigError")<{
  readonly field: string;
  readonly message: string;
}> {}

export class ApiAuthInputError extends Data.TaggedError("ApiAuthInputError")<{
  readonly field: string;
  readonly message: string;
}> {}

export class ApiAuthStorageError extends Data.TaggedError("ApiAuthStorageError")<{
  readonly operation: string;
  readonly cause: unknown;
}> {}

export class ApiAuthAccessError extends Data.TaggedError("ApiAuthAccessError")<{
  readonly reason: "key-limit-reached" | "key-not-found";
}> {}

export type ApiAuthError =
  | ApiAuthConfigError
  | ApiAuthInputError
  | ApiAuthStorageError
  | ApiAuthAccessError;
