import { Context, Effect, Layer, Option } from "effect";
import type { BlobStorageDriver } from "./driver";
import { type BlobError, BlobNotFoundError, type BlobStorageError } from "./errors";
import { withBlobLogging } from "./logging";
import type {
  BlobObject,
  BlobObjectBody,
  ListBlobsInput,
  ListBlobsResult,
  PutBlobInput,
} from "./types";

export type BlobStorageService = {
  readonly put: (input: PutBlobInput) => Effect.Effect<BlobObject, BlobStorageError>;
  readonly get: (key: string) => Effect.Effect<Option.Option<BlobObjectBody>, BlobStorageError>;
  readonly getOrFail: (key: string) => Effect.Effect<BlobObjectBody, BlobError>;
  readonly head: (key: string) => Effect.Effect<Option.Option<BlobObject>, BlobStorageError>;
  readonly delete: (key: string) => Effect.Effect<void, BlobStorageError>;
  readonly list: (input?: ListBlobsInput) => Effect.Effect<ListBlobsResult, BlobStorageError>;
  readonly text: (key: string) => Effect.Effect<string, BlobError>;
  readonly json: <A = unknown>(key: string) => Effect.Effect<A, BlobError>;
  readonly arrayBuffer: (key: string) => Effect.Effect<ArrayBuffer, BlobError>;
};

export class BlobStorage extends Context.Tag("@templar/blob/BlobStorage")<
  BlobStorage,
  BlobStorageService
>() {
  static readonly put = Effect.serviceFunctionEffect(this, (storage) => storage.put);
  static readonly get = Effect.serviceFunctionEffect(this, (storage) => storage.get);
  static readonly getOrFail = Effect.serviceFunctionEffect(this, (storage) => storage.getOrFail);
  static readonly head = Effect.serviceFunctionEffect(this, (storage) => storage.head);
  static readonly delete = Effect.serviceFunctionEffect(this, (storage) => storage.delete);
  static readonly list = Effect.serviceFunctionEffect(this, (storage) => storage.list);
  static readonly text = Effect.serviceFunctionEffect(this, (storage) => storage.text);
  static readonly json = Effect.serviceFunctionEffect(this, (storage) => storage.json);
  static readonly arrayBuffer = Effect.serviceFunctionEffect(
    this,
    (storage) => storage.arrayBuffer,
  );
}

export function makeBlobStorageLayer(service: BlobStorageService): Layer.Layer<BlobStorage> {
  return Layer.succeed(BlobStorage, service);
}

export function makeBlobStorageService(input: {
  readonly provider: string;
  readonly driver: BlobStorageDriver;
}): BlobStorageService {
  const getOrFail = makeGetOrFail(input.driver.get);

  return withBlobStorageLogging(input.provider, {
    ...input.driver,
    getOrFail,
    text: makeText(getOrFail),
    json: makeJson(getOrFail),
    arrayBuffer: makeArrayBuffer(getOrFail),
  });
}

function makeGetOrFail(get: BlobStorageService["get"]): BlobStorageService["getOrFail"] {
  return (key) =>
    Effect.flatMap(
      get(key),
      Option.match({
        onNone: () => Effect.fail(new BlobNotFoundError({ key })),
        onSome: Effect.succeed,
      }),
    );
}

function makeText(getOrFail: BlobStorageService["getOrFail"]): BlobStorageService["text"] {
  return (key) => Effect.flatMap(getOrFail(key), (object) => object.text);
}

function makeJson(getOrFail: BlobStorageService["getOrFail"]): BlobStorageService["json"] {
  return (key) => Effect.flatMap(getOrFail(key), (object) => object.json());
}

function makeArrayBuffer(
  getOrFail: BlobStorageService["getOrFail"],
): BlobStorageService["arrayBuffer"] {
  return (key) => Effect.flatMap(getOrFail(key), (object) => object.arrayBuffer);
}

function withBlobStorageLogging(provider: string, service: BlobStorageService): BlobStorageService {
  return {
    put: (input) =>
      service.put(input).pipe(
        withBlobLogging({
          provider,
          operation: "put",
          key: input.key,
        }),
      ),
    get: (key) =>
      service.get(key).pipe(
        withBlobLogging({
          provider,
          operation: "get",
          key,
        }),
      ),
    getOrFail: (key) =>
      service.getOrFail(key).pipe(
        withBlobLogging({
          provider,
          operation: "get",
          key,
        }),
      ),
    head: (key) =>
      service.head(key).pipe(
        withBlobLogging({
          provider,
          operation: "head",
          key,
        }),
      ),
    delete: (key) =>
      service.delete(key).pipe(
        withBlobLogging({
          provider,
          operation: "delete",
          key,
        }),
      ),
    list: (input) =>
      service.list(input).pipe(
        withBlobLogging({
          provider,
          operation: "list",
        }),
      ),
    text: (key) =>
      service.text(key).pipe(
        withBlobLogging({
          provider,
          operation: "read",
          key,
        }),
      ),
    json: <A = unknown>(key: string) =>
      service.json<A>(key).pipe(
        withBlobLogging({
          provider,
          operation: "read",
          key,
        }),
      ),
    arrayBuffer: (key) =>
      service.arrayBuffer(key).pipe(
        withBlobLogging({
          provider,
          operation: "read",
          key,
        }),
      ),
  };
}
