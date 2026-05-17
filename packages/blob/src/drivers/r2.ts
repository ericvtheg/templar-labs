import { Option } from "effect";
import { type BlobStorageDriver, tryBlobStoragePromise } from "../driver";
import { type BlobStorageService, makeBlobStorageLayer, makeBlobStorageService } from "../service";
import type {
  BlobBody,
  BlobHttpMetadata,
  BlobMetadata,
  BlobObject,
  BlobObjectBody,
  ListBlobsInput,
  ListBlobsResult,
  PutBlobInput,
} from "../types";

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
  const driver = {
    put: (input: PutBlobInput) =>
      tryBlobStoragePromise({
        operation: "put",
        key: input.key,
        try: () =>
          bucket.put(input.key, input.body, putOptionsFromInput(input)).then(normalizeObject),
      }),
    get: (key: string) =>
      tryBlobStoragePromise({
        operation: "get",
        key,
        try: async () => {
          const object = await bucket.get(key);
          return Option.fromNullable(object).pipe(Option.map(normalizeObjectBody));
        },
      }),
    head: (key: string) =>
      tryBlobStoragePromise({
        operation: "head",
        key,
        try: async () => {
          const object = await bucket.head(key);
          return Option.fromNullable(object).pipe(Option.map(normalizeObject));
        },
      }),
    delete: (key: string) =>
      tryBlobStoragePromise({
        operation: "delete",
        key,
        try: () => bucket.delete(key),
      }),
    list: (input?: ListBlobsInput) =>
      tryBlobStoragePromise({
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
  } satisfies BlobStorageDriver;

  return makeBlobStorageService({
    provider: "r2",
    driver,
  });
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
    arrayBuffer: tryBlobStoragePromise({
      operation: "read",
      key: object.key,
      try: () => object.arrayBuffer(),
    }),
    text: tryBlobStoragePromise({
      operation: "read",
      key: object.key,
      try: () => object.text(),
    }),
    json: <A = unknown>() =>
      tryBlobStoragePromise({
        operation: "read",
        key: object.key,
        try: () => object.json<A>(),
      }),
  };
}
