import {
  createTemplarFirstPartyHandler,
  templarFirstPartyAudience,
} from "@templar/auth/first-party";
import { jwt } from "@templar/auth/plugins";
import { createTemplarAuthServer } from "@templar/auth/tanstack-start";
import { platformAdminEmails } from "./access.ts";

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

  const auth = createTemplarAuthServer({
    project: "templar-auth",
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
    trustedOrigins: ["http://localhost:5181", "https://auth.breli.app"],
    plugins: [
      jwt({
        disableSettingJwtHeader: true,
        jwt: {
          issuer: bindings.AUTH_BASE_URL,
          audience: templarFirstPartyAudience,
          expirationTime: "1 minute",
        },
      }),
    ],
  });
  const jwtApi = auth.api as typeof auth.api & {
    readonly signJWT: (input: {
      readonly body: { readonly payload: Record<string, unknown> };
    }) => Promise<{ readonly token: string }>;
  };

  return {
    ...auth,
    handler: createTemplarFirstPartyHandler({
      auth,
      db: bindings.DB,
      baseURL: bindings.AUTH_BASE_URL,
      adminEmails: platformAdminEmails,
      signToken: async (payload) => (await jwtApi.signJWT({ body: { payload } })).token,
    }),
  };
}
