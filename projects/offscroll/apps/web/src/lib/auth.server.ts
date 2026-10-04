import { createTemplarUserApp } from "@templar/users";

export async function getBindings() {
  const { env } = await import("cloudflare:workers");
  return env as unknown as {
    DB: D1Database;
    AUTH_SECRET: string;
    TEMPLAR_AUTH_ISSUER: string;
  };
}

export async function getAuth(request: Request) {
  const bindings = await getBindings();
  return createTemplarUserApp({
    baseURL: new URL(request.url).origin,
    issuer: bindings.TEMPLAR_AUTH_ISSUER,
    secret: bindings.AUTH_SECRET,
    db: bindings.DB,
  });
}
