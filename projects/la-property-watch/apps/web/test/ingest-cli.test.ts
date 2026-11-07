import assert from "node:assert/strict";
import test from "node:test";
import { parseIngestionArgs } from "../../../scripts/ingest-production.ts";

test("targeted ingestion selects only the exact registered source", () => {
  const options = parseIngestionArgs(["--source=nyc-acris-common-charge-liens"]);
  assert.deepEqual(
    options.sources?.map((source) => source.id),
    ["nyc-acris-common-charge-liens"],
  );
  assert.equal(options.queuedOnly, false);
  assert.equal(parseIngestionArgs([]).sources, undefined);
  assert.equal(parseIngestionArgs(["--queued-only"]).queuedOnly, true);
  assert.equal(parseIngestionArgs(["--enrich-norfolk=32464650"]).enrichmentParcel, "32464650");
});
test("invalid or ambiguous ingestion arguments fail closed", () => {
  for (const args of [
    ["--source="],
    ["--source=unknown"],
    ["--oops"],
    ["--enrich-norfolk=11605"],
    ["--enrich-norfolk=00011605", "--queued-only"],
    ["--source=nyc-acris-common-charge-liens", "--queued-only"],
    ["--source=nyc-acris-common-charge-liens", "--source=nyc-acris-common-charge-liens"],
  ]) {
    assert.throws(() => parseIngestionArgs(args));
  }
});
