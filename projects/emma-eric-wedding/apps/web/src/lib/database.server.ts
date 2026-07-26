import { makeDatabase } from "@templar/db";
import * as schema from "../../../../db/schema.ts";

export type WeddingDatabase = ReturnType<typeof makeDatabase<typeof schema>>;

export async function getWeddingDatabase(): Promise<WeddingDatabase> {
  const { env } = await import("cloudflare:workers");
  const bindings = env as { readonly DB: D1Database };

  return makeDatabase(bindings.DB, { schema });
}
