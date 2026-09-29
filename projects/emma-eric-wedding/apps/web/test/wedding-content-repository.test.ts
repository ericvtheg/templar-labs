import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { test } from "node:test";
import { makeDatabase } from "@templar/db";
import * as schema from "../../../db/schema.ts";
import { makeWeddingContentRepository } from "../src/lib/wedding-content-repository.server.ts";
import {
  createWeddingContentService,
  type WeddingContentCommit,
} from "../src/lib/wedding-content-service.ts";
import { defaultWeddingPage, type WeddingPageData } from "../src/lib/wedding-page.ts";

type TestD1Statement = D1PreparedStatement & { readonly executeForBatch: () => D1Result };

function d1Adapter(sqlite: DatabaseSync): D1Database {
  const prepare = (sql: string): TestD1Statement => {
    let values: SQLInputValue[] = [];

    const queryRows = () => sqlite.prepare(sql).all(...values) as Record<string, unknown>[];
    const executeForBatch = (): D1Result => {
      const statement = sqlite.prepare(sql);
      if (statement.columns().length > 0) {
        return { results: statement.all(...values), success: true } as D1Result;
      }
      const result = statement.run(...values);
      return {
        results: [],
        success: true,
        meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) },
      } as unknown as D1Result;
    };

    return {
      bind(...params: unknown[]) {
        values = params as SQLInputValue[];
        return this;
      },
      first(column?: string) {
        const row = queryRows()[0];
        return Promise.resolve(column === undefined ? (row ?? null) : (row?.[column] ?? null));
      },
      all() {
        return Promise.resolve({ results: queryRows(), success: true } as D1Result);
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
    } as unknown as TestD1Statement;
  };

  return {
    prepare,
    batch(statements: D1PreparedStatement[]) {
      sqlite.exec("BEGIN IMMEDIATE");
      try {
        const results = statements.map((statement) =>
          (statement as TestD1Statement).executeForBatch(),
        );
        sqlite.exec("COMMIT");
        return Promise.resolve(results);
      } catch (error) {
        sqlite.exec("ROLLBACK");
        return Promise.reject(error);
      }
    },
  } as unknown as D1Database;
}

function changedPage(font: "classic" | "modern", title: string): WeddingPageData {
  return {
    ...structuredClone(defaultWeddingPage),
    root: { props: { ...defaultWeddingPage.root.props, id: "root", font } },
    content: defaultWeddingPage.content.map((block) =>
      block.type === "StoryBlock" ? { ...block, props: { ...block.props, title } } : block,
    ),
  };
}

test("persists drafts, publishes, revisions, and compare-and-swap through SQLite-backed D1", async () => {
  const sqlite = new DatabaseSync(":memory:");
  try {
    sqlite.exec("PRAGMA foreign_keys = ON");
    sqlite.exec(
      readFileSync(new URL("../../../db/migrations/0007_free_raza.sql", import.meta.url), "utf8"),
    );
    const database = makeDatabase(d1Adapter(sqlite), { schema });
    const firstRepository = makeWeddingContentRepository(database);
    let nextRevision = 0;
    let tick = 0;
    const service = createWeddingContentService(firstRepository, {
      createId: () => `sqlite-revision-${++nextRevision}`,
      now: () => new Date(Date.UTC(2026, 8, 29, 15, 0, tick++)),
    });

    const draft = changedPage("classic", "Saved only in SQLite");
    await service.saveDraft({ data: draft, expectedVersion: 0, actor: { id: "editor-1" } });
    assert.equal(await service.loadPublished(), null);

    const reloadedRepository = makeWeddingContentRepository(database);
    const reloadedService = createWeddingContentService(reloadedRepository, {
      createId: () => `sqlite-revision-${++nextRevision}`,
      now: () => new Date(Date.UTC(2026, 8, 29, 15, 0, tick++)),
    });
    const reloaded = await reloadedService.loadEditor();
    assert.equal(reloaded.version, 1);
    assert.deepEqual(reloaded.draft, draft);
    assert.equal(reloaded.revisions[0]?.action, "save");

    const published = await reloadedService.publish({
      data: draft,
      expectedVersion: 1,
      actor: { id: "editor-2" },
    });
    assert.equal(published.version, 2);
    assert.deepEqual(await reloadedService.loadPublished(), draft);

    const current = await reloadedRepository.readDocument();
    assert.ok(current);
    const contenders = [
      { id: "cas-classic", data: changedPage("classic", "First contender") },
      { id: "cas-modern", data: changedPage("modern", "Second contender") },
    ];
    const commits = contenders.map<WeddingContentCommit>(({ id, data }) => ({
      expectedVersion: current.version,
      document: {
        ...current,
        version: current.version + 1,
        draft: data,
        updatedAt: new Date("2026-09-29T16:00:00.000Z"),
        updatedBy: id,
      },
      revision: {
        id,
        version: current.version + 1,
        action: "save",
        data,
        createdAt: new Date("2026-09-29T16:00:00.000Z"),
        createdBy: id,
      },
    }));
    const results = await Promise.all(commits.map((commit) => reloadedRepository.commit(commit)));
    const winner = results.find((result) => result !== null);
    assert.ok(winner);
    assert.equal(results.filter((result) => result === null).length, 1);

    const finalState = await reloadedService.loadEditor();
    assert.equal(finalState.version, 3);
    assert.equal(finalState.revisions.length, 3);
    assert.deepEqual(finalState.published, draft);
    assert.deepEqual(finalState.draft, winner.draft);
  } finally {
    sqlite.close();
  }
});
