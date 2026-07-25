export { AuthTenantRequiredError, AuthUnauthorizedError } from "./errors.ts";
export {
  Auth,
  type AuthApi,
  type AuthService,
  type AuthServiceInput,
  type AuthSession,
  type AuthTenant,
  type AuthTenantResolver,
  type AuthUser,
  authLayer,
  makeAuthService,
  type TemplarAuthSession,
} from "./service.ts";
