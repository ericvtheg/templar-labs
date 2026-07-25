import { createTemplarAuth } from "@templar/auth/tanstack-start";
import { adminAccessForUser, isAdminEmail } from "./admin-auth.ts";

type AuthEnv = {
  readonly AUTH_BASE_URL: string;
  readonly AUTH_SECRET: string;
  readonly DB: D1Database;
  readonly GOOGLE_CLIENT_ID: string;
  readonly GOOGLE_CLIENT_SECRET: string;
};

export async function getAuth() {
  const { env } = await import("cloudflare:workers");
  const bindings = env as AuthEnv;

  return createTemplarAuth({
    project: "emma-eric-wedding",
    app: "web",
    baseURL: bindings.AUTH_BASE_URL,
    secret: bindings.AUTH_SECRET,
    db: bindings.DB,
    oauth: {
      google: {
        clientId: bindings.GOOGLE_CLIENT_ID,
        clientSecret: bindings.GOOGLE_CLIENT_SECRET,
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: (user) => Promise.resolve(user.emailVerified && isAdminEmail(user.email)),
        },
      },
    },
  });
}

export async function getAdminAccess(request: Request) {
  const auth = await getAuth();
  const session = await auth.api.getSession({ headers: request.headers });

  return adminAccessForUser(session?.user ?? null);
}

export async function requireAdmin(request: Request) {
  const auth = await getAuth();
  const session = await auth.api.getSession({ headers: request.headers });

  if (session === null || !isAdminEmail(session.user.email)) {
    throw new Error("Admin access required.");
  }

  return session.user;
}
