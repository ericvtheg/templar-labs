import { defaultSources } from "../src/lib/repository.ts";

const currentOnly = process.argv.includes("--current-only");
const requestedSource = process.argv.find((value) => value.startsWith("--source="))?.slice(9);
const currentSourceIds = new Set([
  "travis-tax-delinquency",
  "norfolk-delinquent-property-tax",
  "norfolk-code-violations",
  "nyc-acris-common-charge-liens",
  "denver-public-trustee-ned",
]);
const selected = defaultSources().filter(
  (source) =>
    (!requestedSource || source.id === requestedSource) &&
    (!currentOnly || currentSourceIds.has(source.id)),
);
let failed = false;
for (const source of selected) {
  const started = Date.now();
  try {
    // Deliberately sequential to avoid hitting unrelated public agencies in a burst.
    // eslint-disable-next-line no-await-in-loop
    const result = await source.load();
    console.log(
      JSON.stringify({
        sourceId: result.sourceId,
        records: result.records.length,
        sourceUpdatedAt: result.sourceUpdatedAt ?? null,
        snapshotComplete: result.snapshotComplete === true,
        warnings: result.warnings,
        elapsedMs: Date.now() - started,
      }),
    );
  } catch (cause) {
    failed = true;
    console.error(
      JSON.stringify({
        sourceId: source.id,
        error: cause instanceof Error ? cause.message : "Unknown source error",
        elapsedMs: Date.now() - started,
      }),
    );
  }
}
if (failed) {
  process.exitCode = 1;
}
