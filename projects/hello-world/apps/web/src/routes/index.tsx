import { createFileRoute } from "@tanstack/react-router";
import { createServerFn, useServerFn } from "@tanstack/react-start";
import { BlobStorage } from "@templar/blob";
import { r2BlobStorageLayer } from "@templar/blob/r2";
import { Database, databaseError } from "@templar/db";
import { d1DatabaseLayer } from "@templar/db/d1";
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
import { Input } from "@templar/ui/components/input";
import { Label } from "@templar/ui/components/label";
import { Progress } from "@templar/ui/components/progress";
import { Separator } from "@templar/ui/components/separator";
import { desc } from "drizzle-orm";
import { Effect, Option } from "effect";
import { useId, useState, useTransition } from "react";
import * as schema from "../../db/schema.ts";
import { helloEvents } from "../../db/schema.ts";
import { authClient } from "../lib/auth-client.ts";

export const Route = createFileRoute("/")({
  component: Home,
});

const counterKey = "counter/value.txt";

type HelloEvent = {
  readonly id: number;
  readonly message: string;
  readonly createdAt: string;
};

const incrementCounter = createServerFn({ method: "POST" }).handler(async () => {
  const { env } = await import("cloudflare:workers");
  const bindings = env as { readonly R2: R2Bucket };

  return await Effect.runPromise(
    Effect.gen(function* () {
      const storedCounter = yield* BlobStorage.get(counterKey);
      const currentValue = Option.isNone(storedCounter)
        ? 0
        : Number(yield* storedCounter.value.text);
      const nextValue = Number.isFinite(currentValue) ? currentValue + 1 : 1;

      yield* BlobStorage.put({
        key: counterKey,
        body: String(nextValue),
        httpMetadata: {
          contentType: "text/plain; charset=utf-8",
        },
      });

      return { value: nextValue };
    }).pipe(Effect.provide(r2BlobStorageLayer(bindings.R2))),
  );
});

const listHelloEvents = createServerFn({ method: "GET" }).handler(async () => {
  const { env } = await import("cloudflare:workers");
  const bindings = env as { readonly DB: D1Database };

  return await Effect.runPromise(
    readHelloEvents.pipe(Effect.provide(d1DatabaseLayer(bindings.DB, { schema }))),
  );
});

const createHelloEvent = createServerFn({ method: "POST" }).handler(async () => {
  const { env } = await import("cloudflare:workers");
  const bindings = env as { readonly DB: D1Database };
  const now = new Date();

  return await Effect.runPromise(
    Effect.gen(function* () {
      const database = yield* Database;

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

      return yield* readHelloEvents;
    }).pipe(Effect.provide(d1DatabaseLayer(bindings.DB, { schema }))),
  );
});

const readHelloEvents = Effect.gen(function* () {
  const database = yield* Database;

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

function Home() {
  const nameId = useId();
  const emailId = useId();
  const passwordId = useId();
  const incrementCounterFn = useServerFn(incrementCounter);
  const createHelloEventFn = useServerFn(createHelloEvent);
  const listHelloEventsFn = useServerFn(listHelloEvents);
  const session = authClient.useSession();
  const [authMode, setAuthMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [authName, setAuthName] = useState("Templar User");
  const [authEmail, setAuthEmail] = useState("hello@example.com");
  const [authPassword, setAuthPassword] = useState("password123");
  const [authError, setAuthError] = useState<string | null>(null);
  const [counter, setCounter] = useState<number | null>(null);
  const [dbEvents, setDbEvents] = useState<ReadonlyArray<HelloEvent>>([]);
  const [error, setError] = useState<string | null>(null);
  const [dbError, setDbError] = useState<string | null>(null);
  const [isAuthPending, startAuthTransition] = useTransition();
  const [isCounterPending, startCounterTransition] = useTransition();
  const [isDbPending, startDbTransition] = useTransition();
  const displayCount = counter ?? 0;
  const progressValue = Math.min(displayCount * 12, 100);
  const currentUser = session.data?.user ?? null;

  const handleAuthSubmit = () => {
    setAuthError(null);
    startAuthTransition(async () => {
      try {
        const result =
          authMode === "sign-up"
            ? await authClient.signUp.email({
                name: authName,
                email: authEmail,
                password: authPassword,
              })
            : await authClient.signIn.email({
                email: authEmail,
                password: authPassword,
              });

        if (result.error !== null) {
          setAuthError(result.error.message ?? "Authentication failed.");
          return;
        }

        await session.refetch();
      } catch {
        setAuthError("Authentication failed.");
      }
    });
  };

  const handleSignOut = () => {
    setAuthError(null);
    startAuthTransition(async () => {
      try {
        await authClient.signOut();
        await session.refetch();
      } catch {
        setAuthError("Sign out failed.");
      }
    });
  };

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
              Email/password auth routed through @templar/auth and Better Auth.
            </CardDescription>
            <CardAction>
              <Badge variant={currentUser === null ? "outline" : "default"}>
                {session.isPending ? "Checking" : currentUser === null ? "Signed out" : "Signed in"}
              </Badge>
            </CardAction>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-[1fr_1fr]">
            <div className="rounded-lg border bg-muted/40 p-4">
              <p className="text-sm text-muted-foreground">Current user</p>
              <p className="mt-2 font-medium">{currentUser?.name ?? "No active session"}</p>
              <p className="text-sm text-muted-foreground">
                {currentUser?.email ?? "Sign in below"}
              </p>
            </div>
            <div className="grid gap-3">
              <div className="flex gap-2">
                <Button
                  onClick={() => setAuthMode("sign-in")}
                  size="sm"
                  type="button"
                  variant={authMode === "sign-in" ? "default" : "outline"}
                >
                  Sign in
                </Button>
                <Button
                  onClick={() => setAuthMode("sign-up")}
                  size="sm"
                  type="button"
                  variant={authMode === "sign-up" ? "default" : "outline"}
                >
                  Sign up
                </Button>
              </div>
              {authMode === "sign-up" ? (
                <div className="grid gap-2">
                  <Label htmlFor={nameId}>Name</Label>
                  <Input
                    id={nameId}
                    onChange={(event) => setAuthName(event.currentTarget.value)}
                    value={authName}
                  />
                </div>
              ) : null}
              <div className="grid gap-2">
                <Label htmlFor={emailId}>Email</Label>
                <Input
                  id={emailId}
                  onChange={(event) => setAuthEmail(event.currentTarget.value)}
                  type="email"
                  value={authEmail}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor={passwordId}>Password</Label>
                <Input
                  id={passwordId}
                  onChange={(event) => setAuthPassword(event.currentTarget.value)}
                  type="password"
                  value={authPassword}
                />
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex-col items-stretch gap-3 sm:flex-row">
            <Button disabled={isAuthPending} onClick={handleAuthSubmit} type="button">
              {isAuthPending ? "Working..." : authMode === "sign-up" ? "Create account" : "Sign in"}
            </Button>
            <Button
              disabled={isAuthPending || currentUser === null}
              onClick={handleSignOut}
              type="button"
              variant="outline"
            >
              Sign out
            </Button>
            {authError === null ? null : (
              <Alert className="sm:ml-auto sm:max-w-sm" variant="destructive">
                <AlertTitle>Auth failed</AlertTitle>
                <AlertDescription>{authError}</AlertDescription>
              </Alert>
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
      </section>
    </main>
  );
}
