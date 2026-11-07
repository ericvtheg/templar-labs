const denverSearchUrl = "https://denvergov.org/foreclosuresearch/";
const formPrefix = "ctl00$ctl00$MainContent$CustomContentPlaceHolder$";
const sourceTimeoutMs = 35_000;
const overallTimeoutMs = 120_000;
const responseBodyLimit = 2 * 1024 * 1024;
const maxRequests = 16;
const maxPages = 12;
const paginationDelayMs = 200;
const nedLookbackDays = 90;

export type DenverForeclosureRecord = {
  readonly jurisdictionId: "denver-co";
  readonly caseId: string;
  readonly signalType: "mortgage_foreclosure_initiated";
  readonly eventType: "ned_recorded";
  readonly rawStatus: string;
  readonly street: string;
  readonly city: "Denver";
  readonly state: "CO";
  readonly zip: string | null;
  readonly nedRecordedDate: string | null;
  readonly nedDocumentNumber: string | null;
  readonly scheduledSaleDate: string | null;
  readonly principalAmountCents: number | null;
  readonly principalAsOfDate: string | null;
  readonly sourceAsOf: string;
  readonly fetchedAt: string;
  readonly sourceSearchUrl: typeof denverSearchUrl;
};

export type DenverForeclosureResult = {
  readonly records: DenverForeclosureRecord[];
  readonly warnings: string[];
  readonly complete: boolean;
  readonly sourceUpdatedAt: string | null;
  readonly scope: string;
};

export type DenverParsedSearchPage = {
  readonly records: DenverForeclosureRecord[];
  readonly declaredCount: number | null;
  readonly pageNumber: number;
  readonly pageTargets: ReadonlyMap<number, string>;
  readonly malformedRowCount: number;
  readonly warnings: string[];
};

/**
 * Fetches a bounded all-status slice of Denver foreclosure files by NED recording date.
 * The search rows do not expose the exact NED date/reception number or principal-as-of date,
 * so those fields remain null. Case-detail enrichment can be added later using the row's
 * session-dependent postback target; the /foreclosure URL is deliberately not persisted as
 * a fake case permalink.
 */
export async function fetchDenverForeclosureInitiations(
  fetchImpl: typeof fetch = fetch,
  now: Date = new Date(),
): Promise<DenverForeclosureResult> {
  if (Number.isNaN(now.getTime())) {
    throw new Error("Denver source observation time is invalid.");
  }

  const fetchedAt = now.toISOString();
  const windowEnd = dateInDenver(now);
  const windowStart = addIsoDays(windowEnd, -nedLookbackDays);
  const scope =
    `Denver Public Trustee files with NED recording dates from ${windowStart} through ` +
    `${windowEnd} inclusive, across all source statuses. Completeness refers only to every ` +
    "row declared by this bounded search; a missing case or changed registry status does not establish current debt resolution.";
  const warnings = [
    "Denver's Terms of Use state that commercial use of site materials requires written permission; confirm authorization before commercial use.",
    "Denver's search-row Balance Due is stored as principalAmountCents, not as arrears, cure, reinstatement, or current payoff. Its as-of date is unavailable without a bounded case-detail lookup.",
    "Raw registry status is preserved exactly. Property status and disappearance from this rolling window must not be equated with current debt status.",
    "Exact NED recorded dates and reception numbers are not present in search rows, so they remain null rather than triggering hundreds of sequential detail requests.",
  ];
  const client = new StatefulDenverClient(fetchImpl);

  const initial = await client.request(denverSearchUrl, { method: "GET" });
  rejectChallenge(initial.html);
  const searchPayload = formFields(initial.html);
  removeButtonAndChallengeFields(searchPayload);
  searchPayload.set(`${formPrefix}ddStatus`, "");
  searchPayload.set(`${formPrefix}ddlExpedited`, "-1");
  searchPayload.set(`${formPrefix}txtNedDate1`, windowStart);
  searchPayload.set(`${formPrefix}txtNedDate2`, windowEnd);
  searchPayload.set(`${formPrefix}btnSearch`, "Search");

  const search = await client.request(initial.url, postOptions(searchPayload, initial.url));
  rejectChallenge(search.html);
  const firstPage = parseDenverSearchPage(search.html, fetchedAt);
  if (firstPage.declaredCount === null) {
    throw new Error("Denver search response did not declare a result count.");
  }
  warnings.push(...firstPage.warnings);

  const recordsByCase = new Map(firstPage.records.map((record) => [record.caseId, record]));
  let parsedRowCount = firstPage.records.length;
  let malformedRowCount = firstPage.malformedRowCount;
  let currentHtml = search.html;
  let currentUrl = search.url;
  let currentPage = firstPage;
  const declaredCount = firstPage.declaredCount;
  const declaredPages = Math.max(1, ...firstPage.pageTargets.keys());
  let complete = true;

  if (declaredPages > maxPages) {
    complete = false;
    warnings.push(
      `Denver exposed ${declaredPages} result pages, exceeding the ${maxPages}-page safety limit; the bounded search is incomplete.`,
    );
  }

  const pagesToFetch = Math.min(declaredPages, maxPages);
  for (let wantedPage = 2; wantedPage <= pagesToFetch; wantedPage += 1) {
    const target = currentPage.pageTargets.get(wantedPage);
    if (!target) {
      complete = false;
      warnings.push(`Denver did not expose a postback target for result page ${wantedPage}.`);
      break;
    }
    const payload = formFields(currentHtml);
    removeButtonAndChallengeFields(payload);
    payload.set("__EVENTTARGET", target);
    payload.set("__EVENTARGUMENT", "");
    payload.set(`${formPrefix}ddStatus`, "");
    payload.set(`${formPrefix}ddlExpedited`, "-1");

    // eslint-disable-next-line no-await-in-loop
    await delay(paginationDelayMs);
    try {
      // Stateful ASP.NET paging requires each response's fresh tokens and session cookies.
      // eslint-disable-next-line no-await-in-loop
      const response = await client.request(currentUrl, postOptions(payload, currentUrl));
      rejectChallenge(response.html);
      const parsed = parseDenverSearchPage(response.html, fetchedAt);
      if (parsed.declaredCount !== declaredCount) {
        complete = false;
        warnings.push(
          `Denver's declared result count changed from ${declaredCount} to ${String(parsed.declaredCount)} while paging.`,
        );
        break;
      }
      if (parsed.pageNumber !== wantedPage) {
        complete = false;
        warnings.push(
          `Denver returned result page ${parsed.pageNumber} when page ${wantedPage} was requested.`,
        );
        break;
      }
      parsedRowCount += parsed.records.length;
      malformedRowCount += parsed.malformedRowCount;
      warnings.push(...parsed.warnings);
      for (const record of parsed.records) {
        recordsByCase.set(record.caseId, record);
      }
      currentHtml = response.html;
      currentUrl = response.url;
      currentPage = parsed;
    } catch (error) {
      complete = false;
      warnings.push(
        `Denver pagination stopped at page ${wantedPage}: ${error instanceof Error ? error.message : String(error)}`,
      );
      break;
    }
  }

  if (malformedRowCount > 0) {
    complete = false;
    warnings.push(`${malformedRowCount} Denver result row(s) were malformed and omitted.`);
  }
  if (parsedRowCount !== declaredCount) {
    complete = false;
    warnings.push(
      `Denver declared ${declaredCount} result row(s), but ${parsedRowCount} row(s) were parsed across fetched pages.`,
    );
  }
  if (recordsByCase.size !== parsedRowCount) {
    complete = false;
    warnings.push(
      `Denver returned ${parsedRowCount - recordsByCase.size} duplicate case row(s); duplicate cases were not silently retained.`,
    );
  }

  return {
    records: [...recordsByCase.values()],
    warnings: unique(warnings),
    complete,
    sourceUpdatedAt: null,
    scope,
  };
}

export function parseDenverSearchPage(html: string, fetchedAt: string): DenverParsedSearchPage {
  const declaredMatch = /Your\s+search\s+returned\s+([\d,]+)\s+records?\b/i.exec(
    textFromHtml(html),
  );
  const declaredCount = declaredMatch
    ? Number.parseInt(declaredMatch[1]?.replaceAll(",", "") ?? "", 10)
    : null;
  const pageTargets = new Map<number, string>();
  let pageNumber = 1;
  for (const match of html.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/gi)) {
    const anchor = match[0];
    const label = attribute(anchor, "aria-label");
    const pageMatch = /^Goto page (\d+)$/i.exec(label ?? "");
    if (!pageMatch) {
      continue;
    }
    const page = Number.parseInt(pageMatch[1] ?? "", 10);
    const target = postbackTarget(attribute(anchor, "href") ?? "");
    if (target) {
      pageTargets.set(page, target);
    }
    if (/\baria-current\s*=\s*["']page["']/i.test(anchor)) {
      pageNumber = page;
    }
  }

  const table = elementContentsById(
    html,
    "table",
    "MainContent_CustomContentPlaceHolder_gvSearchResults",
  );
  const records: DenverForeclosureRecord[] = [];
  const warnings: string[] = [];
  let malformedRowCount = 0;
  if (table !== null) {
    for (const rowMatch of table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const rowHtml = rowMatch[1] ?? "";
      if (/<th\b/i.test(rowHtml)) {
        continue;
      }
      const cells = [...rowHtml.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) =>
        textFromHtml(cell[1] ?? ""),
      );
      if (cells.length < 8) {
        malformedRowCount += 1;
        continue;
      }
      const caseId = cells[0] ?? "";
      const street = cells[2] ?? "";
      const zip = cells[3] || null;
      const rawPrincipal = cells[5] ?? "";
      const rawSaleDate = cells[6] ?? "";
      const rawStatus = cells[7] ?? "";
      if (!caseId || !street || !rawStatus) {
        malformedRowCount += 1;
        continue;
      }
      const principal = parseMoney(rawPrincipal);
      const scheduledSaleDate = parseUsDate(rawSaleDate);
      if (rawPrincipal && !principal.valid) {
        warnings.push(
          `Case ${caseId} had an unrecognized principal amount; it was preserved as null.`,
        );
      }
      if (rawSaleDate && scheduledSaleDate === null) {
        warnings.push(
          `Case ${caseId} had an unrecognized scheduled sale date; it was preserved as null.`,
        );
      }
      records.push({
        jurisdictionId: "denver-co",
        caseId,
        signalType: "mortgage_foreclosure_initiated",
        eventType: "ned_recorded",
        rawStatus,
        street,
        city: "Denver",
        state: "CO",
        zip,
        nedRecordedDate: null,
        nedDocumentNumber: null,
        scheduledSaleDate,
        principalAmountCents: principal.value,
        principalAsOfDate: null,
        sourceAsOf: fetchedAt,
        fetchedAt,
        sourceSearchUrl: denverSearchUrl,
      });
    }
  } else if (declaredCount !== 0) {
    malformedRowCount += 1;
  }

  return {
    records,
    declaredCount,
    pageNumber,
    pageTargets,
    malformedRowCount,
    warnings,
  };
}

export function denverNedWindow(now: Date): { start: string; end: string } {
  const end = dateInDenver(now);
  return { start: addIsoDays(end, -nedLookbackDays), end };
}

class StatefulDenverClient {
  readonly #cookies = new Map<string, string>();
  readonly #fetchImpl: typeof fetch;
  readonly #startedAt = Date.now();
  #requestCount = 0;

  constructor(fetchImpl: typeof fetch) {
    this.#fetchImpl = fetchImpl;
  }

  async request(requestedUrl: string, init: RequestInit): Promise<{ html: string; url: string }> {
    let url = requestedUrl;
    let options = init;
    for (let redirects = 0; redirects <= 3; redirects += 1) {
      this.#requestCount += 1;
      if (this.#requestCount > maxRequests) {
        throw new Error(`Denver source exceeded its ${maxRequests}-request safety limit.`);
      }
      const remainingMs = overallTimeoutMs - (Date.now() - this.#startedAt);
      if (remainingMs <= 0) {
        throw new Error(
          `Denver source exceeded its ${overallTimeoutMs / 1_000}-second time limit.`,
        );
      }
      const headers = new Headers(options.headers);
      headers.set("accept", "text/html,application/xhtml+xml");
      headers.set("user-agent", "TemplarLabs-PropertyWatch/1.0");
      const cookie = [...this.#cookies.entries()]
        .map(([name, value]) => `${name}=${value}`)
        .join("; ");
      if (cookie) {
        headers.set("cookie", cookie);
      }
      // Manual redirects are required so cookies from Denver's auto-detect redirect are retained.
      // eslint-disable-next-line no-await-in-loop
      const response = await this.#fetchImpl(url, {
        ...options,
        headers,
        redirect: "manual",
        signal: AbortSignal.timeout(Math.min(sourceTimeoutMs, remainingMs)),
      });
      this.absorbCookies(response.headers);
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        if (!location) {
          throw new Error(`Denver returned HTTP ${response.status} without a redirect location.`);
        }
        const next = new URL(location, url);
        if (next.origin !== new URL(denverSearchUrl).origin) {
          throw new Error("Denver attempted to redirect the source request off origin.");
        }
        if (redirects === 3) {
          throw new Error("Denver exceeded the redirect safety limit.");
        }
        if (
          response.status === 303 ||
          ((response.status === 301 || response.status === 302) && options.method === "POST")
        ) {
          options = { method: "GET" };
        }
        url = next.href;
        continue;
      }
      if (!response.ok) {
        throw new Error(`Denver source request failed with HTTP ${response.status}.`);
      }
      const declaredLength = Number(response.headers.get("content-length"));
      if (Number.isFinite(declaredLength) && declaredLength > responseBodyLimit) {
        throw new Error(
          `Denver source response exceeded the ${responseBodyLimit}-byte safety limit.`,
        );
      }
      // eslint-disable-next-line no-await-in-loop
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength > responseBodyLimit) {
        throw new Error(
          `Denver source response exceeded the ${responseBodyLimit}-byte safety limit.`,
        );
      }
      return { html: new TextDecoder().decode(bytes), url };
    }
    throw new Error("Denver redirect handling failed.");
  }

  private absorbCookies(headers: Headers): void {
    const cookieHeaders = getSetCookie(headers);
    for (const cookieHeader of cookieHeaders) {
      const pair = cookieHeader.split(";", 1)[0]?.trim();
      const separator = pair?.indexOf("=") ?? -1;
      if (!pair || separator <= 0) {
        continue;
      }
      const name = pair.slice(0, separator);
      const value = pair.slice(separator + 1);
      if (/\bmax-age=0\b/i.test(cookieHeader) || value === "") {
        this.#cookies.delete(name);
      } else {
        this.#cookies.set(name, value);
      }
    }
  }
}

function getSetCookie(headers: Headers): string[] {
  const withCookieList = headers as Headers & { getSetCookie?: () => string[] };
  if (typeof withCookieList.getSetCookie === "function") {
    return withCookieList.getSetCookie();
  }
  const combined = headers.get("set-cookie");
  return combined ? combined.split(/,(?=\s*[^=;,\s]+=)/) : [];
}

function postOptions(payload: URLSearchParams, referer: string): RequestInit {
  return {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      referer,
    },
    body: payload.toString(),
  };
}

function formFields(html: string): URLSearchParams {
  const fields = new URLSearchParams();
  for (const match of html.matchAll(/<input\b[^>]*>/gi)) {
    const input = match[0];
    const name = attribute(input, "name");
    if (name) {
      fields.set(name, attribute(input, "value") ?? "");
    }
  }
  return fields;
}

function removeButtonAndChallengeFields(fields: URLSearchParams): void {
  const namesToRemove: string[] = [];
  for (const name of fields.keys()) {
    if (/btn(?:Reset|ShowAll|Search)$/.test(name) || name === "g-recaptcha-response") {
      namesToRemove.push(name);
    }
  }
  for (const name of namesToRemove) {
    fields.delete(name);
  }
}

function rejectChallenge(html: string): void {
  if (
    /<iframe\b[^>]*(?:recaptcha|captcha)/i.test(html) ||
    /class\s*=\s*["'][^"']*\bg-recaptcha\b/i.test(html) ||
    /\bcf-chl-/i.test(html) ||
    /<title>\s*Just a moment/i.test(html)
  ) {
    throw new Error(
      "Denver presented an access-verification challenge; the adapter will not bypass it.",
    );
  }
}

function elementContentsById(html: string, tag: string, id: string): string | null {
  const pattern = new RegExp(
    `<${tag}\\b(?=[^>]*\\bid=["']${escapeRegExp(id)}["'])[^>]*>([\\s\\S]*?)<\\/${tag}>`,
    "i",
  );
  return pattern.exec(html)?.[1] ?? null;
}

function attribute(tag: string, name: string): string | null {
  const escaped = escapeRegExp(name);
  const match = new RegExp(`\\b${escaped}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i").exec(tag);
  return match ? decodeHtml(match[1] ?? match[2] ?? "") : null;
}

function postbackTarget(href: string): string | null {
  return /__doPostBack\('([^']+)'\s*,/i.exec(href)?.[1] ?? null;
}

function textFromHtml(html: string): string {
  return decodeHtml(html.replace(/<br\s*\/?\s*>/gi, " ").replace(/<[^>]*>/g, " "))
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtml(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: "\u00a0",
    quot: '"',
  };
  return value.replace(/&(#(?:x[\da-f]+|\d+)|[a-z]+);/gi, (entity, body: string) => {
    if (body.startsWith("#")) {
      const hexadecimal = body[1]?.toLowerCase() === "x";
      const codePoint = Number.parseInt(body.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
      try {
        return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : entity;
      } catch {
        return "\uFFFD";
      }
    }
    return named[body.toLowerCase()] ?? entity;
  });
}

function parseMoney(value: string): { value: number | null; valid: boolean } {
  if (!value) {
    return { value: null, valid: true };
  }
  const match = /^\$([\d,]+)\.(\d{2})$/.exec(value);
  if (!match) {
    return { value: null, valid: false };
  }
  const dollars = Number.parseInt(match[1]?.replaceAll(",", "") ?? "", 10);
  const cents = Number.parseInt(match[2] ?? "", 10);
  const amount = dollars * 100 + cents;
  return Number.isSafeInteger(amount)
    ? { value: amount, valid: true }
    : { value: null, valid: false };
}

function parseUsDate(value: string): string | null {
  if (!value) {
    return null;
  }
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  if (!match) {
    return null;
  }
  const month = Number.parseInt(match[1] ?? "", 10);
  const day = Number.parseInt(match[2] ?? "", 10);
  const year = Number.parseInt(match[3] ?? "", 10);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) {
    return null;
  }
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function dateInDenver(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Denver",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function addIsoDays(value: string, days: number): string {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, (day ?? 1) + days));
  return date.toISOString().slice(0, 10);
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
