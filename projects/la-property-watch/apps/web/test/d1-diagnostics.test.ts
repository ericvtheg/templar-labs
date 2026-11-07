import assert from "node:assert/strict";
import { test } from "node:test";
import { safeD1ErrorSummary } from "../../../scripts/ingest-production.ts";

test("provider diagnostics classify failures without logging response messages or secrets", () => {
  const result = safeD1ErrorSummary([
    {
      code: 7500,
      message: "Account secret-token exceeded maximum rows written per day",
      detail: "secret-details",
    },
  ]);
  assert.equal(result, "code 7500: row usage, limit exceeded, authorization");
  assert.doesNotMatch(result, /secret/);
  assert.equal(
    safeD1ErrorSummary([{ code: 7500, message: "D1 database exceeds storage size" }]),
    "code 7500: limit exceeded, storage",
  );
  assert.equal(safeD1ErrorSummary([{ message: "secret-token" }]), "code unknown: authorization");
  assert.equal(safeD1ErrorSummary(undefined), "provider detail unavailable");
  assert.equal(safeD1ErrorSummary([null]), "unclassified provider error");
});
