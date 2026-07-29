import { createTemplarAuthApp } from "@templar/auth/app";
import { Effect } from "effect";
import { adminAccessForUser } from "./admin-auth.ts";

type AuthEnv = {
  readonly AUTH_SECRET: string;
  readonly TEMPLAR_AUTH_ISSUER: string;
};

export async function getAuth(request: Request) {
  const { env } = await import("cloudflare:workers");
  const bindings = env as AuthEnv;

  return createTemplarAuthApp({
    baseURL: new URL(request.url).origin,
    issuer: bindings.TEMPLAR_AUTH_ISSUER,
    secret: bindings.AUTH_SECRET,
  });
}

export async function getAdminAccess(request: Request) {
  const auth = await getAuth(request);
  const session = await auth.api.getSession({ headers: request.headers });

  return adminAccessForUser(session?.user ?? null);
}

export async function requireAdmin(request: Request) {
  const auth = await getAuth(request);
  return Effect.runPromise(auth.auth.requireAdmin(request));
}
