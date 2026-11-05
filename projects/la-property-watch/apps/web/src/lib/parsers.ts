import { isCalendarDate, normalizeApn, type ResearchRecord, statusFor } from "./model.ts";

export const ttcScheduleUrl = "https://ttc.lacounty.gov/schedule-of-upcoming-auctions/";
export const cnpaSourceUrl =
  "https://www.capublicnotice.com/category/legals/notice-of-trustee-sale";
export const cnpaRssUrl = `${cnpaSourceUrl}/rss.xml?county=Los%20Angeles&size=100`;

const monthNumbers: Readonly<Record<string, string>> = {
  january: "01",
  february: "02",
  march: "03",
  april: "04",
  may: "05",
  june: "06",
  july: "07",
  august: "08",
  september: "09",
  october: "10",
  november: "11",
  december: "12",
};

type TaxParseContext = {
  readonly auctionId: string;
  readonly documentUrl: string;
  readonly observedAt: string;
  readonly scheduledDate: string | null;
  readonly scheduledTime: string | null;
};

export type CnpaParseResult = {
  readonly records: readonly ResearchRecord[];
  readonly itemCount: number;
  readonly rejectedCount: number;
};

export function parseTaxAuctionText(text: string, context: TaxParseContext): ResearchRecord[] {
  const normalized = text
    .replace(/\u00a0/g, " ")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ");
  const rowPattern =
    /(?:^|\n)\s*(\d{1,5})\s+(\d{4}-\d{3}-\d{3})\s+\$([\d,]+)(?:\s+(Y))?(?:\s+(\d{3}))?\s+/g;
  const matches = [...normalized.matchAll(rowPattern)];
  const records: ResearchRecord[] = [];
  for (const [index, match] of matches.entries()) {
    const itemNumber = match[1];
    const formattedApn = match[2];
    const minimumBid = match[3];
    if (!itemNumber || !formattedApn || !minimumBid || match.index === undefined) {
      continue;
    }
    const start = match.index + match[0].length;
    const end = matches[index + 1]?.index ?? normalized.length;
    const body = normalized
      .slice(start, end)
      .replace(/\n?Pg \d+[^\n]*/g, " ")
      .replace(/\bITEM AIN MIN BID[\s\S]*?PROPERTY ADDRESS\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    const sourceKey = `${context.auctionId}:${itemNumber}`;
    const address = taxAddressFromBody(body);
    records.push({
      id: `tax:${sourceKey}`,
      saleType: "tax_default",
      sourceKey,
      sourceId: "la-ttc-tax-auction",
      sourceName: "LA County Treasurer and Tax Collector",
      sourceUrl: ttcScheduleUrl,
      sourceDocumentUrl: context.documentUrl,
      sourcePublishedAt: null,
      observedAt: context.observedAt,
      scheduledDate: context.scheduledDate,
      scheduledTime: context.scheduledTime,
      status: statusFor(context.scheduledDate, context.observedAt),
      apn: normalizeApn(formattedApn),
      address: address?.address ?? null,
      city: address?.city ?? null,
      state: address?.state ?? null,
      zip: address?.zip ?? null,
      assessorAddress: null,
      assessorCity: null,
      assessorState: null,
      assessorZip: null,
      assessorObservedAt: null,
      assessorSourceUrl: null,
      itemNumber,
      minimumBidCents: Number(minimumBid.replace(/,/g, "")) * 100,
      unpaidBalanceCents: null,
      trusteeSaleNumber: null,
      trusteeName: null,
      saleVerificationPhone: null,
      salePlace: null,
      legalDescription: body.slice(0, 2_000) || null,
      rawExcerpt: `${itemNumber} ${formattedApn} $${minimumBid} ${body}`.slice(0, 2_500),
      firstSeenAt: context.observedAt,
      lastSeenAt: context.observedAt,
      updatedAt: context.observedAt,
    });
  }
  return records;
}

export function parseTtcSchedule(html: string): {
  readonly auctionId: string;
  readonly documentUrl: string;
  readonly scheduledDate: string | null;
  readonly scheduledTime: string | null;
} {
  const href = [...html.matchAll(/href=["']([^"']*Auction-Book\.pdf)["']/gi)]
    .map((match) => decodeHtml(match[1] ?? ""))
    .find(Boolean);
  if (!href) {
    throw new Error("The TTC schedule did not expose an auction-book PDF.");
  }
  const documentUrl = new URL(href, ttcScheduleUrl).href;
  const auctionId = documentUrl.match(/\/(20\d{2}[A-Z])-Auction-Book\.pdf/i)?.[1] ?? "unknown";
  const pageText = stripHtml(html);
  const start = pageText.match(
    /Online Auction\s*\([^)]*\)[\s\S]{0,800}?Start\s+(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)?\s*,?\s*([A-Z][a-z]+\s+\d{1,2},?\s+20\d{2})(?:\s+at\s+([\d:]+\s+[AP]\.?(?:M)\.?))?/i,
  );
  const schedule = parsePublishedDateTime(start?.[1], start?.[2]);
  return { auctionId, documentUrl, ...schedule };
}

export function parseCnpaRss(xml: string, observedAt: string): CnpaParseResult {
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)];
  const records = new Map<string, ResearchRecord>();
  let rejectedCount = 0;
  for (const item of items) {
    const body = item[1] ?? "";
    const sourceUrl = xmlValue(body, "link");
    const description = xmlValue(body, "content:encoded");
    const published = xmlValue(body, "pubDate");
    if (
      !sourceUrl ||
      !description ||
      !/^https:\/\/www\.capublicnotice\.com\/advert\/-Notices_\d+$/.test(sourceUrl)
    ) {
      rejectedCount += 1;
      continue;
    }
    try {
      const record = parseCnpaNoticeText(description, sourceUrl, observedAt, published);
      records.set(record.sourceKey, record);
    } catch {
      rejectedCount += 1;
    }
  }
  return { records: [...records.values()], itemCount: items.length, rejectedCount };
}

export function parseCnpaNoticeText(
  rawDescription: string,
  sourceUrl: string,
  observedAt: string,
  rawPublishedAt: string | null = null,
): ResearchRecord {
  const description = stripHtml(rawDescription);
  if (
    !/\b(?:Recorder|Official Records|County Recorder)\s+(?:of|in the office of)?\s*(?:the\s+)?(?:County of\s+)?Los Angeles County\b/i.test(
      description,
    )
  ) {
    throw new Error("The notice does not contain Los Angeles County recorder evidence.");
  }
  const advertId = sourceUrl.match(/Notices_(\d+)/)?.[1];
  if (!advertId) {
    throw new Error("The notice URL did not contain a durable ID.");
  }
  const apn = normalizeApn(
    capture(description, /\bA\.?P\.?N\.?:?\s*([\d -]{10,16})/i) ??
      capture(description, /\bAPN:?\s*([\d -]{10,16})/i),
  );
  const scheduled =
    description.match(
      /Date of Sale:\s*:?[ ]*([A-Z][a-z]+\s+\d{1,2},?\s+20\d{2}|\d{1,2}\/\d{1,2}\/20\d{2})(?:\s+at\s+([\d:]+\s*[AP]M))?/i,
    ) ?? description.match(/\bOn\s+(\d{1,2}\/\d{1,2}\/20\d{2})\s+at\s+([\d:]+\s*[AP]M)\b/i);
  const sale = parsePublishedDateTime(scheduled?.[1], scheduled?.[2]);
  const addressText =
    capture(
      description,
      /(?:Street Address or other common designation of real property|Property Address):\s*(.+?)(?=\s+A\.?P\.?N\.?:|\s+APN:|\s+["“]?As Is|\s+The undersigned Trustee|\s+NOTICE OF TRUSTEE)/i,
    ) ??
    capture(
      description,
      /street address and other common designation[^:]*\s+is purported to be:\s*(.+?)(?=\s+The undersigned Trustee|\s+Said sale will)/i,
    );
  const address = addressText ? splitAddress(addressText) : null;
  const amount =
    capture(
      description,
      /(?:Amount of unpaid balance and other charges|Estimated amount of unpaid balance, reasonably estimated costs and other charges):\s*\$\s*([\d,]+(?:\.\d{2})?)/i,
    ) ??
    capture(
      description,
      /total amount of the unpaid balance[^:$]{0,180}(?:is|of):\s*\$\s*([\d,]+(?:\.\d{2})?)/i,
    );
  const sourceKey = `Notices_${advertId}`;
  const publishedDate = rawPublishedAt ? new Date(rawPublishedAt) : null;
  const sourcePublishedAt =
    publishedDate && !Number.isNaN(publishedDate.getTime()) ? publishedDate.toISOString() : null;
  return {
    id: `trustee:${sourceKey}`,
    saleType: "trustee",
    sourceKey,
    sourceId: "cnpa-trustee-notices",
    sourceName: "CNPA Public Notices",
    sourceUrl,
    sourceDocumentUrl: null,
    sourcePublishedAt,
    observedAt,
    scheduledDate: sale.scheduledDate,
    scheduledTime: sale.scheduledTime,
    status: statusFor(sale.scheduledDate, observedAt),
    apn,
    address: address?.address ?? null,
    city: address?.city ?? null,
    state: address?.state ?? null,
    zip: address?.zip ?? null,
    assessorAddress: null,
    assessorCity: null,
    assessorState: null,
    assessorZip: null,
    assessorObservedAt: null,
    assessorSourceUrl: null,
    itemNumber: null,
    minimumBidCents: null,
    unpaidBalanceCents: amount ? Math.round(Number(amount.replace(/,/g, "")) * 100) : null,
    trusteeSaleNumber: capture(description, /\bT\.?S\.?\s*(?:No\.?)?:?\s*([A-Z0-9-]+)/i) ?? null,
    trusteeName:
      capture(
        description,
        /Duly Appointed Trustee:\s*(.+?)(?=\s+Recorded\b|\s+Deed of Trust|\s+Date of Sale:)/i,
      ) ??
      capture(description, /\b([A-Z][A-Z .,&'-]{2,80}),?\s+as duly appointed trustee\b/i) ??
      null,
    saleVerificationPhone:
      capture(
        description,
        /(?:Sale Information Line|Sale Line|FOR SALES INFORMATION|AUTOMATED SALES INFORMATION PLEASE CALL|may call|information please call):?\s*(\(?\d{3}\)?[ .-]*\d{3}[ .-]*\d{4})/i,
      ) ?? null,
    salePlace:
      capture(
        description,
        /Place of Sale:\s*(.+?)(?=\s+(?:Amount|Estimated amount) of unpaid balance|\s+Street Address)/i,
      ) ?? null,
    legalDescription: null,
    rawExcerpt: description.slice(0, 2_500),
    firstSeenAt: observedAt,
    lastSeenAt: observedAt,
    updatedAt: observedAt,
  };
}

export function assessorAddress(attributes: Record<string, unknown>): {
  readonly address: string;
  readonly city: string | null;
  readonly state: string;
  readonly zip: string | null;
} | null {
  const address = stringValue(attributes["SAADDR"]);
  if (!address) {
    return null;
  }
  const second = stringValue(attributes["SAADDR2"]);
  const match = second?.match(/^(.+?)\s+CA\s+(\d{5})(?:-\d{4})?$/i);
  return {
    address,
    city: match?.[1]?.trim() ?? second ?? null,
    state: "CA",
    zip: match?.[2] ?? null,
  };
}

function taxAddressFromBody(body: string) {
  // PDF column wrapping can merge the legal description into the address. Only label
  // vacant land here; the official Assessor query supplies a separate structured address.
  return /\b(?:VACANT LOT|VAC\/VIC)\b/i.test(body)
    ? { address: "Vacant land (published description)", city: null, state: "CA", zip: null }
    : null;
}

function splitAddress(value: string) {
  const normalized = value
    .replace(/\s+/g, " ")
    .replace(/(?:andnot;|¬)\d+$/i, "")
    .trim();
  const commaMatch = normalized.match(
    /^(.+?),\s*([A-Za-z .'-]+),?\s+(?:CA|California)\s+(\d{5})(?:-\d{4})?$/i,
  );
  if (commaMatch?.[1]) {
    return {
      address: commaMatch[1].trim(),
      city: commaMatch[2]?.trim() ?? null,
      state: "CA",
      zip: commaMatch[3] ?? null,
    };
  }
  const zip = normalized.match(/\b(?:CA|California)\s+(\d{5})(?:-\d{4})?$/i)?.[1] ?? null;
  return { address: normalized, city: null, state: "CA", zip };
}

function parsePublishedDateTime(
  rawDate: string | undefined,
  rawTime: string | undefined,
): { readonly scheduledDate: string | null; readonly scheduledTime: string | null } {
  if (!rawDate) {
    return { scheduledDate: null, scheduledTime: null };
  }
  let year: string | undefined;
  let month: string | undefined;
  let day: string | undefined;
  const numeric = rawDate.match(/^(\d{1,2})\/(\d{1,2})\/(20\d{2})$/);
  const named = rawDate.replace(/,/g, "").match(/^([A-Z][a-z]+)\s+(\d{1,2})\s+(20\d{2})$/i);
  if (numeric) {
    month = numeric[1]?.padStart(2, "0");
    day = numeric[2]?.padStart(2, "0");
    year = numeric[3];
  } else if (named) {
    month = named[1] ? monthNumbers[named[1].toLowerCase()] : undefined;
    day = named[2]?.padStart(2, "0");
    year = named[3];
  }
  const scheduledDate = year && month && day ? `${year}-${month}-${day}` : null;
  if (!scheduledDate || !isCalendarDate(scheduledDate)) {
    return { scheduledDate: null, scheduledTime: null };
  }
  const time = rawTime?.replace(/\./g, "").match(/^(\d{1,2}):(\d{2})\s*([AP]M)$/i);
  let scheduledTime: string | null = null;
  if (time?.[1] && time[2] && time[3]) {
    let hour = Number(time[1]);
    if (hour >= 1 && hour <= 12 && Number(time[2]) <= 59) {
      if (time[3].toUpperCase() === "PM" && hour !== 12) {
        hour += 12;
      }
      if (time[3].toUpperCase() === "AM" && hour === 12) {
        hour = 0;
      }
      scheduledTime = `${String(hour).padStart(2, "0")}:${time[2]}`;
    }
  }
  return { scheduledDate, scheduledTime };
}

function xmlValue(item: string, tag: string): string | null {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = item.match(
    new RegExp(`<${escaped}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${escaped}>`, "i"),
  );
  return match?.[1] ? decodeHtml(match[1]).trim() : null;
}

function capture(value: string, pattern: RegExp): string | undefined {
  return value.match(pattern)?.[1]?.replace(/\s+/g, " ").trim();
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function stripHtml(value: string): string {
  return decodeHtml(value.replace(/<br\s*\/?\s*>/gi, "\n").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

export function decodeHtml(value: string): string {
  const named: Readonly<Record<string, string>> = {
    amp: "&",
    apos: "'",
    gt: ">",
    hellip: "…",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (entity, key: string) => {
    if (key.startsWith("#")) {
      const hex = key[1]?.toLowerCase() === "x";
      const codePoint = Number.parseInt(key.slice(hex ? 2 : 1), hex ? 16 : 10);
      if (
        !Number.isInteger(codePoint) ||
        codePoint < 0 ||
        codePoint > 0x10ffff ||
        (codePoint >= 0xd800 && codePoint <= 0xdfff)
      ) {
        return "\uFFFD";
      }
      return String.fromCodePoint(codePoint);
    }
    return named[key.toLowerCase()] ?? entity;
  });
}
