import assert from "node:assert/strict";
import { test } from "node:test";
import { Effect, Either } from "effect";
import type { QueueDriver } from "../src/driver.ts";
import { cloudflareQueueMessage, makeQueue } from "../src/drivers/cloudflare.ts";
import { QueueSerializationError, QueueStorageError } from "../src/errors.ts";
import { makeQueueService } from "../src/service.ts";
import type { QueueDriverSendInput, QueueSendResult, QueueStoredMessage } from "../src/types.ts";

test("send serializes a message body and metadata into an envelope", async () => {
  const sent: QueueDriverSendInput[] = [];
  const queue = makeQueueService({
    provider: "test",
    driver: makeDriver(sent),
  });

  const result = await Effect.runPromise(
    queue.send({
      body: { userId: "user_1" },
      delaySeconds: 30,
      metadata: { kind: "welcome" },
    }),
  );

  assert.deepEqual(result, makeSendResult());
  assert.equal(sent.length, 1);
  assert.equal(sent[0]?.delaySeconds, 30);
  assert.deepEqual(JSON.parse(sent[0]?.body ?? ""), {
    body: { userId: "user_1" },
    metadata: { kind: "welcome" },
  });
});

test("sendBatch serializes all messages", async () => {
  const sent: QueueDriverSendInput[] = [];
  const queue = makeQueueService({
    provider: "test",
    driver: makeDriver(sent),
  });

  const result = await Effect.runPromise(
    queue.sendBatch([{ body: { id: 1 } }, { body: { id: 2 }, metadata: { source: "test" } }]),
  );

  assert.deepEqual(result, makeSendResult());
  assert.deepEqual(
    sent.map((message) => JSON.parse(message.body)),
    [{ body: { id: 1 } }, { body: { id: 2 }, metadata: { source: "test" } }],
  );
});

test("deserialize parses a stored envelope", async () => {
  const queue = makeQueueService({
    provider: "test",
    driver: makeDriver(),
  });
  const stored = makeStoredMessage({
    body: JSON.stringify({
      body: { status: "ready" },
      metadata: { kind: "status" },
    }),
  });

  const message = await Effect.runPromise(queue.deserialize<{ status: string }>(stored));

  assert.deepEqual(message, {
    id: "message-1",
    body: { status: "ready" },
    attempts: 2,
    timestamp: stored.timestamp,
    metadata: { kind: "status" },
  });
});

test("send rejects non-JSON message bodies", async () => {
  const queue = makeQueueService({
    provider: "test",
    driver: makeDriver(),
  });
  const circular: { self?: unknown } = {};
  circular.self = circular;

  const result = await Effect.runPromise(Effect.either(queue.send({ body: circular })));

  if (Either.isRight(result)) {
    assert.fail("Expected queue.send to fail.");
  }

  assert.equal(result.left instanceof QueueSerializationError, true);
});

test("deserialize rejects malformed stored JSON", async () => {
  const queue = makeQueueService({
    provider: "test",
    driver: makeDriver(),
  });

  const result = await Effect.runPromise(
    Effect.either(queue.deserialize(makeStoredMessage({ body: "{" }))),
  );

  if (Either.isRight(result)) {
    assert.fail("Expected queue.deserialize to fail.");
  }

  assert.equal(result.left instanceof QueueSerializationError, true);
});

test("driver failures are wrapped as storage errors", async () => {
  const queue = makeQueueService({
    provider: "test",
    driver: {
      ...makeDriver(),
      send: () =>
        Effect.fail(
          new QueueStorageError({ operation: "send", messageId: undefined, cause: "boom" }),
        ),
    },
  });

  const result = await Effect.runPromise(Effect.either(queue.send({ body: { id: 1 } })));

  if (Either.isRight(result)) {
    assert.fail("Expected queue.send to fail.");
  }

  assert.equal(result.left instanceof QueueStorageError, true);
});

test("ack and retry delegate to the stored message actions", async () => {
  const queue = makeQueueService({
    provider: "test",
    driver: makeDriver(),
  });
  let acked = false;
  let retryDelay: number | undefined;
  const message = makeStoredMessage({
    ack: Effect.sync(() => {
      acked = true;
    }),
    retry: (options) =>
      Effect.sync(() => {
        retryDelay = options?.delaySeconds;
      }),
  });

  await Effect.runPromise(queue.ack(message));
  await Effect.runPromise(queue.retry(message, { delaySeconds: 5 }));

  assert.equal(acked, true);
  assert.equal(retryDelay, 5);
});

test("Cloudflare queue driver sends serialized messages", async () => {
  const sent: Array<{ body: string; delaySeconds: number | undefined }> = [];
  const queue = makeQueue({
    send: (body, options) => {
      sent.push({ body, delaySeconds: options?.delaySeconds });
      return Promise.resolve({
        metadata: {
          metrics: {
            backlogBytes: 12,
            backlogCount: 1,
            oldestMessageTimestamp: new Date("2026-05-19T00:00:00.000Z"),
          },
        },
      });
    },
    sendBatch: () =>
      Promise.resolve({
        metadata: {
          metrics: {
            backlogBytes: 0,
            backlogCount: 0,
          },
        },
      }),
  });

  const result = await Effect.runPromise(queue.send({ body: { task: "sync" }, delaySeconds: 10 }));

  assert.deepEqual(result, {
    metrics: {
      backlogBytes: 12,
      backlogCount: 1,
      oldestMessageTimestamp: new Date("2026-05-19T00:00:00.000Z"),
    },
  });
  assert.deepEqual(sent, [
    {
      body: JSON.stringify({ body: { task: "sync" } }),
      delaySeconds: 10,
    },
  ]);
});

test("Cloudflare queue message adapter preserves ack and retry", async () => {
  let acked = false;
  let retryDelay: number | undefined;
  const message = cloudflareQueueMessage({
    id: "cf-message-1",
    body: JSON.stringify({ body: { task: "sync" } }),
    attempts: 1,
    timestamp: new Date("2026-05-19T00:00:00.000Z"),
    ack: () => {
      acked = true;
    },
    retry: (options) => {
      retryDelay = options?.delaySeconds;
    },
  });

  await Effect.runPromise(message.ack);
  await Effect.runPromise(message.retry({ delaySeconds: 15 }));

  assert.equal(acked, true);
  assert.equal(retryDelay, 15);
});

function makeDriver(sent: QueueDriverSendInput[] = []): QueueDriver {
  return {
    send: (input) =>
      Effect.sync(() => {
        sent.push(input);

        return makeSendResult();
      }),
    sendBatch: (inputs) =>
      Effect.sync(() => {
        sent.push(...inputs);

        return makeSendResult();
      }),
    ack: (message) => message.ack,
    retry: (message, options) => message.retry(options),
  };
}

function makeSendResult(): QueueSendResult {
  return {
    metrics: {
      backlogBytes: 0,
      backlogCount: 0,
      oldestMessageTimestamp: undefined,
    },
  };
}

function makeStoredMessage(overrides: Partial<QueueStoredMessage> = {}): QueueStoredMessage {
  return {
    id: "message-1",
    body: JSON.stringify({ body: { ok: true } }),
    attempts: 2,
    timestamp: new Date("2026-05-19T00:00:00.000Z"),
    metadata: undefined,
    ack: Effect.void,
    retry: () => Effect.void,
    ...overrides,
  };
}
