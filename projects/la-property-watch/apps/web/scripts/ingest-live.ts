import {
  fetchOrangeCountyPowerToSell,
  fetchOrangeCountyThreeYearDelinquencies,
  fetchTaxAuction,
  fetchTrusteeNotices,
  type SourceResult,
} from "../src/lib/sources.ts";

const startedAt = new Date().toISOString();
const definitions = [
  ["oc-three-year-tax-delinquency", fetchOrangeCountyThreeYearDelinquencies],
  ["oc-impending-power-to-sell", fetchOrangeCountyPowerToSell],
  ["la-ttc-tax-auction", fetchTaxAuction],
  ["cnpa-trustee-notices", fetchTrusteeNotices],
] as const;
const outcomes = await Promise.allSettled(definitions.map(([, load]) => load()));

const summarize = (result: SourceResult) => ({
  sourceId: result.sourceId,
  status: "fulfilled" as const,
  records: result.records.length,
  signalTypes: Object.fromEntries(
    [...new Set(result.records.map((record) => record.signalType))].map((signalType) => [
      signalType,
      result.records.filter((record) => record.signalType === signalType).length,
    ]),
  ),
  jurisdictions: [...new Set(result.records.map((record) => record.jurisdictionName))],
  scheduledDates: result.records.filter((record) => record.scheduledDate !== null).length,
  eventDates: result.records.filter((record) => record.eventDate !== null).length,
  normalizedParcelIds: result.records.filter((record) => record.apn !== null).length,
  literalSourceIds: new Set(result.records.map((record) => record.sourceRecordId)).size,
  publishedAddresses: result.records.filter((record) => record.address !== null).length,
  assessorMatches: result.records.filter((record) => record.assessorAddress !== null).length,
  warnings: result.warnings,
});

const sources = outcomes.map((outcome, index) =>
  outcome.status === "fulfilled"
    ? summarize(outcome.value)
    : {
        sourceId: definitions[index]?.[0] ?? "unknown",
        status: "rejected" as const,
        error: outcome.reason instanceof Error ? outcome.reason.message : "Unknown source failure.",
      },
);
console.log(
  JSON.stringify(
    {
      startedAt,
      finishedAt: new Date().toISOString(),
      sources,
    },
    null,
    2,
  ),
);
if (outcomes.every((outcome) => outcome.status === "rejected")) {
  process.exitCode = 1;
}
