import { Data } from "effect";

export type BlobOperation = "get" | "head" | "put" | "delete" | "list" | "read";

export class BlobStorageError extends Data.TaggedError("BlobStorageError")<{
  readonly operation: BlobOperation;
  readonly key: string | undefined;
  readonly cause: unknown;
}> {}

export class BlobNotFoundError extends Data.TaggedError("BlobNotFoundError")<{
  readonly key: string;
}> {}

export type BlobError = BlobStorageError | BlobNotFoundError;
