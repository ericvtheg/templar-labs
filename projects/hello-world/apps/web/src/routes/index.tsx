import { createFileRoute } from "@tanstack/react-router";
import { createServerFn, useServerFn } from "@tanstack/react-start";
import { BlobStorage } from "@templar/blob";
import { r2BlobStorageLayer } from "@templar/blob/r2";
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
import { Effect, Option } from "effect";
import { useState, useTransition } from "react";

export const Route = createFileRoute("/")({
  component: Home,
});

const counterKey = "counter/value.txt";

const incrementCounter = createServerFn({ method: "POST" }).handler(async () => {
  const { env } = await import("cloudflare:workers");

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
    }).pipe(Effect.provide(r2BlobStorageLayer(env.R2))),
  );
});

function Home() {
  const incrementCounterFn = useServerFn(incrementCounter);
  const [counter, setCounter] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const displayCount = counter ?? 0;
  const progressValue = Math.min(displayCount * 12, 100);

  const handleIncrement = () => {
    setError(null);
    startTransition(async () => {
      try {
        const result = await incrementCounterFn();
        setCounter(result.value);
      } catch {
        setError("The counter could not be updated.");
      }
    });
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-10 text-foreground">
      <section className="grid w-full max-w-4xl gap-6 md:grid-cols-[1fr_22rem]">
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
            <Button disabled={isPending} onClick={handleIncrement} size="lg" type="button">
              {isPending ? "Incrementing..." : "Increment counter"}
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
      </section>
    </main>
  );
}
