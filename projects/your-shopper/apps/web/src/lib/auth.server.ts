import { createTemplarUserApp } from "@templar/users";
import { Effect } from "effect";

export async function getAuth(request: Request) {
  const { env } = await import("cloudflare:workers");
  const bindings = env as unknown as {
    readonly AUTH_ISSUER: string;
    readonly AUTH_SECRET: string;
    readonly DB: D1Database;
  };

  return createTemplarUserApp({
    baseURL: new URL(request.url).origin,
    issuer: bindings.AUTH_ISSUER,
    secret: bindings.AUTH_SECRET,
    db: bindings.DB,
  });
}

export async function requireAdmin(request: Request) {
  const auth = await getAuth(request);
  return Effect.runPromise(auth.auth.requireAdmin(request));
}
