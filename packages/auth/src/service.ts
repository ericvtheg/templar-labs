import type { Auth as BetterAuth } from "better-auth";
import { Context, Effect, Layer } from "effect";
import { AuthTenantRequiredError, AuthUnauthorizedError } from "./errors.ts";

export type AuthSession = BetterAuth["$Infer"]["Session"];

export type AuthApi = {
  readonly getSession: (context: { readonly headers: Headers }) => Promise<AuthSession | null>;
};

export type AuthTenant = {
  readonly id: string;
};

export type AuthService = {
  readonly getSession: (request: Request) => Effect.Effect<AuthSession | null>;
  readonly requireUser: (
    request: Request,
  ) => Effect.Effect<AuthSession["user"], AuthUnauthorizedError>;
  readonly requireTenant: (request: Request) => Effect.Effect<AuthTenant, AuthTenantRequiredError>;
};

export class Auth extends Context.Tag("@templar/auth/Auth")<Auth, AuthService>() {
  static readonly getSession = Effect.serviceFunctionEffect(this, (auth) => auth.getSession);
  static readonly requireUser = Effect.serviceFunctionEffect(this, (auth) => auth.requireUser);
  static readonly requireTenant = Effect.serviceFunctionEffect(this, (auth) => auth.requireTenant);
}

export function makeAuthLayer(service: AuthService): Layer.Layer<Auth> {
  return Layer.succeed(Auth, service);
}

export function makeAuthService(auth: { readonly api: AuthApi }): AuthService {
  const getSession: AuthService["getSession"] = (request) =>
    Effect.promise(() => auth.api.getSession({ headers: request.headers }));

  const requireUser: AuthService["requireUser"] = (request) =>
    Effect.flatMap(getSession(request), (session) =>
      session === null
        ? Effect.fail(new AuthUnauthorizedError({ reason: "missing-session" }))
        : Effect.succeed(session.user),
    );

  return {
    getSession,
    requireUser,
    requireTenant: () => Effect.fail(new AuthTenantRequiredError({ reason: "missing-tenant" })),
  };
}
