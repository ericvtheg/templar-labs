// This file infers types for the cloudflare:workers environment from the Alchemy Worker.
// @see https://alchemy.run/concepts/bindings/#type-safe-bindings

import type { website } from "../../../alchemy.run.ts";
import type { templarBindings } from "../../../templar-bindings.ts";

type StandardBindings = {
  readonly [templarBindings.db]: D1Database;
};

export type CloudflareEnv = typeof website.Env & StandardBindings;

declare global {
  type Env = CloudflareEnv;
}

declare module "cloudflare:workers" {
  namespace Cloudflare {
    export interface Env extends CloudflareEnv {}
  }
}
