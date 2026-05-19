import { Effect } from "effect";
import { type QueueDriver, tryQueueStorage, tryQueueStoragePromise } from "../driver.ts";
import { makeQueueLayer, makeQueueService, type QueueService } from "../service.ts";
import type {
  QueueDriverSendInput,
  QueueRetryOptions,
  QueueSendBatchResult,
  QueueSendMetrics,
  QueueSendResult,
  QueueStoredMessage,
} from "../types.ts";

export type CloudflareQueueSendOptions = {
  readonly delaySeconds?: number;
};

export type CloudflareQueueBatchMessage = {
  readonly body: string;
  readonly contentType?: "text";
  readonly delaySeconds?: number;
};

export type CloudflareQueueSendMetrics = {
  readonly backlogCount: number;
  readonly backlogBytes: number;
  readonly oldestMessageTimestamp?: Date;
};

export type CloudflareQueueSendResponse = {
  readonly metadata: {
    readonly metrics: CloudflareQueueSendMetrics;
  };
};

export type CloudflareQueueSendBatchResponse = {
  readonly metadata: {
    readonly metrics: CloudflareQueueSendMetrics;
  };
};

export type CloudflareQueueLike = {
  readonly send: (
    body: string,
    options?: CloudflareQueueSendOptions,
  ) => Promise<CloudflareQueueSendResponse>;
  readonly sendBatch: (
    messages: ReadonlyArray<CloudflareQueueBatchMessage>,
  ) => Promise<CloudflareQueueSendBatchResponse>;
};

export type CloudflareQueueMessageRetryOptions = {
  readonly delaySeconds?: number;
};

export type CloudflareQueueMessageLike = {
  readonly id: string;
  readonly body: string;
  readonly attempts: number;
  readonly timestamp?: Date;
  readonly ack: () => void;
  readonly retry: (options?: CloudflareQueueMessageRetryOptions) => void;
};

export function makeCloudflareQueue(queue: CloudflareQueueLike): QueueService {
  const driver = {
    send: (input: QueueDriverSendInput) =>
      tryQueueStoragePromise({
        operation: "send",
        try: () => queue.send(input.body, cloudflareSendOptions(input)),
      }).pipe(Effect.map(normalizeSendResult)),
    sendBatch: (inputs: ReadonlyArray<QueueDriverSendInput>) =>
      tryQueueStoragePromise({
        operation: "sendBatch",
        try: () => queue.sendBatch(inputs.map(cloudflareBatchMessage)),
      }).pipe(Effect.map(normalizeSendBatchResult)),
    ack: (message: QueueStoredMessage) => message.ack,
    retry: (message: QueueStoredMessage, options?: QueueRetryOptions) => message.retry(options),
  } satisfies QueueDriver;

  return makeQueueService({
    provider: "cloudflare",
    driver,
  });
}

export const makeQueue = makeCloudflareQueue;

export function cloudflareQueueLayer(queue: CloudflareQueueLike) {
  return makeQueueLayer(makeCloudflareQueue(queue));
}

export const queueLayer = cloudflareQueueLayer;

export function cloudflareQueueMessage(message: CloudflareQueueMessageLike): QueueStoredMessage {
  return {
    id: message.id,
    body: message.body,
    attempts: message.attempts,
    timestamp: message.timestamp,
    metadata: undefined,
    ack: tryQueueStorage({
      operation: "ack",
      messageId: message.id,
      try: () => {
        message.ack();
      },
    }),
    retry: (options?: QueueRetryOptions) =>
      tryQueueStorage({
        operation: "retry",
        messageId: message.id,
        try: () => {
          message.retry(cloudflareRetryOptions(options));
        },
      }),
  };
}

function cloudflareSendOptions(
  input: QueueDriverSendInput,
): CloudflareQueueSendOptions | undefined {
  if (input.delaySeconds === undefined) {
    return undefined;
  }

  return {
    delaySeconds: input.delaySeconds,
  };
}

function cloudflareBatchMessage(input: QueueDriverSendInput): CloudflareQueueBatchMessage {
  return {
    body: input.body,
    contentType: "text",
    ...(input.delaySeconds === undefined ? {} : { delaySeconds: input.delaySeconds }),
  };
}

function normalizeSendResult(response: CloudflareQueueSendResponse): QueueSendResult {
  return {
    metrics: normalizeSendMetrics(response.metadata.metrics),
  };
}

function normalizeSendBatchResult(
  response: CloudflareQueueSendBatchResponse,
): QueueSendBatchResult {
  return {
    metrics: normalizeSendMetrics(response.metadata.metrics),
  };
}

function normalizeSendMetrics(metrics: CloudflareQueueSendMetrics): QueueSendMetrics {
  return {
    backlogCount: metrics.backlogCount,
    backlogBytes: metrics.backlogBytes,
    oldestMessageTimestamp: metrics.oldestMessageTimestamp,
  };
}

function cloudflareRetryOptions(
  options: QueueRetryOptions | undefined,
): CloudflareQueueMessageRetryOptions | undefined {
  if (options?.delaySeconds === undefined) {
    return undefined;
  }

  return {
    delaySeconds: options.delaySeconds,
  };
}
