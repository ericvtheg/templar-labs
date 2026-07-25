import assert from "node:assert/strict";
import { test } from "node:test";
import { Effect, Either } from "effect";
import {
  type CloudflareQueueBatchMessage,
  type CloudflareQueueLike,
  type CloudflareQueueSendOptions,
  makeQueue,
} from "../src/drivers/cloudflare.ts";
import { QueueProviderError } from "../src/errors.ts";

type TestMessage = {
  readonly task: string;
};

const TEST_TIMESTAMP = new Date("2026-05-19T00:00:00.000Z");

test("Cloudflare driver sends a text envelope without leaking provider metrics", async () => {
  const sent: Array<{ body: string; options: CloudflareQueueSendOptions | undefined }> = [];
  const queue = makeQueue<TestMessage>({
    send: (body, options) => {
      sent.push({ body, options });
      return Promise.resolve({
        metadata: {
          metrics: {
            backlogBytes: 12,
            backlogCount: 1,
            oldestMessageTimestamp: TEST_TIMESTAMP,
          },
        },
      });
    },
    sendBatch: () => Promise.resolve(emptySendResponse()),
  });

  const result = await Effect.runPromise(queue.send({ body: { task: "sync" }, delaySeconds: 10 }));

  assert.equal(result, undefined);
  assert.deepEqual(sent, [
    {
      body: JSON.stringify({ body: { task: "sync" } }),
      options: {
        contentType: "text",
        delaySeconds: 10,
      },
    },
  ]);
});

test("Cloudflare driver sends text batches with per-message delays", async () => {
  const sent: CloudflareQueueBatchMessage[] = [];
  const queue = makeQueue<TestMessage>({
    send: () => Promise.resolve(emptySendResponse()),
    sendBatch: (messages) => {
      sent.push(...messages);
      return Promise.resolve(emptySendResponse());
    },
  });

  await Effect.runPromise(
    queue.sendBatch([{ body: { task: "first" } }, { body: { task: "second" }, delaySeconds: 5 }]),
  );

  assert.deepEqual(sent, [
    {
      body: JSON.stringify({ body: { task: "first" } }),
      contentType: "text",
    },
    {
      body: JSON.stringify({ body: { task: "second" } }),
      contentType: "text",
      delaySeconds: 5,
    },
  ]);
});

test("Cloudflare driver wraps binding failures", async () => {
  const queue = makeQueue<TestMessage>({
    send: () => Promise.reject(new Error("boom")),
    sendBatch: () => Promise.resolve(emptySendResponse()),
  });

  const result = await Effect.runPromise(Effect.either(queue.send({ body: { task: "sync" } })));

  if (Either.isRight(result)) {
    assert.fail("Expected queue.send to fail.");
  }

  assert.equal(result.left instanceof QueueProviderError, true);
  if (result.left instanceof QueueProviderError) {
    assert.equal(result.left.provider, "cloudflare");
    assert.equal(result.left.operation, "send");
  }
});

function emptySendResponse() {
  return {
    metadata: {
      metrics: {
        backlogBytes: 0,
        backlogCount: 0,
      },
    },
  };
}

function assertCloudflareTypeCompatibility(binding: Queue<string>, message: Message<string>): void {
  const queue = makeQueue<TestMessage>(binding satisfies CloudflareQueueLike);
  queue.consume([message], () => Effect.void);
}

void assertCloudflareTypeCompatibility;
