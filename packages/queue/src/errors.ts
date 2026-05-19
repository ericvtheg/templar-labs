import { Data } from "effect";

export type QueueStorageOperation = "send" | "sendBatch" | "ack" | "retry";
export type QueueSerializationOperation = "serialize" | "deserialize";
export type QueueOperation = QueueStorageOperation | QueueSerializationOperation;

export class QueueStorageError extends Data.TaggedError("QueueStorageError")<{
  readonly operation: QueueStorageOperation;
  readonly messageId: string | undefined;
  readonly cause: unknown;
}> {}

export class QueueSerializationError extends Data.TaggedError("QueueSerializationError")<{
  readonly operation: QueueSerializationOperation;
  readonly messageId: string | undefined;
  readonly cause: unknown;
}> {}

export type QueueError = QueueStorageError | QueueSerializationError;
