import { createFileRoute } from "@tanstack/react-router";
import { createServerFn, useServerFn } from "@tanstack/react-start";
import { makeBlob } from "@templar/blob";
import { databaseError, makeDatabase } from "@templar/db";
import { makeQueue } from "@templar/queue";
import { Alert, AlertDescription, AlertTitle } from "@templar/ui/components/alert";
import { Badge } from "@templar/ui/components/badge";
import { Button } from "@templar/ui/components/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@templar/ui/components/card";
import { Progress } from "@templar/ui/components/progress";
import { Separator } from "@templar/ui/components/separator";
import { desc } from "drizzle-orm";
import { Effect, Option } from "effect";
import { useState, useTransition } from "react";
import * as schema from "../../../../db/schema.ts";
import { helloEvents, queueEvents } from "../../../../db/schema.ts";
import { templarBindings } from "../../../../templar-bindings.ts";
import { getAuth } from "../lib/auth.server.ts";

const loadCurrentUser = createServerFn({ method: "GET" }).handler(async (context) => {
  const request = (context as { readonly request?: Request }).request;
  if (request === undefined) {
    throw new Error("Request context unavailable.");
  }

  const auth = await getAuth(request);
  const session = await auth.api.getSession({ headers: request.headers });
  if (session === null) {
    return null;
  }

  return {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
  };
});

export const Route = createFileRoute("/")({
  loader: () => loadCurrentUser(),
  component: Home,
});

const counterKey = "counter/value.txt";

type HelloEvent = {
  readonly id: number;
  readonly message: string;
  readonly createdAt: string;
};

type QueueEvent = {
  readonly id: number;
  readonly messageId: string;
  readonly message: string;
  readonly status: "queued" | "processed";
  readonly publishedAt: string;
  readonly processedAt: string | null;
};

type QueueJob = {
  readonly id: string;
  readonly message: string;
  readonly publishedAt: string;
};

const incrementCounter = createServerFn({ method: "POST" }).handler(async () => {
  const { env } = await import("cloudflare:workers");
  const bindings = env as { readonly R2: R2Bucket };
  const blob = makeBlob(bindings.R2);

  return await Effect.runPromise(
    Effect.gen(function* () {
      const storedCounter = yield* blob.get(counterKey);
      const currentValue = Option.isNone(storedCounter)
        ? 0
        : Number(yield* storedCounter.value.text);
      const nextValue = Number.isFinite(currentValue) ? currentValue + 1 : 1;

      yield* blob.put({
        key: counterKey,
        body: String(nextValue),
        httpMetadata: {
          contentType: "text/plain; charset=utf-8",
        },
      });

      return { value: nextValue };
    }),
  );
});

const listHelloEvents = createServerFn({ method: "GET" }).handler(async () => {
  const { env } = await import("cloudflare:workers");
  const bindings = env as { readonly [templarBindings.db]: D1Database };
  const database = makeDatabase(bindings[templarBindings.db], { schema });

  return await Effect.runPromise(readHelloEvents(database));
});

const createHelloEvent = createServerFn({ method: "POST" }).handler(async () => {
  const { env } = await import("cloudflare:workers");
  const bindings = env as { readonly [templarBindings.db]: D1Database };
  const database = makeDatabase(bindings[templarBindings.db], { schema });
  const now = new Date();

  return await Effect.runPromise(
    Effect.gen(function* () {
      yield* Effect.tryPromise({
        try: () =>
          database.db.insert(helloEvents).values({
            message: `Hello D1 at ${now.toLocaleTimeString("en-US", {
              hour: "numeric",
              minute: "2-digit",
              second: "2-digit",
            })}`,
            createdAt: now,
          }),
        catch: (cause) =>
          databaseError({
            operation: "insert",
            table: "hello_events",
            cause,
          }),
      });

      return yield* readHelloEvents(database);
    }),
  );
});

const listQueueEvents = createServerFn({ method: "GET" }).handler(async () => {
  const { env } = await import("cloudflare:workers");
  const bindings = env as { readonly [templarBindings.db]: D1Database };
  const database = makeDatabase(bindings[templarBindings.db], { schema });

  return await Effect.runPromise(readQueueEvents(database));
});

const publishQueueEvent = createServerFn({ method: "POST" }).handler(async () => {
  const { env } = await import("cloudflare:workers");
  const bindings = env as {
    readonly [templarBindings.db]: D1Database;
    readonly [templarBindings.jobsQueue]: Queue<string>;
  };
  const database = makeDatabase(bindings[templarBindings.db], { schema });
  const queue = makeQueue<QueueJob>(bindings[templarBindings.jobsQueue]);
  const publishedAt = new Date();
  const job: QueueJob = {
    id: crypto.randomUUID(),
    message: `Published from the client at ${publishedAt.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    })}`,
    publishedAt: publishedAt.toISOString(),
  };

  return await Effect.runPromise(
    Effect.gen(function* () {
      yield* Effect.tryPromise({
        try: () =>
          database.db.insert(queueEvents).values({
            messageId: job.id,
            message: job.message,
            status: "queued",
            publishedAt,
          }),
        catch: (cause) =>
          databaseError({
            operation: "insert",
            table: "queue_events",
            cause,
          }),
      });

      yield* queue.send({
        body: job,
        metadata: {
          kind: "hello-world-client-message",
        },
      });

      const result = yield* readQueueEvents(database);

      return {
        ...result,
        messageId: job.id,
      };
    }),
  );
});

type HelloDatabase = ReturnType<typeof makeDatabase<typeof schema>>;

const readHelloEvents = (database: HelloDatabase) =>
  Effect.gen(function* () {
    const events = yield* Effect.tryPromise({
      try: () =>
        database.db
          .select({
            id: helloEvents.id,
            message: helloEvents.message,
            createdAt: helloEvents.createdAt,
          })
          .from(helloEvents)
          .orderBy(desc(helloEvents.id))
          .limit(5),
      catch: (cause) =>
        databaseError({
          operation: "select",
          table: "hello_events",
          cause,
        }),
    });

    return {
      events: events.map(
        (event): HelloEvent => ({
          id: event.id,
          message: event.message,
          createdAt: event.createdAt.toISOString(),
        }),
      ),
    };
  });

const readQueueEvents = (database: HelloDatabase) =>
  Effect.gen(function* () {
    const events = yield* Effect.tryPromise({
      try: () =>
        database.db
          .select({
            id: queueEvents.id,
            messageId: queueEvents.messageId,
            message: queueEvents.message,
            status: queueEvents.status,
            publishedAt: queueEvents.publishedAt,
            processedAt: queueEvents.processedAt,
          })
          .from(queueEvents)
          .orderBy(desc(queueEvents.id))
          .limit(5),
      catch: (cause) =>
        databaseError({
          operation: "select",
          table: "queue_events",
          cause,
        }),
    });

    return {
      events: events.map(
        (event): QueueEvent => ({
          id: event.id,
          messageId: event.messageId,
          message: event.message,
          status: event.status,
          publishedAt: event.publishedAt.toISOString(),
          processedAt: event.processedAt?.toISOString() ?? null,
        }),
      ),
    };
  });

const wait = (milliseconds: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });

function Home() {
  const incrementCounterFn = useServerFn(incrementCounter);
  const createHelloEventFn = useServerFn(createHelloEvent);
  const listHelloEventsFn = useServerFn(listHelloEvents);
  const listQueueEventsFn = useServerFn(listQueueEvents);
  const publishQueueEventFn = useServerFn(publishQueueEvent);
  const [counter, setCounter] = useState<number | null>(null);
  const [dbEvents, setDbEvents] = useState<ReadonlyArray<HelloEvent>>([]);
  const [queueEventRows, setQueueEventRows] = useState<ReadonlyArray<QueueEvent>>([]);
  const [error, setError] = useState<string | null>(null);
  const [dbError, setDbError] = useState<string | null>(null);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [isCounterPending, startCounterTransition] = useTransition();
  const [isDbPending, startDbTransition] = useTransition();
  const [isQueuePending, startQueueTransition] = useTransition();
  const displayCount = counter ?? 0;
  const progressValue = Math.min(displayCount * 12, 100);
  const currentUser = Route.useLoaderData();

  const handleIncrement = () => {
    setError(null);
    startCounterTransition(async () => {
      try {
        const result = await incrementCounterFn();
        setCounter(result.value);
      } catch {
        setError("The counter could not be updated.");
      }
    });
  };

  const handleLoadEvents = () => {
    setDbError(null);
    startDbTransition(async () => {
      try {
        const result = await listHelloEventsFn();
        setDbEvents(result.events);
      } catch {
        setDbError("The database rows could not be loaded.");
      }
    });
  };

  const handleCreateEvent = () => {
    setDbError(null);
    startDbTransition(async () => {
      try {
        const result = await createHelloEventFn();
        setDbEvents(result.events);
      } catch {
        setDbError("The database row could not be written.");
      }
    });
  };

  const handleLoadQueueEvents = () => {
    setQueueError(null);
    startQueueTransition(async () => {
      try {
        const result = await listQueueEventsFn();
        setQueueEventRows(result.events);
      } catch {
        setQueueError("The queue events could not be loaded.");
      }
    });
  };

  const handlePublishQueueEvent = () => {
    setQueueError(null);
    startQueueTransition(async () => {
      try {
        const result = await publishQueueEventFn();
        setQueueEventRows(result.events);

        const pollForProcessedEvent = async (
          messageId: string,
          attemptsRemaining: number,
        ): Promise<void> => {
          if (attemptsRemaining === 0) {
            return;
          }

          await wait(1000);

          const nextResult = await listQueueEventsFn();
          setQueueEventRows(nextResult.events);

          const publishedEvent = nextResult.events.find((event) => event.messageId === messageId);

          if (publishedEvent?.status === "processed") {
            return;
          }

          return pollForProcessedEvent(messageId, attemptsRemaining - 1);
        };

        await pollForProcessedEvent(result.messageId, 10);
      } catch {
        setQueueError("The queue message could not complete.");
      }
    });
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-10 text-foreground">
      <section className="grid w-full max-w-5xl gap-6 md:grid-cols-[1fr_22rem]">
        <Card className="justify-between">
          <CardHeader>
            <Badge className="w-fit" variant="secondary">
              Shared UI package
            </Badge>
            <CardTitle className="max-w-xl text-4xl">Hello from Templar Labs.</CardTitle>
            <CardDescription className="max-w-2xl text-base">
              This screen is rendered with shadcn components from the new @templar/ui workspace
              package.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <Separator />
            <div className="grid gap-3">
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm font-medium text-muted-foreground">Counter progress</span>
                <span className="text-sm tabular-nums">{progressValue}%</span>
              </div>
              <Progress value={progressValue} />
            </div>
          </CardContent>
          <CardFooter>
            <Button disabled={isCounterPending} onClick={handleIncrement} size="lg" type="button">
              {isCounterPending ? "Incrementing..." : "Increment counter"}
            </Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Blob counter</CardTitle>
            <CardDescription>Server state returned from the blob storage package.</CardDescription>
            <CardAction>
              <Badge variant={counter === null ? "outline" : "default"}>
                {counter === null ? "Waiting" : "Live"}
              </Badge>
            </CardAction>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border bg-muted/40 px-4 py-6 text-center">
              <p className="text-sm text-muted-foreground">Current value</p>
              <p className="mt-2 text-5xl font-semibold tabular-nums">{displayCount}</p>
            </div>
          </CardContent>
          <CardFooter className="flex-col items-stretch gap-3">
            {error === null ? null : (
              <Alert variant="destructive">
                <AlertTitle>Update failed</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <p className="text-sm text-muted-foreground">
              {counter === null
                ? "Click the button to write the first value."
                : `Last stored value: ${counter}`}
            </p>
          </CardFooter>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Auth session</CardTitle>
            <CardDescription>
              Central SSO plus a local app_users row through @templar/users.
            </CardDescription>
            <CardAction>
              <Badge variant={currentUser === null ? "outline" : "default"}>
                {currentUser === null ? "Signed out" : "Signed in"}
              </Badge>
            </CardAction>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border bg-muted/40 p-4">
              <p className="text-sm text-muted-foreground">Current user</p>
              <p className="mt-2 font-medium">{currentUser?.name ?? "No active session"}</p>
              <p className="text-sm text-muted-foreground">
                {currentUser?.email ?? "Sign in through Templar Auth"}
              </p>
            </div>
          </CardContent>
          <CardFooter className="gap-3">
            {currentUser === null ? (
              <form action="/api/auth/sign-in" method="get">
                <input name="returnTo" type="hidden" value="/" />
                <Button type="submit">Sign in</Button>
              </form>
            ) : (
              <form action="/api/auth/sign-out?returnTo=/" method="post">
                <Button type="submit" variant="outline">
                  Sign out
                </Button>
              </form>
            )}
          </CardFooter>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>D1 reads and writes</CardTitle>
            <CardDescription>
              Server functions write rows with Drizzle, then read the latest rows through
              @templar/db.
            </CardDescription>
            <CardAction>
              <Badge variant={dbEvents.length === 0 ? "outline" : "default"}>
                {dbEvents.length === 0 ? "No rows loaded" : `${dbEvents.length} rows`}
              </Badge>
            </CardAction>
          </CardHeader>
          <CardContent>
            <div className="overflow-hidden rounded-lg border">
              <div className="grid grid-cols-[5rem_1fr_12rem] border-b bg-muted/40 px-4 py-2 text-sm font-medium text-muted-foreground">
                <span>ID</span>
                <span>Message</span>
                <span>Created</span>
              </div>
              {dbEvents.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                  Load rows or write the first D1 event.
                </div>
              ) : (
                dbEvents.map((event) => (
                  <div
                    className="grid grid-cols-[5rem_1fr_12rem] border-b px-4 py-3 text-sm last:border-b-0"
                    key={event.id}
                  >
                    <span className="font-mono text-muted-foreground">{event.id}</span>
                    <span>{event.message}</span>
                    <span className="text-muted-foreground">
                      {new Date(event.createdAt).toLocaleTimeString()}
                    </span>
                  </div>
                ))
              )}
            </div>
          </CardContent>
          <CardFooter className="flex-col items-stretch gap-3 sm:flex-row">
            <Button disabled={isDbPending} onClick={handleCreateEvent} type="button">
              {isDbPending ? "Writing..." : "Write row"}
            </Button>
            <Button
              disabled={isDbPending}
              onClick={handleLoadEvents}
              type="button"
              variant="outline"
            >
              Read rows
            </Button>
            {dbError === null ? null : (
              <Alert className="sm:ml-auto sm:max-w-sm" variant="destructive">
                <AlertTitle>Database failed</AlertTitle>
                <AlertDescription>{dbError}</AlertDescription>
              </Alert>
            )}
          </CardFooter>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Queue round trip</CardTitle>
            <CardDescription>
              Client publishes to Cloudflare Queues; the consumer processes the job and writes the
              result back to D1.
            </CardDescription>
            <CardAction>
              <Badge variant={queueEventRows.length === 0 ? "outline" : "default"}>
                {queueEventRows.length === 0 ? "No messages" : `${queueEventRows.length} messages`}
              </Badge>
            </CardAction>
          </CardHeader>
          <CardContent>
            <div className="overflow-hidden rounded-lg border">
              <div className="grid grid-cols-[6rem_1fr_11rem_11rem] border-b bg-muted/40 px-4 py-2 text-sm font-medium text-muted-foreground">
                <span>Status</span>
                <span>Message</span>
                <span>Published</span>
                <span>Processed</span>
              </div>
              {queueEventRows.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                  Publish a queue message to watch it come back through the consumer.
                </div>
              ) : (
                queueEventRows.map((event) => (
                  <div
                    className="grid grid-cols-[6rem_1fr_11rem_11rem] border-b px-4 py-3 text-sm last:border-b-0"
                    key={event.id}
                  >
                    <span>
                      <Badge variant={event.status === "processed" ? "default" : "outline"}>
                        {event.status}
                      </Badge>
                    </span>
                    <span>{event.message}</span>
                    <span className="text-muted-foreground">
                      {new Date(event.publishedAt).toLocaleTimeString()}
                    </span>
                    <span className="text-muted-foreground">
                      {event.processedAt === null
                        ? "Pending"
                        : new Date(event.processedAt).toLocaleTimeString()}
                    </span>
                  </div>
                ))
              )}
            </div>
          </CardContent>
          <CardFooter className="flex-col items-stretch gap-3 sm:flex-row">
            <Button disabled={isQueuePending} onClick={handlePublishQueueEvent} type="button">
              {isQueuePending ? "Waiting..." : "Publish message"}
            </Button>
            <Button
              disabled={isQueuePending}
              onClick={handleLoadQueueEvents}
              type="button"
              variant="outline"
            >
              Refresh messages
            </Button>
            {queueError === null ? null : (
              <Alert className="sm:ml-auto sm:max-w-sm" variant="destructive">
                <AlertTitle>Queue failed</AlertTitle>
                <AlertDescription>{queueError}</AlertDescription>
              </Alert>
            )}
          </CardFooter>
        </Card>
      </section>
    </main>
  );
}
