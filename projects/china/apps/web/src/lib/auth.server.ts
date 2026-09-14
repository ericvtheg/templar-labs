import { createTemplarAuthApp } from "@templar/auth/app";
import { canAccessChina } from "./access.ts";
export type Bindings = {
  AUTH_SECRET: string;
  TEMPLAR_AUTH_ISSUER: string;
  CREW_EMAILS: string;
  DB: D1Database;
};
export function getAuth(request: Request, bindings: Bindings) {
  return createTemplarAuthApp({
    baseURL: new URL(request.url).origin,
    issuer: bindings.TEMPLAR_AUTH_ISSUER,
    secret: bindings.AUTH_SECRET,
    integration: {
      onAuthenticated: ({ user }) => {
        if (!canAccessChina(user, bindings.CREW_EMAILS ?? "")) {
          return Promise.reject(new Error("This account is not on the crew list."));
        }
        return Promise.resolve();
      },
    },
  });
}
