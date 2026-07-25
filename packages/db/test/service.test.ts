import assert from "node:assert/strict";
import test from "node:test";
import { Effect } from "effect";
import { Database, makeDatabaseLayer, makeDatabaseService, withDatabase } from "../src/service.ts";

test("Database layer provides the configured Drizzle client", async () => {
  const db = { marker: "db" };
  const layer = makeDatabaseLayer(
    makeDatabaseService({
      provider: "d1",
      db: db as never,
    }),
  );

  const result = await Effect.runPromise(
    Effect.gen(function* () {
      const database = yield* Database;
      const fromHelper = yield* withDatabase((client) => Effect.succeed(client));

      return {
        provider: database.provider,
        db: database.db,
        fromHelper,
      };
    }).pipe(Effect.provide(layer)),
  );

  assert.equal(result.provider, "d1");
  assert.equal(result.db, db);
  assert.equal(result.fromHelper, db);
});
