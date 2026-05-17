import { Data } from "effect";

export type DatabaseOperation =
  | "batch"
  | "delete"
  | "execute"
  | "insert"
  | "migrate"
  | "select"
  | "transaction"
  | "update";

export class DatabaseError extends Data.TaggedError("DatabaseError")<{
  readonly operation: DatabaseOperation;
  readonly table: string | undefined;
  readonly cause: unknown;
}> {}

export function databaseError(input: {
  readonly operation: DatabaseOperation;
  readonly table?: string;
  readonly cause: unknown;
}): DatabaseError {
  return new DatabaseError({
    operation: input.operation,
    table: input.table,
    cause: input.cause,
  });
}
