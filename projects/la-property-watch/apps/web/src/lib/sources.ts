import { getDocumentProxy } from "unpdf";
import { normalizeApn, type ResearchRecord } from "./model.ts";
import {
  assessorAddress,
  cnpaRssUrl,
  cnpaSourceUrl,
  orangeCountyPublishedNoticesUrl,
  parseCnpaRss,
  parseOrangeCountyPowerToSellText,
  parseOrangeCountyPublishedNotices,
  parseOrangeCountyThreeYearDelinquencyText,
  parseTaxAuctionText,
  parseTtcSchedule,
  ttcScheduleUrl,
} from "./parsers.ts";

const assessorQueryUrl =
  "https://assessor.gis.lacounty.gov/assessor/rest/services/PAIS/pais_parcels/MapServer/0/query";
const assessorLayerUrl =
  "https://assessor.gis.lacounty.gov/assessor/rest/services/PAIS/pais_parcels/MapServer/0";
const textBodyLimit = 2 * 1024 * 1024;
const pdfBodyLimit = 25 * 1024 * 1024;
const sourceTimeoutMs = 30_000;

export type SourceResult = {
  readonly sourceId: string;
  readonly sourceName: string;
  readonly sourceUrl: string;
  readonly records: readonly ResearchRecord[];
  readonly warnings: readonly string[];
};

export async function fetchTaxAuction(
  fetchImpl: typeof fetch = fetch,
  now: Date = new Date(),
): Promise<SourceResult> {
  const scheduleHtml = await fetchText(fetchImpl, ttcScheduleUrl, textBodyLimit);
  const schedule = parseTtcSchedule(scheduleHtml);
  const pdfBytes = await fetchBytes(fetchImpl, schedule.documentUrl, pdfBodyLimit);
  const observedAt = now.toISOString();
  const records = parseTaxAuctionText(await extractPdfText(pdfBytes), { ...schedule, observedAt });
  if (records.length === 0) {
    throw new Error("The TTC auction book was readable but no property rows were recognized.");
  }
  return {
    sourceId: "la-ttc-tax-auction",
    sourceName: "LA County Treasurer and Tax Collector",
    sourceUrl: ttcScheduleUrl,
    records: await enrichFromAssessor(records, fetchImpl, observedAt),
    warnings: schedule.scheduledDate
      ? []
      : ["Auction rows were imported, but the TTC page did not expose a recognized start date."],
  };
}

export async function fetchTrusteeNotices(
  fetchImpl: typeof fetch = fetch,
  now: Date = new Date(),
): Promise<SourceResult> {
  const observedAt = now.toISOString();
  const xml = await fetchText(fetchImpl, cnpaRssUrl, textBodyLimit);
  const parsed = parseCnpaRss(xml, observedAt);
  if (parsed.itemCount === 0) {
    throw new Error("The permitted CNPA RSS feed did not contain any notice items.");
  }
  if (parsed.records.length === 0) {
    throw new Error(
      "CNPA returned notice items, but none had verified Los Angeles County evidence.",
    );
  }
  const warnings: string[] = [];
  if (parsed.rejectedCount > 0) {
    warnings.push(
      `${parsed.rejectedCount} RSS item(s) were rejected because required provenance or county evidence was missing.`,
    );
  }
  const missingDate = parsed.records.filter((record) => record.scheduledDate === null).length;
  const missingApn = parsed.records.filter((record) => record.apn === null).length;
  const missingAddress = parsed.records.filter((record) => record.address === null).length;
  if (missingDate || missingApn || missingAddress) {
    warnings.push(
      `Recognized ${parsed.records.length} LA notice(s); missing published fields: ${missingDate} sale date, ${missingApn} APN, ${missingAddress} address.`,
    );
  }
  return {
    sourceId: "cnpa-trustee-notices",
    sourceName: "CNPA Public Notices",
    sourceUrl: cnpaSourceUrl,
    records: await enrichFromAssessor(parsed.records, fetchImpl, observedAt),
    warnings,
  };
}

export async function fetchOrangeCountyThreeYearDelinquencies(
  fetchImpl: typeof fetch = fetch,
  now: Date = new Date(),
): Promise<SourceResult> {
  const noticeHtml = await fetchText(fetchImpl, orangeCountyPublishedNoticesUrl, textBodyLimit);
  const notice = parseOrangeCountyPublishedNotices(noticeHtml).threeYearDelinquency;
  if (!notice) {
    throw new Error("The Orange County notice page did not expose a three-year delinquency PDF.");
  }
  const observedAt = now.toISOString();
  const pdfBytes = await fetchBytes(fetchImpl, notice.documentUrl, pdfBodyLimit);
  const records = parseOrangeCountyThreeYearDelinquencyText(await extractPdfText(pdfBytes), {
    documentUrl: notice.documentUrl,
    observedAt,
  });
  if (records.length === 0) {
    throw new Error("The Orange County three-year delinquency PDF had no recognized parcel rows.");
  }
  const malformed = records.filter((record) => record.apn === null).length;
  return {
    sourceId: "oc-three-year-tax-delinquency",
    sourceName: "Orange County Treasurer-Tax Collector · Three-Year Delinquency",
    sourceUrl: orangeCountyPublishedNoticesUrl,
    records,
    warnings: [
      `Historical county snapshot limited to parcels whose latest reminder was returned undeliverable; ${malformed} source parcel ID(s) were preserved but not normalized. Current payment status is not verified.`,
    ],
  };
}

export async function fetchOrangeCountyPowerToSell(
  fetchImpl: typeof fetch = fetch,
  now: Date = new Date(),
): Promise<SourceResult> {
  const noticeHtml = await fetchText(fetchImpl, orangeCountyPublishedNoticesUrl, textBodyLimit);
  const notice = parseOrangeCountyPublishedNotices(noticeHtml).powerToSell;
  if (!notice) {
    throw new Error("The Orange County notice page did not expose an impending power-to-sell PDF.");
  }
  const observedAt = now.toISOString();
  const pdfBytes = await fetchBytes(fetchImpl, notice.documentUrl, pdfBodyLimit);
  const records = parseOrangeCountyPowerToSellText(await extractPdfText(pdfBytes), {
    documentUrl: notice.documentUrl,
    observedAt,
  });
  if (records.length === 0) {
    throw new Error("The Orange County power-to-sell PDF had no recognized parcel rows.");
  }
  if (new Set(records.map((record) => record.sourceRecordId)).size !== records.length) {
    throw new Error("The Orange County power-to-sell PDF produced duplicate parcel identifiers.");
  }
  return {
    sourceId: "oc-impending-power-to-sell",
    sourceName: "Orange County Treasurer-Tax Collector · Impending Power to Sell",
    sourceUrl: orangeCountyPublishedNoticesUrl,
    records,
    warnings: [
      "Historical county snapshot only. Power to sell is not an auction date, and current redemption or sale status is not verified.",
    ],
  };
}

export async function extractPdfText(buffer: ArrayBuffer): Promise<string> {
  const document = await getDocumentProxy(new Uint8Array(buffer), {
    enableXfa: false,
    maxImageSize: 16_777_216,
    useSystemFonts: false,
  });
  try {
    if (document.numPages > 150) {
      throw new Error("The source PDF exceeds the 150-page safety limit.");
    }
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      // Sequential page cleanup bounds Worker memory during a queued refresh.
      // eslint-disable-next-line no-await-in-loop
      const page = await document.getPage(pageNumber);
      // eslint-disable-next-line no-await-in-loop
      const content = await page.getTextContent();
      let text = "";
      let previousY: number | undefined;
      for (const item of content.items) {
        if (!("str" in item)) {
          continue;
        }
        const y = item.transform[5] as number | undefined;
        if (previousY !== undefined && y !== undefined && Math.abs(previousY - y) > 2) {
          text += "\n";
        }
        text += `${item.str}${item.hasEOL ? "\n" : " "}`;
        previousY = y;
      }
      pages.push(text);
      page.cleanup();
    }
    return pages.join("\n");
  } finally {
    await document.cleanup();
  }
}

async function enrichFromAssessor(
  records: readonly ResearchRecord[],
  fetchImpl: typeof fetch,
  observedAt: string,
): Promise<ResearchRecord[]> {
  const byApn = new Map<string, NonNullable<ReturnType<typeof assessorAddress>>>();
  const apns = [...new Set(records.flatMap((record) => (record.apn ? [record.apn] : [])))];
  const batches: string[][] = [];
  for (let index = 0; index < apns.length; index += 100) {
    batches.push(apns.slice(index, index + 100));
  }
  // At most three official queries run together. Combined with the 30-second request timeout,
  // this bounds optional enrichment without turning the protected refresh request synchronous.
  for (let index = 0; index < batches.length; index += 3) {
    const group = batches.slice(index, index + 3);
    // eslint-disable-next-line no-await-in-loop
    const results = await Promise.allSettled(
      group.map(async (batch) => {
        const params = new URLSearchParams({
          f: "json",
          outFields: "AIN,FORMATTED_AIN,SAADDR,SAADDR2",
          returnGeometry: "false",
          where: `AIN IN (${batch.map((apn) => `'${apn}'`).join(",")})`,
        });
        return JSON.parse(
          await fetchText(fetchImpl, `${assessorQueryUrl}?${params}`, textBodyLimit),
        ) as { features?: Array<{ attributes?: Record<string, unknown> }> };
      }),
    );
    for (const result of results) {
      if (result.status !== "fulfilled") {
        continue;
      }
      for (const feature of result.value.features ?? []) {
        const ain = normalizeApn(String(feature.attributes?.["AIN"] ?? ""));
        const address = assessorAddress(feature.attributes ?? {});
        if (ain && address) {
          byApn.set(ain, address);
        }
      }
    }
  }
  return records.map((record) => {
    const assessor = record.apn ? byApn.get(record.apn) : undefined;
    return assessor
      ? {
          ...record,
          assessorAddress: assessor.address,
          assessorCity: assessor.city,
          assessorState: assessor.state,
          assessorZip: assessor.zip,
          assessorObservedAt: observedAt,
          assessorSourceUrl: `${assessorLayerUrl}?AIN=${record.apn}`,
        }
      : record;
  });
}
async function fetchText(fetchImpl: typeof fetch, url: string, limit: number): Promise<string> {
  return new TextDecoder().decode(await fetchBytes(fetchImpl, url, limit));
}

async function fetchBytes(
  fetchImpl: typeof fetch,
  url: string,
  limit: number,
): Promise<ArrayBuffer> {
  const response = await fetchImpl(url, {
    headers: {
      accept: "text/html,application/xml,application/rss+xml,application/pdf,application/json",
      "user-agent": "TemplarLabs-LAPropertyWatch/1.0 (+https://la-property-watch.breli.app)",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(sourceTimeoutMs),
  });
  if (!response.ok) {
    throw new Error(`Source request failed with HTTP ${response.status}.`);
  }
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > limit) {
    throw new Error(`Source response exceeded the ${limit}-byte safety limit.`);
  }
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > limit) {
    throw new Error(`Source response exceeded the ${limit}-byte safety limit.`);
  }
  return bytes;
}
