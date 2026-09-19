import { Context, Data, Effect, Layer } from "effect";
import type { HealthSyncRequestV1, HealthSyncResponseV1, SyncStatusV1 } from "../contracts/v1.ts";
import type { HealthRepository } from "./repository.ts";
import { RequestIdConflict } from "./repository.ts";

export class HealthUnauthorized extends Data.TaggedError("HealthUnauthorized") {}
export class HealthConflict extends Data.TaggedError("HealthConflict") {}
export class HealthStorageError extends Data.TaggedError("HealthStorageError")<{
  readonly cause: unknown;
}> {}

export type HealthSyncServiceShape = {
  readonly ingest: (
    token: string,
    input: HealthSyncRequestV1,
  ) => Effect.Effect<
    HealthSyncResponseV1,
    HealthUnauthorized | HealthConflict | HealthStorageError
  >;
  readonly status: (
    token: string,
  ) => Effect.Effect<SyncStatusV1, HealthUnauthorized | HealthStorageError>;
};

export class HealthSyncService extends Context.Tag("health-exporter/HealthSyncService")<
  HealthSyncService,
  HealthSyncServiceShape
>() {}

export function makeHealthSyncService(
  repository: HealthRepository,
  secret: string,
): HealthSyncServiceShape {
  const authorize = (token: string) =>
    Effect.promise(() => equalSecret(token, secret)).pipe(
      Effect.flatMap((valid) => (valid ? Effect.void : Effect.fail(new HealthUnauthorized()))),
    );
  return {
    ingest: (token, input) =>
      authorize(token).pipe(
        Effect.flatMap(() =>
          Effect.tryPromise({
            try: () => repository.ingest(input),
            catch: (cause) =>
              cause instanceof RequestIdConflict
                ? new HealthConflict()
                : new HealthStorageError({ cause }),
          }),
        ),
      ),
    status: (token) =>
      authorize(token).pipe(
        Effect.flatMap(() =>
          Effect.tryPromise({
            try: () => repository.status(),
            catch: (cause) => new HealthStorageError({ cause }),
          }),
        ),
      ),
  };
}

export const healthSyncServiceLayer = (repository: HealthRepository, secret: string) =>
  Layer.succeed(HealthSyncService, makeHealthSyncService(repository, secret));

async function equalSecret(candidate: string, expected: string): Promise<boolean> {
  if (candidate.length < 32 || expected.length < 32) {
    return false;
  }
  const encoder = new TextEncoder();
  const [left, right] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(candidate)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  const a = new Uint8Array(left);
  const b = new Uint8Array(right);
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) {
    difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
  }
  return difference === 0;
}
