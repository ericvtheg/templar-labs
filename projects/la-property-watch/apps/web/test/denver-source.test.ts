import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import {
  denverNedWindow,
  fetchDenverForeclosureInitiations,
  parseDenverSearchPage,
} from "../src/lib/denver-source.ts";

const observedAt = "2026-11-07T12:00:00.000Z";

function fixture(name: string): Promise<string> {
  return readFile(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
}

function resolvedResponse(body?: BodyInit | null, init?: ResponseInit): Promise<Response> {
  return Promise.resolve(new Response(body, init));
}

describe("Denver Public Trustee source adapter", () => {
  it("parses live-derived search rows without confusing principal, sale, or NED dates", async () => {
    const html = await fixture("denver-search-page-1.html");
    const page = parseDenverSearchPage(html, observedAt);

    assert.equal(page.declaredCount, 3);
    assert.equal(page.pageNumber, 1);
    assert.equal(
      page.pageTargets.get(2),
      "ctl00$ctl00$MainContent$CustomContentPlaceHolder$TopPager$ctl01$Page",
    );
    assert.equal(page.malformedRowCount, 0);
    assert.equal(page.records.length, 2);
    const first = page.records[0];
    assert.ok(first);
    assert.deepEqual(first, {
      jurisdictionId: "denver-co",
      caseId: "2026-000649",
      signalType: "mortgage_foreclosure_initiated",
      eventType: "ned_recorded",
      rawStatus: "NED Recorded",
      street: "6352 E Mississippi Ave",
      city: "Denver",
      state: "CO",
      zip: "80224",
      nedRecordedDate: null,
      nedDocumentNumber: null,
      scheduledSaleDate: "2027-03-04",
      principalAmountCents: 36_227_742,
      principalAsOfDate: null,
      sourceAsOf: observedAt,
      fetchedAt: observedAt,
      sourceSearchUrl: "https://denvergov.org/foreclosuresearch/",
    });
    assert.equal("arrearsAmountCents" in first, false);
    assert.equal("owner" in first, false);
    assert.equal("detailUrl" in first, false);
  });

  it("carries redirect cookies, fresh postback state, and every compact fixture page", async () => {
    const initial = await fixture("denver-initial.html");
    const page1 = await fixture("denver-search-page-1.html");
    const page2 = await fixture("denver-search-page-2.html");
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchMock = ((input: URL | RequestInfo, init: RequestInit = {}) => {
      const url = String(input);
      calls.push({ url, init });
      if (calls.length === 1) {
        return resolvedResponse(null, {
          status: 302,
          headers: {
            location: "/foreclosuresearch/?AspxAutoDetectCookieSupport=1",
            "set-cookie": "AspxAutoDetectCookieSupport=1; Path=/; Secure; HttpOnly",
          },
        });
      }
      if (calls.length === 2) {
        assert.match(
          String(new Headers(init.headers).get("cookie")),
          /AspxAutoDetectCookieSupport=1/,
        );
        return resolvedResponse(initial, {
          headers: { "set-cookie": "ASP.NET_SessionId=session-one; Path=/; Secure; HttpOnly" },
        });
      }
      const body = new URLSearchParams(String(init.body));
      const headers = new Headers(init.headers);
      assert.match(String(headers.get("cookie")), /AspxAutoDetectCookieSupport=1/);
      assert.match(String(headers.get("cookie")), /ASP\.NET_SessionId=session-one/);
      if (calls.length === 3) {
        assert.equal(init.method, "POST");
        assert.equal(body.get("__VIEWSTATE"), "INITIAL_STATE");
        assert.equal(body.get("ctl00$ctl00$MainContent$CustomContentPlaceHolder$ddStatus"), "");
        assert.equal(
          body.get("ctl00$ctl00$MainContent$CustomContentPlaceHolder$ddlExpedited"),
          "-1",
        );
        assert.equal(
          body.get("ctl00$ctl00$MainContent$CustomContentPlaceHolder$txtNedDate1"),
          "2026-08-09",
        );
        assert.equal(
          body.get("ctl00$ctl00$MainContent$CustomContentPlaceHolder$txtNedDate2"),
          "2026-11-07",
        );
        assert.equal(
          body.get("ctl00$ctl00$MainContent$CustomContentPlaceHolder$btnSearch"),
          "Search",
        );
        assert.equal(body.has("g-recaptcha-response"), false);
        return resolvedResponse(page1);
      }
      assert.equal(calls.length, 4);
      assert.equal(body.get("__VIEWSTATE"), "PAGE1_STATE");
      assert.equal(
        body.get("__EVENTTARGET"),
        "ctl00$ctl00$MainContent$CustomContentPlaceHolder$TopPager$ctl01$Page",
      );
      assert.equal(body.has("ctl00$ctl00$MainContent$CustomContentPlaceHolder$btnSearch"), false);
      assert.equal(body.has("g-recaptcha-response"), false);
      return resolvedResponse(page2);
    }) as typeof fetch;

    const result = await fetchDenverForeclosureInitiations(fetchMock, new Date(observedAt));

    assert.equal(calls.length, 4);
    assert.equal(result.complete, true);
    assert.equal(result.records.length, 3);
    assert.deepEqual(
      result.records.map((record) => record.caseId),
      ["2026-000649", "2026-000648", "2026-000624"],
    );
    assert.equal(result.records[2]?.principalAmountCents, 103_162_500);
    assert.equal(result.records[2]?.scheduledSaleDate, "2027-02-18");
    assert.equal(result.sourceUpdatedAt, null);
    assert.match(result.scope, /2026-08-09 through 2026-11-07 inclusive/);
    assert.match(result.scope, /all source statuses/);
    assert.match(result.scope, /does not establish current debt resolution/);
    assert.ok(result.warnings.some((warning) => /not as arrears/i.test(warning)));
  });

  it("marks partial or malformed pagination incomplete instead of claiming first-page coverage", async () => {
    const initial = await fixture("denver-initial.html");
    const page1 = await fixture("denver-search-page-1.html");
    const page2 = (await fixture("denver-search-page-2.html")).replace(
      /<tr>\s*<td><a href="javascript:__doPostBack[\s\S]*?<\/tr>/,
      "<tr><td>broken row</td></tr>",
    );
    let call = 0;
    const fetchMock = (() => {
      call += 1;
      if (call === 1) {
        return resolvedResponse(initial);
      }
      if (call === 2) {
        return resolvedResponse(page1);
      }
      return resolvedResponse(page2);
    }) as typeof fetch;

    const result = await fetchDenverForeclosureInitiations(fetchMock, new Date(observedAt));

    assert.equal(result.complete, false);
    assert.equal(result.records.length, 2);
    assert.ok(result.warnings.some((warning) => /malformed and omitted/i.test(warning)));
    assert.ok(result.warnings.some((warning) => /declared 3.+but 2 row/i.test(warning)));
  });

  it("preserves malformed money and calendar values as null with explicit warnings", async () => {
    const html = (await fixture("denver-search-page-1.html"))
      .replace("$362,277.42", "$unknown")
      .replace("3/4/2027", "2/31/2027");
    const page = parseDenverSearchPage(html, observedAt);
    const first = page.records[0];

    assert.ok(first);
    assert.equal(first.principalAmountCents, null);
    assert.equal(first.scheduledSaleDate, null);
    assert.ok(page.warnings.some((warning) => /unrecognized principal/i.test(warning)));
    assert.ok(page.warnings.some((warning) => /unrecognized scheduled sale date/i.test(warning)));
  });

  it("uses Denver's calendar day for the explicit 90-day lookback", () => {
    assert.deepEqual(denverNedWindow(new Date(observedAt)), {
      start: "2026-08-09",
      end: "2026-11-07",
    });
    assert.deepEqual(denverNedWindow(new Date("2026-11-07T05:30:00.000Z")), {
      start: "2026-08-08",
      end: "2026-11-06",
    });
  });

  it("stops on a verification challenge and never attempts to populate or bypass it", async () => {
    let calls = 0;
    const fetchMock = (() => {
      calls += 1;
      return resolvedResponse(
        '<html><title>Verify</title><div class="g-recaptcha">Complete verification</div></html>',
      );
    }) as typeof fetch;

    await assert.rejects(
      fetchDenverForeclosureInitiations(fetchMock, new Date(observedAt)),
      /will not bypass/i,
    );
    assert.equal(calls, 1);
  });
});
