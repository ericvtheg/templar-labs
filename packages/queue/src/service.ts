import { Context, Effect, Layer } from "effect";
import type { QueueDriver } from "./driver.ts";
import { type QueueError, QueueSerializationError } from "./errors.ts";
import { withQueueLogging } from "./logging.ts";
import type {
  QueueDelivery,
  QueueDriverSendInput,
  QueueMessage,
  QueueMessageInput,
  QueueMetadata,
} from "./types.ts";

type QueueEnvelope = {
  readonly body: unknown;
  readonly metadata?: QueueMetadata;
};

export type QueueService<Body = unknown> = {
  readonly send: (input: QueueMessageInput<Body>) => Effect.Effect<void, QueueError>;
  readonly sendBatch: (
    inputs: ReadonlyArray<QueueMessageInput<Body>>,
  ) => Effect.Effect<void, QueueError>;
  readonly consume: <A, E, R>(
    deliveries: Iterable<QueueDelivery>,
    handler: (message: QueueMessage<Body>) => Effect.Effect<A, E, R>,
  ) => Effect.Effect<void, E | QueueSerializationError, R>;
};

export const QUEUE_TAG_IDENTIFIER: unique symbol = Symbol("@templar/queue/QueueTagIdentifier");

export type QueueTagId<Body> = {
  readonly [QUEUE_TAG_IDENTIFIER]: Body;
};

export type QueueTag<Body> = Context.Tag<QueueTagId<Body>, QueueService<Body>> & {
  readonly send: (
    input: QueueMessageInput<Body>,
  ) => Effect.Effect<void, QueueError, QueueTagId<Body>>;
  readonly sendBatch: (
    inputs: ReadonlyArray<QueueMessageInput<Body>>,
  ) => Effect.Effect<void, QueueError, QueueTagId<Body>>;
  readonly consume: <A, E, R>(
    deliveries: Iterable<QueueDelivery>,
    handler: (message: QueueMessage<Body>) => Effect.Effect<A, E, R>,
  ) => Effect.Effect<void, E | QueueSerializationError, R | QueueTagId<Body>>;
};

export function makeQueueTag<Body>(identifier = "@templar/queue/Queue"): QueueTag<Body> {
  const tag = Context.GenericTag<QueueTagId<Body>, QueueService<Body>>(identifier);

  return Object.assign(tag, {
    send: Effect.serviceFunctionEffect(tag, (queue) => queue.send),
    sendBatch: Effect.serviceFunctionEffect(tag, (queue) => queue.sendBatch),
    consume: Effect.serviceFunctionEffect(tag, (queue) => queue.consume),
  });
}

export class Queue extends Context.Tag("@templar/queue/Queue")<Queue, QueueService<unknown>>() {
  static readonly send = Effect.serviceFunctionEffect(this, (queue) => queue.send);
  static readonly sendBatch = Effect.serviceFunctionEffect(this, (queue) => queue.sendBatch);
  static readonly consume = Effect.serviceFunctionEffect(this, (queue) => queue.consume);
}

export function makeQueueLayer<Body>(service: QueueService<Body>): Layer.Layer<Queue> {
  return Layer.succeed(Queue, service as QueueService<unknown>);
}

export function makeQueueLayerFor<Id, Body>(
  tag: Context.Tag<Id, QueueService<Body>>,
  service: QueueService<Body>,
): Layer.Layer<Id> {
  return Layer.succeed(tag, service);
}

export function makeQueueService<Body = unknown>(input: {
  readonly provider: string;
  readonly driver: QueueDriver;
}): QueueService<Body> {
  const service: QueueService<Body> = {
    send: makeSend(input.driver.send),
    sendBatch: makeSendBatch(input.driver.sendBatch),
    consume: (deliveries, handler) => consume(deliveries, handler),
  };

  return withQueueServiceLogging(input.provider, service);
}

function makeSend<Body>(send: QueueDriver["send"]): QueueService<Body>["send"] {
  return (input: QueueMessageInput<Body>) =>
    Effect.flatMap(serializeInput(input), (serialized) => send(serialized));
}

function makeSendBatch<Body>(sendBatch: QueueDriver["sendBatch"]): QueueService<Body>["sendBatch"] {
  return (inputs: ReadonlyArray<QueueMessageInput<Body>>) =>
    Effect.flatMap(Effect.forEach(inputs, serializeInput), (serialized) => sendBatch(serialized));
}

function serializeInput<A>(
  input: QueueMessageInput<A>,
): Effect.Effect<QueueDriverSendInput, QueueSerializationError> {
  return Effect.map(serializeEnvelope(input), (body) => ({
    body,
    ...(input.delaySeconds === undefined ? {} : { delaySeconds: input.delaySeconds }),
  }));
}

function serializeEnvelope<A>(
  input: QueueMessageInput<A>,
): Effect.Effect<string, QueueSerializationError> {
  return Effect.flatMap(serializeBody(input.body), (body) =>
    Effect.try({
      try: () =>
        JSON.stringify({
          body: JSON.parse(body) as unknown,
          ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
        } satisfies QueueEnvelope),
      catch: (cause) =>
        new QueueSerializationError({
          operation: "serialize",
          messageId: undefined,
          cause,
        }),
    }),
  );
}

function serializeBody<A>(body: A): Effect.Effect<string, QueueSerializationError> {
  return Effect.try({
    try: () => JSON.stringify(body),
    catch: (cause) =>
      new QueueSerializationError({
        operation: "serialize",
        messageId: undefined,
        cause,
      }),
  }).pipe(
    Effect.flatMap((serialized) =>
      serialized === undefined
        ? Effect.fail(
            new QueueSerializationError({
              operation: "serialize",
              messageId: undefined,
              cause: new TypeError("Queue message bodies must be JSON serializable."),
            }),
          )
        : Effect.succeed(serialized),
    ),
  );
}

function consume<Body, A, E, R>(
  deliveries: Iterable<QueueDelivery>,
  handler: (message: QueueMessage<Body>) => Effect.Effect<A, E, R>,
): Effect.Effect<void, E | QueueSerializationError, R> {
  return Effect.forEach(
    deliveries,
    (delivery) => Effect.flatMap(deserialize<Body>(delivery), handler),
    { discard: true },
  );
}

function deserialize<Body = unknown>(
  message: QueueDelivery,
): Effect.Effect<QueueMessage<Body>, QueueSerializationError> {
  return Effect.try({
    try: (): QueueMessage<Body> => {
      const envelope = parseEnvelope(message.body);

      return {
        id: message.id,
        body: envelope.body as Body,
        timestamp: message.timestamp,
        metadata: envelope.metadata,
      };
    },
    catch: (cause) =>
      new QueueSerializationError({
        operation: "deserialize",
        messageId: message.id,
        cause,
      }),
  });
}

function parseEnvelope(body: string): QueueEnvelope {
  const parsed = JSON.parse(body) as unknown;

  if (!isQueueEnvelope(parsed)) {
    throw new TypeError("Stored queue message is not a queue envelope.");
  }

  return parsed;
}

function isQueueEnvelope(value: unknown): value is QueueEnvelope {
  return typeof value === "object" && value !== null && Object.hasOwn(value, "body");
}

function withQueueServiceLogging<Body>(
  provider: string,
  service: QueueService<Body>,
): QueueService<Body> {
  return {
    send: (input: QueueMessageInput<Body>) =>
      service.send(input).pipe(
        withQueueLogging({
          provider,
          operation: "send",
        }),
      ),
    sendBatch: (inputs: ReadonlyArray<QueueMessageInput<Body>>) =>
      service.sendBatch(inputs).pipe(
        withQueueLogging({
          provider,
          operation: "sendBatch",
          messageCount: inputs.length,
        }),
      ),
    consume: <A, E, R>(
      deliveries: Iterable<QueueDelivery>,
      handler: (message: QueueMessage<Body>) => Effect.Effect<A, E, R>,
    ) =>
      service.consume(deliveries, handler).pipe(
        withQueueLogging({
          provider,
          operation: "consume",
        }),
      ),
  };
}
