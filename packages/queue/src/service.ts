import { Context, Effect, Layer } from "effect";
import type { QueueDriver } from "./driver.ts";
import { type QueueError, QueueSerializationError, type QueueStorageError } from "./errors.ts";
import { withQueueLogging } from "./logging.ts";
import type {
  QueueDriverSendInput,
  QueueMessage,
  QueueMessageInput,
  QueueMetadata,
  QueueRetryOptions,
  QueueSendBatchResult,
  QueueSendResult,
  QueueStoredMessage,
} from "./types.ts";

type QueueEnvelope = {
  readonly body: unknown;
  readonly metadata?: QueueMetadata;
};

export type QueueService = {
  readonly send: <A>(input: QueueMessageInput<A>) => Effect.Effect<QueueSendResult, QueueError>;
  readonly sendBatch: <A>(
    inputs: ReadonlyArray<QueueMessageInput<A>>,
  ) => Effect.Effect<QueueSendBatchResult, QueueError>;
  readonly deserialize: <A = unknown>(
    message: QueueStoredMessage,
  ) => Effect.Effect<QueueMessage<A>, QueueSerializationError>;
  readonly ack: (message: QueueStoredMessage) => Effect.Effect<void, QueueStorageError>;
  readonly retry: (
    message: QueueStoredMessage,
    options?: QueueRetryOptions,
  ) => Effect.Effect<void, QueueStorageError>;
};

export class Queue extends Context.Tag("@templar/queue/Queue")<Queue, QueueService>() {
  static readonly send = Effect.serviceFunctionEffect(this, (queue) => queue.send);
  static readonly sendBatch = Effect.serviceFunctionEffect(this, (queue) => queue.sendBatch);
  static readonly deserialize = Effect.serviceFunctionEffect(this, (queue) => queue.deserialize);
  static readonly ack = Effect.serviceFunctionEffect(this, (queue) => queue.ack);
  static readonly retry = Effect.serviceFunctionEffect(this, (queue) => queue.retry);
}

export function makeQueueLayer(service: QueueService): Layer.Layer<Queue> {
  return Layer.succeed(Queue, service);
}

export function makeQueueService(input: {
  readonly provider: string;
  readonly driver: QueueDriver;
}): QueueService {
  const service: QueueService = {
    send: makeSend(input.driver.send),
    sendBatch: makeSendBatch(input.driver.sendBatch),
    deserialize,
    ack: input.driver.ack,
    retry: input.driver.retry,
  };

  return withQueueServiceLogging(input.provider, service);
}

function makeSend(send: QueueDriver["send"]): QueueService["send"] {
  return <A>(input: QueueMessageInput<A>) =>
    Effect.flatMap(serializeInput(input), (serialized) => send(serialized));
}

function makeSendBatch(sendBatch: QueueDriver["sendBatch"]): QueueService["sendBatch"] {
  return <A>(inputs: ReadonlyArray<QueueMessageInput<A>>) =>
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

function deserialize<A = unknown>(
  message: QueueStoredMessage,
): Effect.Effect<QueueMessage<A>, QueueSerializationError> {
  return Effect.try({
    try: (): QueueMessage<A> => {
      const envelope = parseEnvelope(message.body);

      return {
        id: message.id,
        body: envelope.body as A,
        attempts: message.attempts,
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

function withQueueServiceLogging(provider: string, service: QueueService): QueueService {
  return {
    send: <A>(input: QueueMessageInput<A>) =>
      service.send(input).pipe(
        withQueueLogging({
          provider,
          operation: "send",
        }),
      ),
    sendBatch: <A>(inputs: ReadonlyArray<QueueMessageInput<A>>) =>
      service.sendBatch(inputs).pipe(
        withQueueLogging({
          provider,
          operation: "sendBatch",
          messageCount: inputs.length,
        }),
      ),
    deserialize: <A = unknown>(message: QueueStoredMessage) =>
      service.deserialize<A>(message).pipe(
        withQueueLogging({
          provider,
          operation: "deserialize",
          messageId: message.id,
        }),
      ),
    ack: (message: QueueStoredMessage) =>
      service.ack(message).pipe(
        withQueueLogging({
          provider,
          operation: "ack",
          messageId: message.id,
        }),
      ),
    retry: (message: QueueStoredMessage, options?: QueueRetryOptions) =>
      service.retry(message, options).pipe(
        withQueueLogging({
          provider,
          operation: "retry",
          messageId: message.id,
        }),
      ),
  };
}
