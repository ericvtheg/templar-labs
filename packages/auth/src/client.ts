import { createAuthClient } from "better-auth/react";

export type TemplarAuthClientConfig = {
  readonly baseURL?: string;
  readonly basePath?: string;
};

export function createTemplarAuthClient(
  config: TemplarAuthClientConfig = {},
): ReturnType<typeof createAuthClient> {
  return createAuthClient(config);
}
