import assert from "node:assert/strict";
import { test } from "node:test";
import { Effect, Either } from "effect";
import type { QueueDriver } from "../src/driver.ts";
import { type QueueError, QueueProviderError, QueueSerializationError } from "../src/errors.ts";
import { makeQueueLayerFor, makeQueueService, makeQueueTag } from "../src/service.ts";
import type { QueueDelivery, QueueDriverSendInput, QueueMessage } from "../src/types.ts";

type TestMessage = {
  readonly id: number;
  readonly status?: string;
};

const TEST_TIMESTAMP = new Date("2026-05-19T00:00:00.000Z");
const TEST_QUEUE = makeQueueTag<TestMessage>("@test/Queue");

test("send serializes a message envelope", async () => {
  const sent: QueueDriverSendInput[] = [];
  const queue = makeQueueService<TestMessage>({
    provider: "test",
    driver: makeDriver(sent),
  });

  await Effect.runPromise(
    queue.send({
      body: { id: 1 },
      delaySeconds: 30,
      metadata: { kind: "welcome" },
    }),
  );

  assert.equal(sent.length, 1);
  assert.equal(sent[0]?.delaySeconds, 30);
  assert.deepEqual(JSON.parse(sent[0]?.body ?? ""), {
    body: { id: 1 },
    metadata: { kind: "welcome" },
  });
});

test("sendBatch serializes every message", async () => {
  const sent: QueueDriverSendInput[] = [];
  const queue = makeQueueService<TestMessage>({
    provider: "test",
    driver: makeDriver(sent),
  });

  await Effect.runPromise(
    queue.sendBatch([{ body: { id: 1 } }, { body: { id: 2 }, metadata: { source: "test" } }]),
  );

  assert.deepEqual(
    sent.map((message) => JSON.parse(message.body)),
    [{ body: { id: 1 } }, { body: { id: 2 }, metadata: { source: "test" } }],
  );
});

test("service delegates provider options and empty batches without validating them", async () => {
  const sent: QueueDriverSendInput[] = [];
  const batches: ReadonlyArray<QueueDriverSendInput>[] = [];
  const queue = makeQueueService<TestMessage>({
    provider: "test",
    driver: {
      send: (input) =>
        Effect.sync(() => {
          sent.push(input);
        }),
      sendBatch: (inputs) =>
        Effect.sync(() => {
          batches.push(inputs);
        }),
    },
  });

  await Effect.runPromise(queue.send({ body: { id: 1 }, delaySeconds: -1 }));
  await Effect.runPromise(queue.sendBatch([]));

  assert.equal(sent[0]?.delaySeconds, -1);
  assert.deepEqual(batches, [[]]);
});

test("custom queue tags preserve typed Effect usage", async () => {
  const sent: QueueDriverSendInput[] = [];
  const queue = makeQueueService<TestMessage>({
    provider: "test",
    driver: makeDriver(sent),
  });

  await Effect.runPromise(
    TEST_QUEUE.send({ body: { id: 1, status: "ready" } }).pipe(
      Effect.provide(makeQueueLayerFor(TEST_QUEUE, queue)),
    ),
  );

  assert.deepEqual(JSON.parse(sent[0]?.body ?? ""), {
    body: { id: 1, status: "ready" },
  });
});

test("consume deserializes an envelope before invoking the handler", async () => {
  const queue = makeQueueService<TestMessage>({
    provider: "test",
    driver: makeDriver(),
  });
  const delivery = makeDelivery({
    body: JSON.stringify({
      body: { id: 1, status: "ready" },
      metadata: { kind: "status" },
    }),
  });
  let consumed: QueueMessage<TestMessage> | undefined;

  await Effect.runPromise(
    queue.consume([delivery], (message) =>
      Effect.sync(() => {
        consumed = message;
      }),
    ),
  );

  assert.deepEqual(consumed, {
    id: "message-1",
    body: { id: 1, status: "ready" },
    timestamp: delivery.timestamp,
    metadata: { kind: "status" },
  });
});

test("consume rejects values that are not message envelopes", async () => {
  const queue = makeQueueService<TestMessage>({
    provider: "test",
    driver: makeDriver(),
  });
  const result = await Effect.runPromise(
    Effect.either(
      queue.consume(
        [makeDelivery({ body: JSON.stringify({ value: { id: 1 } }) })],
        () => Effect.void,
      ),
    ),
  );

  assertSerializationError(result);
});

test("send rejects non-JSON message bodies", async () => {
  const queue = makeQueueService<unknown>({
    provider: "test",
    driver: makeDriver(),
  });
  const circular: { self?: unknown } = {};
  circular.self = circular;

  const result = await Effect.runPromise(Effect.either(queue.send({ body: circular })));

  assertSerializationError(result);
});

test("consume rejects malformed delivery JSON", async () => {
  const queue = makeQueueService<TestMessage>({
    provider: "test",
    driver: makeDriver(),
  });
  const result = await Effect.runPromise(
    Effect.either(queue.consume([makeDelivery({ body: "{" })], () => Effect.void)),
  );

  assertSerializationError(result);
});

test("consume propagates handler failures", async () => {
  const queue = makeQueueService<TestMessage>({
    provider: "test",
    driver: makeDriver(),
  });
  const failure = new Error("processing failed");
  const result = await Effect.runPromise(
    Effect.either(queue.consume([makeDelivery()], () => Effect.fail(failure))),
  );

  if (Either.isRight(result)) {
    assert.fail("Expected the consumer handler to fail.");
  }

  assert.equal(result.left, failure);
});

test("driver failures remain provider errors", async () => {
  const queue = makeQueueService<TestMessage>({
    provider: "test",
    driver: {
      ...makeDriver(),
      send: () =>
        Effect.fail(
          new QueueProviderError({
            provider: "test",
            operation: "send",
            messageId: undefined,
            cause: "boom",
          }),
        ),
    },
  });

  const result = await Effect.runPromise(Effect.either(queue.send({ body: { id: 1 } })));

  if (Either.isRight(result)) {
    assert.fail("Expected queue.send to fail.");
  }

  assert.equal(result.left instanceof QueueProviderError, true);
});

function makeDriver(sent: QueueDriverSendInput[] = []): QueueDriver {
  return {
    send: (input) =>
      Effect.sync(() => {
        sent.push(input);
      }),
    sendBatch: (inputs) =>
      Effect.sync(() => {
        sent.push(...inputs);
      }),
  };
}

function makeDelivery(overrides: Partial<QueueDelivery> = {}): QueueDelivery {
  return {
    id: "message-1",
    body: JSON.stringify({ body: { id: 1 } }),
    timestamp: TEST_TIMESTAMP,
    ...overrides,
  };
}

function assertSerializationError(result: Either.Either<unknown, QueueError>): void {
  if (Either.isRight(result)) {
    throw new Error("Expected queue serialization to fail.");
  }

  if (!(result.left instanceof QueueSerializationError)) {
    throw new Error("Expected QueueSerializationError.");
  }
}
