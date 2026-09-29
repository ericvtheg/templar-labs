import { createTemplarAuthApp } from "@templar/auth/app";
import { Effect } from "effect";
import { adminAccessForUser } from "./admin-auth.ts";
import { editorAccessForUser, parseEditorEmailAllowlist } from "./editor-access.ts";

type AuthEnv = {
  readonly AUTH_SECRET: string;
  readonly TEMPLAR_AUTH_ISSUER: string;
  readonly WEDDING_EDITOR_EMAILS?: string;
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

export async function getEditorAccess(request: Request) {
  const [auth, bindings] = await Promise.all([getAuth(request), getAuthBindings()]);
  const session = await auth.api.getSession({ headers: request.headers });
  return editorAccessForUser(
    session?.user ?? null,
    parseEditorEmailAllowlist(bindings.WEDDING_EDITOR_EMAILS),
  );
}

export async function requireWeddingEditor(request: Request) {
  const [auth, bindings] = await Promise.all([getAuth(request), getAuthBindings()]);
  const user = await Effect.runPromise(auth.auth.requireUser(request));
  const access = editorAccessForUser(
    user,
    parseEditorEmailAllowlist(bindings.WEDDING_EDITOR_EMAILS),
  );
  if (access !== "authorized") {
    throw new Error("Wedding editor access required.");
  }

  return { id: user.id };
}

async function getAuthBindings(): Promise<AuthEnv> {
  const { env } = await import("cloudflare:workers");
  return env as AuthEnv;
}
