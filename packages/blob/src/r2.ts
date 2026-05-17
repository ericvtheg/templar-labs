import { Effect, Option } from "effect";
import { type BlobOperation, BlobStorageError } from "./errors";
import { withBlobLogging } from "./logging";
import {
  type BlobStorageService,
  makeArrayBuffer,
  makeBlobStorageLayer,
  makeGetOrFail,
  makeJson,
  makeText,
} from "./service";
import type {
  BlobBody,
  BlobHttpMetadata,
  BlobMetadata,
  BlobObject,
  BlobObjectBody,
  ListBlobsInput,
  ListBlobsResult,
  PutBlobInput,
} from "./types";

export type R2ObjectLike = {
  readonly key: string;
  readonly size: number;
  readonly etag?: string;
  readonly httpEtag?: string;
  readonly uploaded?: Date;
  readonly httpMetadata?: BlobHttpMetadata;
  readonly customMetadata?: Record<string, string>;
};

export type R2ObjectBodyLike = R2ObjectLike & {
  readonly arrayBuffer: () => Promise<ArrayBuffer>;
  readonly text: () => Promise<string>;
  readonly json: <A = unknown>() => Promise<A>;
};

export type R2PutOptionsLike = {
  readonly httpMetadata?: BlobHttpMetadata;
  readonly customMetadata?: BlobMetadata;
};

export type R2ListOptionsLike = {
  readonly prefix?: string;
  readonly cursor?: string;
  readonly limit?: number;
};

export type R2ListResultLike = {
  readonly objects: ReadonlyArray<R2ObjectLike>;
  readonly truncated: boolean;
  readonly cursor?: string;
};

export type R2BucketLike = {
  readonly get: (key: string) => Promise<R2ObjectBodyLike | null>;
  readonly head: (key: string) => Promise<R2ObjectLike | null>;
  readonly put: (key: string, value: BlobBody, options?: R2PutOptionsLike) => Promise<R2ObjectLike>;
  readonly delete: (key: string) => Promise<void>;
  readonly list: (options?: R2ListOptionsLike) => Promise<R2ListResultLike>;
};

export function makeR2BlobStorage(bucket: R2BucketLike): BlobStorageService {
  const service = {
    put: (input: PutBlobInput) =>
      tryR2({
        operation: "put",
        key: input.key,
        try: () =>
          bucket.put(input.key, input.body, putOptionsFromInput(input)).then(normalizeObject),
      }),
    get: (key: string) =>
      tryR2({
        operation: "get",
        key,
        try: async () => {
          const object = await bucket.get(key);
          return Option.fromNullable(object).pipe(Option.map(normalizeObjectBody));
        },
      }),
    head: (key: string) =>
      tryR2({
        operation: "head",
        key,
        try: async () => {
          const object = await bucket.head(key);
          return Option.fromNullable(object).pipe(Option.map(normalizeObject));
        },
      }),
    delete: (key: string) =>
      tryR2({
        operation: "delete",
        key,
        try: () => bucket.delete(key),
      }),
    list: (input?: ListBlobsInput) =>
      tryR2({
        operation: "list",
        try: () =>
          bucket.list(input).then(
            (result): ListBlobsResult => ({
              objects: result.objects.map(normalizeObject),
              truncated: result.truncated,
              cursor: result.cursor,
            }),
          ),
      }),
  } satisfies Omit<BlobStorageService, "getOrFail" | "text" | "json" | "arrayBuffer">;

  const getOrFail = makeGetOrFail(service.get);

  return {
    ...service,
    getOrFail,
    text: makeText(getOrFail),
    json: makeJson(getOrFail),
    arrayBuffer: makeArrayBuffer(getOrFail),
  };
}

export function r2BlobStorageLayer(bucket: R2BucketLike) {
  return makeBlobStorageLayer(makeR2BlobStorage(bucket));
}

function putOptionsFromInput(input: PutBlobInput): R2PutOptionsLike | undefined {
  if (input.httpMetadata === undefined && input.metadata === undefined) {
    return undefined;
  }

  return {
    ...(input.httpMetadata === undefined ? {} : { httpMetadata: input.httpMetadata }),
    ...(input.metadata === undefined ? {} : { customMetadata: input.metadata }),
  };
}

function normalizeObject(object: R2ObjectLike): BlobObject {
  return {
    key: object.key,
    size: object.size,
    etag: object.etag ?? object.httpEtag,
    uploaded: object.uploaded,
    httpMetadata: object.httpMetadata ?? {},
    metadata: object.customMetadata ?? {},
  };
}

function normalizeObjectBody(object: R2ObjectBodyLike): BlobObjectBody {
  return {
    ...normalizeObject(object),
    arrayBuffer: tryR2({
      operation: "read",
      key: object.key,
      try: () => object.arrayBuffer(),
    }),
    text: tryR2({
      operation: "read",
      key: object.key,
      try: () => object.text(),
    }),
    json: <A = unknown>() =>
      tryR2({
        operation: "read",
        key: object.key,
        try: () => object.json<A>(),
      }),
  };
}

function tryR2<A>(input: {
  readonly operation: BlobOperation;
  readonly key?: string;
  readonly try: () => PromiseLike<A>;
}): Effect.Effect<A, BlobStorageError> {
  return Effect.tryPromise({
    try: input.try,
    catch: (cause) =>
      new BlobStorageError({
        operation: input.operation,
        key: input.key,
        cause,
      }),
  }).pipe(
    withBlobLogging({
      provider: "r2",
      operation: input.operation,
      ...(input.key === undefined ? {} : { key: input.key }),
    }),
  );
}
