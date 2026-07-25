import type { BetterAuthClientOptions } from "better-auth/client";
import { createAuthClient } from "better-auth/react";

export type TemplarAuthClientConfig = BetterAuthClientOptions;

export function createTemplarAuthClient<const Config extends TemplarAuthClientConfig>(
  config?: Config,
): ReturnType<typeof createAuthClient<Config>> {
  return createAuthClient(config);
}
