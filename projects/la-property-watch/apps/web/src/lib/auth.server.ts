import { createTemplarAuthApp } from "@templar/auth/app";
import { canAccessResearch } from "./access.ts";

export type Bindings = {
  readonly AUTH_SECRET: string;
  readonly TEMPLAR_AUTH_ISSUER: string;
  readonly DB: D1Database;
  readonly JOBS: Queue<string>;
  readonly INGESTION_RUNNER?: string;
};

export async function getBindings(): Promise<Bindings> {
  const { env } = await import("cloudflare:workers");
  return env as unknown as Bindings;
}

export function getAuth(request: Request, bindings: Bindings) {
  return createTemplarAuthApp({
    baseURL: new URL(request.url).origin,
    issuer: bindings.TEMPLAR_AUTH_ISSUER,
    secret: bindings.AUTH_SECRET,
    selectGoogleAccount: true,
    integration: {
      onAuthenticated: ({ user }) => {
        if (!canAccessResearch(user)) {
          return Promise.reject(new Error("This account is not authorized for this application."));
        }
        return Promise.resolve();
      },
    },
  });
}
