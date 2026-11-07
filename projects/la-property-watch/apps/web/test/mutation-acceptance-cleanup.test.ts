import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, it } from "node:test";
import { acceptanceCleanupGuard } from "../../../scripts/mutation-acceptance-cleanup.ts";
import { testDatabase } from "./support/d1.ts";

describe("production mutation cleanup guard", () => {
  let database: ReturnType<typeof testDatabase>;
  beforeEach(() => {
    database = testDatabase();
    database.sqlite
      .prepare(
        "INSERT INTO partner_properties (property_key,saved,dismissed,stage,version,created_at,created_by,updated_at,updated_by) VALUES (?,'1','0','Researching',2,?,?,?,?)",
      )
      .run(
        "norfolk-va:15834200",
        "2026-11-07T00:00:00.000Z",
        "ericventor97@gmail.com",
        "2026-11-07T01:00:00.000Z",
        "ericventor97@gmail.com",
      );
    database.sqlite
      .prepare(
        "INSERT INTO user_alert_preferences (user_email,new_activity,worsening_activity,due_follow_ups,updated_at) VALUES (?,?,?,?,?)",
      )
      .run("ericventor97@gmail.com", 1, 1, 1, "2026-11-07T01:00:00.000Z");
    database.sqlite
      .prepare(
        "INSERT INTO property_notes (id,property_key,body,author_email,created_at) VALUES (?,?,?,?,?)",
      )
      .run(
        "acceptance-note",
        "norfolk-va:15834200",
        "temporary",
        "ericventor97@gmail.com",
        "2026-11-07T01:00:00.000Z",
      );
  });
  afterEach(() => database.close());

  it("never cleans genuine official enrichment fetched during acceptance", async () => {
    const script = await readFile(
      new URL("../../../scripts/verify-production-mutations.ts", import.meta.url),
      "utf8",
    );
    assert.doesNotMatch(
      script,
      /DELETE FROM (?:property_enrichment(?:_extensions)?|property_sales|enrichment_runs)/,
    );
    assert.doesNotMatch(script, /DELETE FROM property_rechecks/);
    assert.match(script, /retainedOfficialData/);
    assert.match(script, /Official enrichment was not retained/);
    assert.match(script, /Official tax\/code recheck was not retained/);
    assert.match(script, /official_tax_code_recheck/);
  });

  it("forces the entire D1 cleanup batch to roll back when either exact ownership token changed", async () => {
    const deleteOwnedNote = database.binding
      .prepare("DELETE FROM property_notes WHERE id=? AND author_email=?")
      .bind("acceptance-note", "ericventor97@gmail.com");
    database.sqlite
      .prepare(
        "UPDATE user_alert_preferences SET version=version+1,updated_at=? WHERE user_email=?",
      )
      .run("2026-11-07T02:00:00.000Z", "ericventor97@gmail.com");
    await assert.rejects(
      database.binding.batch([
        deleteOwnedNote,
        acceptanceCleanupGuard(database.binding, {
          propertyKey: "norfolk-va:15834200",
          pipelineVersion: 2,
          pipelineUpdatedAt: "2026-11-07T01:00:00.000Z",
          preferenceUserEmail: "ericventor97@gmail.com",
          preferenceVersion: 1,
        }),
      ]),
      /constraint|guard/i,
    );
    assert.equal(database.sqlite.prepare("SELECT COUNT(*) n FROM property_notes").get()?.["n"], 1);
  });

  it("cleans already-created exact artifacts when a later unrelated token was never obtained", async () => {
    database.sqlite
      .prepare("UPDATE user_alert_preferences SET version=2 WHERE user_email=?")
      .run("ericventor97@gmail.com");
    await database.binding.batch([
      acceptanceCleanupGuard(database.binding, {
        propertyKey: "norfolk-va:15834200",
        pipelineVersion: 2,
        pipelineUpdatedAt: "2026-11-07T01:00:00.000Z",
      }),
      database.binding
        .prepare("DELETE FROM property_notes WHERE id=? AND author_email=?")
        .bind("acceptance-note", "ericventor97@gmail.com"),
    ]);
    assert.equal(database.sqlite.prepare("SELECT COUNT(*) n FROM property_notes").get()?.["n"], 0);
    assert.equal(
      database.sqlite
        .prepare("SELECT version FROM user_alert_preferences WHERE user_email=?")
        .get("ericventor97@gmail.com")?.["version"],
      2,
    );
  });

  it("also rolls back synthetic cleanup when the shared ranking profile changed", async () => {
    database.sqlite
      .prepare(
        "INSERT INTO ranking_adjustment_profile (id,enabled,minimum_samples,maximum_adjustment,reason,version,updated_at,updated_by) VALUES ('shared',0,5,10,'baseline',1,?,?)",
      )
      .run("2026-11-07T01:00:00.000Z", "ericventor97@gmail.com");
    database.sqlite
      .prepare("UPDATE ranking_adjustment_profile SET version=2,updated_at=? WHERE id='shared'")
      .run("2026-11-07T02:00:00.000Z");
    await assert.rejects(
      database.binding.batch([
        database.binding.prepare("DELETE FROM property_notes WHERE id=?").bind("acceptance-note"),
        acceptanceCleanupGuard(database.binding, {
          propertyKey: "norfolk-va:15834200",
          pipelineVersion: 2,
          pipelineUpdatedAt: "2026-11-07T01:00:00.000Z",
          preferenceUserEmail: "ericventor97@gmail.com",
          preferenceVersion: 1,
          rankingProfileVersion: 1,
          rankingProfileUpdatedAt: "2026-11-07T01:00:00.000Z",
        }),
      ]),
      /constraint|guard/i,
    );
    assert.equal(database.sqlite.prepare("SELECT COUNT(*) n FROM property_notes").get()?.["n"], 1);
  });
});
