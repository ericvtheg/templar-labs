import { Data } from "effect";

export class AuthConfigError extends Data.TaggedError("AuthConfigError")<{
  readonly field: string;
  readonly message: string;
}> {}

export class AuthUnauthorizedError extends Data.TaggedError("AuthUnauthorizedError")<{
  readonly reason: "missing-session";
}> {}

export class AuthTenantRequiredError extends Data.TaggedError("AuthTenantRequiredError")<{
  readonly reason: "missing-tenant";
}> {}

export type AuthError = AuthConfigError | AuthUnauthorizedError | AuthTenantRequiredError;
