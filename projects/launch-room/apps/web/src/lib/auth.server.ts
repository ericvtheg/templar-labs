import { createTemplarAuth } from "@templar/auth/tanstack-start";
import * as schema from "../../db/schema.ts";

export async function getAuth() {
  const { env } = await import("cloudflare:workers");
  const bindings = env as {
    readonly AUTH_BASE_URL: string;
    readonly AUTH_SECRET: string;
    readonly DB: D1Database;
  };

  return createTemplarAuth({
    project: "launch-room",
    app: "web",
    baseURL: bindings.AUTH_BASE_URL,
    secret: bindings.AUTH_SECRET,
    db: bindings.DB,
    schema,
    emailAndPassword: {
      enabled: true,
    },
  });
}
