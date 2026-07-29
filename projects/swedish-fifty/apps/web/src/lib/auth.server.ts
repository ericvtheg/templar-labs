import { createTemplarAuth } from "@templar/auth/tanstack-start";
import * as schema from "../../../../db/schema.ts";
import { templarBindings } from "../../../../templar-bindings.ts";

type AuthEnv = {
  readonly [templarBindings.authSecret]: string;
  readonly [templarBindings.db]: D1Database;
};

export async function getAuth(request: Request) {
  const { env } = await import("cloudflare:workers");
  const bindings = env as AuthEnv;

  return createTemplarAuth({
    project: "swedish-fifty",
    app: "web",
    baseURL: new URL(request.url).origin,
    secret: bindings[templarBindings.authSecret],
    db: bindings[templarBindings.db],
    schema,
    emailAndPassword: {
      enabled: true,
    },
  });
}

export async function getCurrentUser(request: Request) {
  const auth = await getAuth(request);
  const session = await auth.api.getSession({ headers: request.headers });

  return session?.user ?? null;
}

export async function requireCurrentUser(request: Request) {
  const user = await getCurrentUser(request);

  if (user === null) {
    throw new Error("Sign in required.");
  }

  return user;
}
