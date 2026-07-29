import { Effect } from "effect";
import type { ApiPermissionCatalog, ApiPermissionGrant } from "./manifest.ts";
import type { ApiAuthService, ApiPrincipal } from "./service.ts";

export type ApiAuthRouteContext = {
  readonly request: Request;
  readonly params?: Readonly<Record<string, string>>;
};

export type AuthenticatedApiRouteContext<TContext extends ApiAuthRouteContext> = TContext & {
  readonly principal: ApiPrincipal;
};

export function withApiKey<
  TCatalog extends ApiPermissionCatalog,
  TContext extends ApiAuthRouteContext,
>(
  options: {
    readonly apiAuth: () => ApiAuthService<TCatalog> | Promise<ApiAuthService<TCatalog>>;
    readonly permissions: ApiPermissionGrant<TCatalog>;
  },
  handler: (context: AuthenticatedApiRouteContext<TContext>) => Response | Promise<Response>,
): (context: TContext) => Promise<Response> {
  return async (context) => {
    const key = bearerKey(context.request.headers.get("authorization"));
    if (key === null) {
      return unauthorized();
    }

    try {
      const apiAuth = await options.apiAuth();
      const verification = await Effect.runPromise(
        apiAuth.verifyKey({ key, permissions: options.permissions }),
      );
      if (!verification.authenticated) {
        return verification.reason === "insufficient-permissions"
          ? Response.json(
              {
                error: {
                  code: "forbidden",
                  message: "The API key lacks the required permission.",
                },
              },
              { status: 403 },
            )
          : unauthorized();
      }

      return await handler({ ...context, principal: verification.principal });
    } catch {
      return Response.json(
        {
          error: {
            code: "api-auth-error",
            message: "API authentication is temporarily unavailable.",
          },
        },
        { status: 500 },
      );
    }
  };
}

export function bearerKey(authorization: string | null): string | null {
  if (authorization === null) {
    return null;
  }
  const match = /^Bearer ([^\s]+)$/iu.exec(authorization.trim());
  return match?.[1] ?? null;
}

function unauthorized(): Response {
  return Response.json(
    {
      error: {
        code: "unauthorized",
        message: "A valid API key is required.",
      },
    },
    {
      status: 401,
      headers: {
        "WWW-Authenticate": "Bearer",
      },
    },
  );
}
