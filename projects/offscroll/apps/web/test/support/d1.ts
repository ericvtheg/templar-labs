import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";

// Exercise the real Drizzle D1 driver and the generated migration against SQLite.
export function testDatabase() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  const dir = new URL("../../../../db/migrations/", import.meta.url);
  for (const name of readdirSync(dir)
    .filter((fileName) => fileName.endsWith(".sql"))
    .toSorted()) {
    sqlite.exec(readFileSync(new URL(name, dir), "utf8"));
  }
  const prepare = (query: string, values: SQLInputValue[] = []) => ({
    bind: (...bound: SQLInputValue[]) => prepare(query, bound),
    run: () => {
      const result = sqlite.prepare(query).run(...values);
      return {
        success: true,
        results: [],
        meta: { changes: Number(result.changes) },
      };
    },
    all: () =>
      Promise.resolve({
        success: true,
        results: sqlite.prepare(query).all(...values),
        meta: { changes: 0 },
      }),
    raw: () => {
      const statement = sqlite.prepare(query);
      statement.setReturnArrays(true);
      return Promise.resolve(statement.all(...values));
    },
  });
  const binding = {
    prepare,
    batch: (statements: ReturnType<typeof prepare>[]) => {
      sqlite.exec("BEGIN");
      try {
        const results = statements.map((statement) => statement.run());
        sqlite.exec("COMMIT");
        return Promise.resolve(results);
      } catch (cause) {
        sqlite.exec("ROLLBACK");
        throw cause;
      }
    },
  } as unknown as D1Database;
  return { binding, sqlite, close: () => sqlite.close() };
}
