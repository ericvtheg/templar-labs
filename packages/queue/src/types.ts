import type { Effect } from "effect";
import type { QueueStorageError } from "./errors.ts";

export type QueueMetadata = Readonly<Record<string, string>>;

export type QueueSendOptions = {
  readonly delaySeconds?: number;
  readonly metadata?: QueueMetadata;
};

export type QueueMessageInput<A> = QueueSendOptions & {
  readonly body: A;
};

export type QueueSendMetrics = {
  readonly backlogCount: number;
  readonly backlogBytes: number;
  readonly oldestMessageTimestamp: Date | undefined;
};

export type QueueSendResult = {
  readonly metrics: QueueSendMetrics;
};

export type QueueSendBatchResult = {
  readonly metrics: QueueSendMetrics;
};

export type QueueStoredMessage = {
  readonly id: string;
  readonly body: string;
  readonly attempts: number;
  readonly timestamp: Date | undefined;
  readonly metadata: QueueMetadata | undefined;
  readonly ack: Effect.Effect<void, QueueStorageError>;
  readonly retry: (options?: QueueRetryOptions) => Effect.Effect<void, QueueStorageError>;
};

export type QueueMessage<A> = {
  readonly id: string;
  readonly body: A;
  readonly attempts: number;
  readonly timestamp: Date | undefined;
  readonly metadata: QueueMetadata | undefined;
};

export type QueueDriverSendInput = QueueSendOptions & {
  readonly body: string;
};

export type QueueRetryOptions = {
  readonly delaySeconds?: number;
};
