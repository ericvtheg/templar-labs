import { Context, Effect, Layer, Option } from "effect";
import { type BlobError, BlobNotFoundError, type BlobStorageError } from "./errors";
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

export function makeGetOrFail(get: BlobStorageService["get"]): BlobStorageService["getOrFail"] {
  return (key) =>
    Effect.flatMap(
      get(key),
      Option.match({
        onNone: () => Effect.fail(new BlobNotFoundError({ key })),
        onSome: Effect.succeed,
      }),
    );
}

export function makeText(getOrFail: BlobStorageService["getOrFail"]): BlobStorageService["text"] {
  return (key) => Effect.flatMap(getOrFail(key), (object) => object.text);
}

export function makeJson(getOrFail: BlobStorageService["getOrFail"]): BlobStorageService["json"] {
  return (key) => Effect.flatMap(getOrFail(key), (object) => object.json());
}

export function makeArrayBuffer(
  getOrFail: BlobStorageService["getOrFail"],
): BlobStorageService["arrayBuffer"] {
  return (key) => Effect.flatMap(getOrFail(key), (object) => object.arrayBuffer);
}
