import { type Context, Effect, type Layer } from "effect";
import { type QueueDriver, tryQueueProviderPromise } from "../driver.ts";
import {
  makeQueueLayer,
  makeQueueLayerFor,
  makeQueueService,
  type QueueService,
} from "../service.ts";
import type { QueueDriverSendInput } from "../types.ts";

export type CloudflareQueueSendOptions = {
  readonly contentType: "text";
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
    messages: Iterable<CloudflareQueueBatchMessage>,
  ) => Promise<CloudflareQueueSendBatchResponse>;
};

export function makeCloudflareQueue<Body = unknown>(
  queue: CloudflareQueueLike,
): QueueService<Body> {
  const driver = {
    send: (input: QueueDriverSendInput) =>
      tryQueueProviderPromise({
        provider: "cloudflare",
        operation: "send",
        try: () => queue.send(input.body, cloudflareSendOptions(input)),
      }).pipe(Effect.asVoid),
    sendBatch: (inputs: ReadonlyArray<QueueDriverSendInput>) =>
      tryQueueProviderPromise({
        provider: "cloudflare",
        operation: "sendBatch",
        try: () => queue.sendBatch(inputs.map(cloudflareBatchMessage)),
      }).pipe(Effect.asVoid),
  } satisfies QueueDriver;

  return makeQueueService({
    provider: "cloudflare",
    driver,
  });
}

export const makeQueue = makeCloudflareQueue;

export function cloudflareQueueLayer<Body = unknown>(queue: CloudflareQueueLike) {
  return makeQueueLayer(makeCloudflareQueue<Body>(queue));
}

export const queueLayer = cloudflareQueueLayer;

export function cloudflareQueueLayerFor<Id, Body>(
  tag: Context.Tag<Id, QueueService<Body>>,
  queue: CloudflareQueueLike,
): Layer.Layer<Id> {
  return makeQueueLayerFor(tag, makeCloudflareQueue<Body>(queue));
}

export const queueLayerFor = cloudflareQueueLayerFor;

function cloudflareSendOptions(input: QueueDriverSendInput): CloudflareQueueSendOptions {
  return {
    contentType: "text",
    ...(input.delaySeconds === undefined ? {} : { delaySeconds: input.delaySeconds }),
  };
}

function cloudflareBatchMessage(input: QueueDriverSendInput): CloudflareQueueBatchMessage {
  return {
    body: input.body,
    contentType: "text",
    ...(input.delaySeconds === undefined ? {} : { delaySeconds: input.delaySeconds }),
  };
}
