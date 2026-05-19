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

export type AuthTenantResolver = (session: AuthSession) => Effect.Effect<AuthTenant | null>;

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

export type AuthServiceInput = {
  readonly api: AuthApi;
  readonly tenant?: AuthTenantResolver;
};

export function makeAuthLayer(service: AuthService): Layer.Layer<Auth> {
  return Layer.succeed(Auth, service);
}

export function authLayer(input: AuthServiceInput): Layer.Layer<Auth> {
  return makeAuthLayer(makeAuthService(input));
}

export function makeAuthService(input: AuthServiceInput): AuthService {
  const getSession: AuthService["getSession"] = (request) =>
    Effect.promise(() => input.api.getSession({ headers: request.headers }));

  const requireUser: AuthService["requireUser"] = (request) =>
    Effect.flatMap(getSession(request), (session) =>
      session === null
        ? Effect.fail(new AuthUnauthorizedError({ reason: "missing-session" }))
        : Effect.succeed(session.user),
    );

  const resolveTenant = input.tenant ?? defaultTenantResolver;
  const requireTenant: AuthService["requireTenant"] = (request) =>
    Effect.flatMap(getSession(request), (session) =>
      session === null
        ? Effect.fail(new AuthTenantRequiredError({ reason: "missing-tenant" }))
        : Effect.flatMap(resolveTenant(session), (tenant) =>
            tenant === null
              ? Effect.fail(new AuthTenantRequiredError({ reason: "missing-tenant" }))
              : Effect.succeed(tenant),
          ),
    );

  return {
    getSession,
    requireUser,
    requireTenant,
  };
}

function defaultTenantResolver(session: AuthSession): Effect.Effect<AuthTenant> {
  return Effect.succeed({ id: session.user.id });
}
