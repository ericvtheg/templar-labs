import type { Effect } from "effect";
import type { BlobStorageError } from "./errors";

export type BlobBody = string | Uint8Array | ArrayBuffer;

export type BlobMetadata = Readonly<Record<string, string>>;

export type BlobHttpMetadata = {
  readonly contentType?: string;
  readonly cacheControl?: string;
  readonly contentDisposition?: string;
  readonly contentEncoding?: string;
  readonly contentLanguage?: string;
};

export type PutBlobInput = {
  readonly key: string;
  readonly body: BlobBody;
  readonly metadata?: BlobMetadata;
  readonly httpMetadata?: BlobHttpMetadata;
};

export type ListBlobsInput = {
  readonly prefix?: string;
  readonly cursor?: string;
  readonly limit?: number;
};

export type BlobObject = {
  readonly key: string;
  readonly size: number;
  readonly etag: string | undefined;
  readonly uploaded: Date | undefined;
  readonly httpMetadata: BlobHttpMetadata;
  readonly metadata: BlobMetadata;
};

export type BlobObjectBody = BlobObject & {
  readonly arrayBuffer: Effect.Effect<ArrayBuffer, BlobStorageError>;
  readonly text: Effect.Effect<string, BlobStorageError>;
  readonly json: <A = unknown>() => Effect.Effect<A, BlobStorageError>;
};

export type ListBlobsResult = {
  readonly objects: ReadonlyArray<BlobObject>;
  readonly truncated: boolean;
  readonly cursor: string | undefined;
};
