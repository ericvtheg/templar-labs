import { createTemplarAuthApp } from "@templar/auth/app";
import { Effect } from "effect";
import { adminAccessForUser } from "./admin-auth.ts";

type AuthEnv = {
  readonly AUTH_BASE_URL: string;
  readonly AUTH_ISSUER: string;
  readonly AUTH_SECRET: string;
};

export async function getAuth() {
  const { env } = await import("cloudflare:workers");
  const bindings = env as AuthEnv;

  return createTemplarAuthApp({
    baseURL: bindings.AUTH_BASE_URL,
    issuer: bindings.AUTH_ISSUER,
    secret: bindings.AUTH_SECRET,
  });
}

export async function getAdminAccess(request: Request) {
  const auth = await getAuth();
  const session = await auth.api.getSession({ headers: request.headers });

  return adminAccessForUser(session?.user ?? null);
}

export async function requireAdmin(request: Request) {
  const auth = await getAuth();
  return Effect.runPromise(auth.auth.requireAdmin(request));
}
