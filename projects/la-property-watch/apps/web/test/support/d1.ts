import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";

type TestStatement = D1PreparedStatement & { executeForBatch: () => D1Result };

export function testDatabase() {
  const sqlite = new DatabaseSync(":memory:");
  let failBatchAfterStatement: number | null = null;
  let afterAllHook: { pattern: RegExp; callback: () => void } | null = null;
  sqlite.exec("PRAGMA foreign_keys = ON");
  const migrations = new URL("../../../../db/migrations/", import.meta.url);
  for (const name of readdirSync(migrations)
    .filter((file) => file.endsWith(".sql"))
    .toSorted()) {
    sqlite.exec(readFileSync(new URL(name, migrations), "utf8"));
  }
  const prepare = (sql: string): TestStatement => {
    let values: SQLInputValue[] = [];
    const rows = () => sqlite.prepare(sql).all(...values) as Record<string, unknown>[];
    const executeForBatch = () => {
      const statement = sqlite.prepare(sql);
      if (statement.columns().length > 0) {
        return {
          success: true,
          results: statement.all(...values),
          meta: { changes: 0 },
        } as unknown as D1Result;
      }
      const result = statement.run(...values);
      return {
        success: true,
        results: [],
        meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) },
      } as unknown as D1Result;
    };
    return {
      bind(...params: unknown[]) {
        if (params.length > 100) {
          throw new Error(`D1 variable limit exceeded: ${params.length} bound values.`);
        }
        values = params as SQLInputValue[];
        return this;
      },
      first(column?: string) {
        const row = rows()[0];
        return Promise.resolve(column === undefined ? (row ?? null) : (row?.[column] ?? null));
      },
      all() {
        const result = {
          success: true,
          results: rows(),
          meta: { changes: 0 },
        } as unknown as D1Result;
        if (afterAllHook?.pattern.test(sql)) {
          const callback = afterAllHook.callback;
          afterAllHook = null;
          callback();
        }
        return Promise.resolve(result);
      },
      raw() {
        const statement = sqlite.prepare(sql);
        statement.setReturnArrays(true);
        return Promise.resolve(statement.all(...values) as unknown as unknown[][]);
      },
      run() {
        return Promise.resolve(executeForBatch());
      },
      executeForBatch,
    } as unknown as TestStatement;
  };
  const binding = {
    prepare,
    async batch(statements: D1PreparedStatement[]) {
      sqlite.exec("BEGIN IMMEDIATE");
      try {
        const results = statements.map((statement, index) => {
          if (failBatchAfterStatement !== null && index >= failBatchAfterStatement) {
            failBatchAfterStatement = null;
            throw new Error("Injected transactional batch failure.");
          }
          return (statement as TestStatement).executeForBatch();
        });
        sqlite.exec("COMMIT");
        return results;
      } catch (cause) {
        sqlite.exec("ROLLBACK");
        throw cause;
      }
    },
  } as unknown as D1Database;
  return {
    binding,
    sqlite,
    failNextBatchAfterStatement(index: number) {
      failBatchAfterStatement = index;
    },
    afterNextAll(pattern: RegExp, callback: () => void) {
      afterAllHook = { pattern, callback };
    },
    close: () => sqlite.close(),
  };
}
