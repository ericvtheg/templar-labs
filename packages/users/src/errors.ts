import { Data } from "effect";

export class UsersStorageError extends Data.TaggedError("UsersStorageError")<{
  readonly operation: "ensure-user";
  readonly cause: unknown;
}> {}
