import { Effect } from "effect";
import { contractLimitsV1, healthSyncRequestV1Schema } from "../contracts/v1.ts";
import {
  HealthConflict,
  type HealthSyncServiceShape,
  HealthUnauthorized,
} from "../domain/service.ts";

const headers = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };

export function makeHealthSyncHandler(service: HealthSyncServiceShape) {
  return async (request: Request): Promise<Response> => {
    const token = bearerToken(request);
    if (token === null) {
      return json({ error: "unauthorized" }, 401);
    }
    const length = Number(request.headers.get("content-length"));
    if (Number.isFinite(length) && length > contractLimitsV1.maxRequestBodyBytes) {
      return json({ error: "payload_too_large" }, 413);
    }
    let input: unknown;
    try {
      input = JSON.parse(await readBoundedBody(request, contractLimitsV1.maxRequestBodyBytes));
    } catch (error) {
      if (error instanceof BodyTooLarge) {
        return json({ error: "payload_too_large" }, 413);
      }
      return json({ error: "invalid_json" }, 400);
    }
    const parsed = healthSyncRequestV1Schema.safeParse(input);
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
      service
        .ingest(token, parsed.data)
        .pipe(Effect.match({ onFailure: (error) => error, onSuccess: (value) => value })),
    );
    if (result instanceof HealthUnauthorized) {
      return json({ error: "unauthorized" }, 401);
    }
    if (result instanceof HealthConflict) {
      return json({ error: "request_id_conflict" }, 409);
    }
    if (result instanceof Error) {
      return json({ error: "service_unavailable" }, 503);
    }
    return json(result, 200);
  };
}

export function makeSyncStatusHandler(service: HealthSyncServiceShape) {
  return async (request: Request): Promise<Response> => {
    const token = bearerToken(request);
    if (token === null) {
      return json({ error: "unauthorized" }, 401);
    }
    const result = await Effect.runPromise(
      service
        .status(token)
        .pipe(Effect.match({ onFailure: (error) => error, onSuccess: (value) => value })),
    );
    if (result instanceof HealthUnauthorized) {
      return json({ error: "unauthorized" }, 401);
    }
    if (result instanceof Error) {
      return json({ error: "service_unavailable" }, 503);
    }
    return json(result, 200);
  };
}

function bearerToken(request: Request): string | null {
  return /^Bearer ([\w.~-]{32,512})$/.exec(request.headers.get("authorization") ?? "")?.[1] ?? null;
}

class BodyTooLarge extends Error {}

async function readBoundedBody(request: Request, limit: number): Promise<string> {
  if (request.body === null) {
    return "";
  }
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- stream reads must be sequential.
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    size += value.byteLength;
    if (size > limit) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- cancellation follows the bounded read.
      await reader.cancel();
      throw new BodyTooLarge();
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function json(value: unknown, status: number) {
  return new Response(JSON.stringify(value), { status, headers });
}
