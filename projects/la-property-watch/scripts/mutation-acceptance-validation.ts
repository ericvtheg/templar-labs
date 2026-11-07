import { parseCsv } from "../apps/web/src/lib/decision-support/csv.ts";

export function isClassifiedTestOnlyBenchmarkExport(csv: string): boolean {
  const parsed = parseCsv(csv);
  if (parsed.status !== "ok" || parsed.value.rows.length !== 2) {
    return false;
  }
  const { headers, rows } = parsed.value;
  const mode = headers.indexOf("mode");
  const classification = headers.indexOf("classification");
  const interpretation = headers.indexOf("interpretation");
  return (
    mode >= 0 &&
    classification >= 0 &&
    interpretation >= 0 &&
    rows.every(
      (row) =>
        row[mode] === "test-only" &&
        row[classification] ===
          "TEST-ONLY / SYNTHETIC TEST FIXTURE — NO COMPETITOR PERFORMANCE CLAIM" &&
        row[interpretation] ===
          "descriptive-only; no statistical significance or superiority claim",
    )
  );
}
