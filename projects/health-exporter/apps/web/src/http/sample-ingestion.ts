import { Effect } from "effect";
import { contractLimitsV1, sampleIngestionRequestV1Schema } from "../contracts/v1.ts";
import {
  IngestionConflict,
  type IngestionServiceShape,
  IngestionStorageError,
  IngestionUnauthorized,
} from "../domain/service.ts";

const jsonHeaders = { "content-type": "application/json; charset=utf-8" };

export function makeSampleIngestionHandler(service: IngestionServiceShape) {
  return async (request: Request): Promise<Response> => {
    const token = bearerToken(request.headers.get("authorization"));
    if (token === null) {
      return json({ error: "unauthorized" }, 401);
    }

    const contentLength = parseContentLength(request.headers.get("content-length"));
    if (contentLength !== null && contentLength > contractLimitsV1.maxRequestBodyBytes) {
      return json({ error: "payload_too_large" }, 413);
    }

    let body: unknown;
    try {
      const bytes = await readBody(request, contractLimitsV1.maxRequestBodyBytes);
      body = JSON.parse(new TextDecoder().decode(bytes));
    } catch (error) {
      if (error instanceof BodyTooLarge) {
        return json({ error: "payload_too_large" }, 413);
      }
      return json({ error: "invalid_json" }, 400);
    }
    const parsed = sampleIngestionRequestV1Schema.safeParse(body);
    if (!parsed.success) {
      return json(
        {
          error: "validation_failed",
          issues: parsed.error.issues.map(({ path, message }) => ({ path, message })),
        },
        422,
      );
    }

    const result = await Effect.runPromise(
      service.ingest(token, parsed.data).pipe(
        Effect.match({
          onFailure: (error) => error,
          onSuccess: (value) => value,
        }),
      ),
    );
    if (result instanceof IngestionUnauthorized) {
      return json({ error: "unauthorized" }, 401);
    }
    if (result instanceof IngestionConflict) {
      return json({ error: "request_id_conflict" }, 409);
    }
    if (result instanceof IngestionStorageError) {
      return json({ error: "service_unavailable" }, 503);
    }
    return json(result, 200);
  };
}

class BodyTooLarge extends Error {}

function parseContentLength(value: string | null): number | null {
  if (value === null || !/^\d+$/.test(value)) {
    return null;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

async function readBody(request: Request, limit: number): Promise<Uint8Array> {
  if (request.body === null) {
    return new Uint8Array();
  }
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  // Stream reads are intentionally sequential so the byte limit is enforced before buffering more data.
  while (true) {
    // oxlint-disable-next-line eslint/no-await-in-loop
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    size += value.byteLength;
    if (size > limit) {
      // oxlint-disable-next-line eslint/no-await-in-loop
      await reader.cancel();
      throw new BodyTooLarge();
    }
    chunks.push(value);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

function bearerToken(value: string | null): string | null {
  if (value === null) {
    return null;
  }
  const match = /^Bearer ([A-Za-z0-9._~-]{32,512})$/.exec(value);
  return match?.[1] ?? null;
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}
