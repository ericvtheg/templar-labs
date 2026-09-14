import { Context, Data, Effect, Layer } from "effect";
import type { SampleIngestionRequestV1, SampleIngestionResponseV1 } from "../contracts/v1.ts";
import type { IngestionRepository } from "./repository.ts";
import { IngestionClaimUnauthorized, IngestionRequestConflict } from "./repository.ts";

export class IngestionUnauthorized extends Data.TaggedError("IngestionUnauthorized") {}
export class IngestionStorageError extends Data.TaggedError("IngestionStorageError")<{
  readonly cause: unknown;
}> {}
export class IngestionConflict extends Data.TaggedError("IngestionConflict") {}

export type IngestionServiceShape = {
  readonly ingest: (
    token: string,
    input: SampleIngestionRequestV1,
  ) => Effect.Effect<
    SampleIngestionResponseV1,
    IngestionUnauthorized | IngestionConflict | IngestionStorageError
  >;
};

export class IngestionService extends Context.Tag("health-exporter/IngestionService")<
  IngestionService,
  IngestionServiceShape
>() {}

export function makeIngestionService(repository: IngestionRepository): IngestionServiceShape {
  return {
    ingest: (token, input) =>
      Effect.gen(function* () {
        const tokenHash = yield* Effect.tryPromise({
          try: () => hashDeviceToken(token),
          catch: (cause) => new IngestionStorageError({ cause }),
        });
        const device = yield* Effect.tryPromise({
          try: () => repository.findDeviceByTokenHash(tokenHash),
          catch: (cause) => new IngestionStorageError({ cause }),
        });
        if (
          device === null ||
          device.revokedAt !== null ||
          device.id !== input.device.deviceId ||
          device.installationId !== input.device.installationId
        ) {
          return yield* new IngestionUnauthorized();
        }
        return yield* Effect.tryPromise({
          try: () => repository.ingest(device, input),
          catch: (cause) => {
            if (cause instanceof IngestionClaimUnauthorized) {
              return new IngestionUnauthorized();
            }
            if (cause instanceof IngestionRequestConflict) {
              return new IngestionConflict();
            }
            return new IngestionStorageError({ cause });
          },
        });
      }),
  };
}

export const ingestionServiceLayer = (repository: IngestionRepository) =>
  Layer.succeed(IngestionService, makeIngestionService(repository));

export async function hashDeviceToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
