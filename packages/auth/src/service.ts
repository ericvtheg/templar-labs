import type { Auth as BetterAuth } from "better-auth";
import { Context, Effect, Layer } from "effect";
import { AuthTenantRequiredError, AuthUnauthorizedError } from "./errors.ts";

export type AuthSession = BetterAuth["$Infer"]["Session"];
export type AuthUser = AuthSession["user"] & {
  readonly admin?: boolean;
};

export type TemplarAuthSession = Omit<AuthSession, "user"> & {
  readonly user: AuthUser;
};

export type AuthApi = {
  readonly getSession: (context: {
    readonly headers: Headers;
  }) => Promise<TemplarAuthSession | null>;
};

export type AuthTenant = {
  readonly id: string;
};

export type AuthTenantResolver = (session: TemplarAuthSession) => Effect.Effect<AuthTenant | null>;

export type AuthService = {
  readonly getSession: (request: Request) => Effect.Effect<TemplarAuthSession | null>;
  readonly requireUser: (request: Request) => Effect.Effect<AuthUser, AuthUnauthorizedError>;
  readonly requireAdmin: (request: Request) => Effect.Effect<AuthUser, AuthUnauthorizedError>;
  readonly requireTenant: (request: Request) => Effect.Effect<AuthTenant, AuthTenantRequiredError>;
};

export class Auth extends Context.Tag("@templar/auth/Auth")<Auth, AuthService>() {
  static readonly getSession = Effect.serviceFunctionEffect(this, (auth) => auth.getSession);
  static readonly requireUser = Effect.serviceFunctionEffect(this, (auth) => auth.requireUser);
  static readonly requireAdmin = Effect.serviceFunctionEffect(this, (auth) => auth.requireAdmin);
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
    requireAdmin: (request) =>
      Effect.flatMap(requireUser(request), (user) =>
        user.admin === true
          ? Effect.succeed(user)
          : Effect.fail(new AuthUnauthorizedError({ reason: "admin-required" })),
      ),
    requireTenant,
  };
}

function defaultTenantResolver(session: TemplarAuthSession): Effect.Effect<AuthTenant> {
  return Effect.succeed({ id: session.user.id });
}
