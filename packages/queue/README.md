# @templar/queue

Shared background queue conventions for Templar Labs projects.

The default provider is Cloudflare Queues. The package owns JSON serialization,
typed errors, and Effect logging while applications own their job types and
processing policy.

## Producer

Create a queue service from the Cloudflare binding and type it for the messages
that binding accepts:

```ts
import { makeQueue } from "@templar/queue";
import { Effect } from "effect";

type Job =
  | { readonly type: "email.welcome"; readonly userId: string }
  | { readonly type: "analytics.rollup"; readonly date: string };

const jobs = makeQueue<Job>(env.JOBS);

await Effect.runPromise(
  jobs.send({
    body: { type: "email.welcome", userId: "user_123" },
    metadata: { source: "signup" },
  }),
);
```

`sendBatch` accepts up to 100 messages. Individual messages can use
`delaySeconds` to defer delivery.

## Consumer

Consumer completion is the acknowledgement: resolving succeeds and throwing
rejects the delivery. The provider owns delivery state and retry timing:

```ts
import { makeQueue } from "@templar/queue";
import { Effect } from "effect";

export default {
  async queue(batch: MessageBatch<string>, env: Env) {
    const jobs = makeQueue<Job>(env.JOBS);

    await Effect.runPromise(
      jobs.consume(batch.messages, (job) => processJob(job.body)),
    );
  },
};
```

There is no package-level `ack`, `retry`, retry counter, or retry delay API.

## Effect layers

Direct constructors are preferred when a Worker binding is already in hand.
Reusable Effect programs can define a typed tag instead:

```ts
import { makeQueueTag, queueLayerFor } from "@templar/queue";
import { Effect } from "effect";

const JOBS_QUEUE = makeQueueTag<Job>("@app/JobsQueue");

const program = JOBS_QUEUE.send({
  body: { type: "email.welcome", userId: "user_123" },
});

await Effect.runPromise(program.pipe(Effect.provide(queueLayerFor(JOBS_QUEUE, env.JOBS))));
```

## Deployment

Create and bind the queue through `@templar/deploy`:

```ts
import { queue, templarApp } from "@templar/deploy/cloudflare";

const JOBS_QUEUE = await queue("jobs", {
  project: "my-project",
  adopt: true,
  settings: {
    messageRetentionPeriod: 345_600,
  },
});

await templarApp("website", {
  cwd: "apps/web",
  queue: {
    binding: JOBS_QUEUE,
    settings: {
      batchSize: 1,
      maxConcurrency: 2,
      maxRetries: 0,
    },
  },
});
```

`templarApp` defaults to one-message batches and no retries. That makes a thrown
handler reject only its message while a resolved handler succeeds. It does not
set a retry delay. Override `maxRetries` in `settings` to opt into the provider's
retry policy.

For jobs where permanent failure must be inspected or replayed, create a second
queue and pass it as `deadLetterQueue` in the consumer settings.

## Delivery and provider errors

Cloudflare Queues provide at-least-once delivery. Every state-changing handler
must therefore be idempotent. Include a stable domain ID in the job body and use
it as a database key or upstream idempotency key. The Cloudflare delivery ID is
available as `job.id`, but the application-generated domain ID is the portable
deduplication key.

The package validates only the wire format it owns: message bodies must be JSON
serializable and consumed values must be message envelopes. Operational limits
such as delays, message sizes, and batch sizes belong to the provider. Provider
failures are returned as `QueueProviderError` rather than duplicated in the
shared service.

The service does not automatically retry producer sends. An ambiguous provider
failure may have happened after a message was persisted, so automatic retries
could publish a duplicate without an application idempotency policy.
