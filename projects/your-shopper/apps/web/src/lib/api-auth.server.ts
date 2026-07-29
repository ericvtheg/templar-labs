import { createTemplarApiAuth } from "@templar/api-auth";
import { apiAuthManifest } from "./api-auth-manifest.ts";

export async function getApiAuth() {
  const { env } = await import("cloudflare:workers");
  const bindings = env as unknown as {
    readonly API_AUTH_SECRET: string;
    readonly DB: D1Database;
  };

  return createTemplarApiAuth({
    db: bindings.DB,
    manifest: apiAuthManifest,
    secrets: [{ version: 1, value: bindings.API_AUTH_SECRET }],
  });
}
