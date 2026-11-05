import { fetchTaxAuction, fetchTrusteeNotices } from "../src/lib/sources.ts";

const startedAt = new Date().toISOString();
const [tax, trustee] = await Promise.all([fetchTaxAuction(), fetchTrusteeNotices()]);

const summarize = (result: typeof tax) => ({
  sourceId: result.sourceId,
  records: result.records.length,
  scheduledDates: result.records.filter((record) => record.scheduledDate !== null).length,
  parcelIds: result.records.filter((record) => record.apn !== null).length,
  publishedAddresses: result.records.filter((record) => record.address !== null).length,
  assessorMatches: result.records.filter((record) => record.assessorAddress !== null).length,
  warnings: result.warnings,
});

console.log(
  JSON.stringify(
    {
      startedAt,
      finishedAt: new Date().toISOString(),
      sources: [summarize(tax), summarize(trustee)],
    },
    null,
    2,
  ),
);
