import assert from "node:assert/strict";
import { test } from "node:test";

import { calendarLinksFor } from "../src/lib/calendar.ts";

test("builds Google and downloadable calendar links for an all-day wedding", () => {
  const links = calendarLinksFor({
    description: "A garden celebration; dinner, dancing, and joy.",
    endDateExclusive: "2027-09-26",
    location: "Botanica, Wichita",
    startDate: "2027-09-25",
    title: "Emma & Eric’s Wedding",
    uid: "wedding@example.com",
  });
  const googleUrl = new URL(links.google);

  assert.equal(googleUrl.searchParams.get("dates"), "20270925/20270926");
  assert.equal(googleUrl.searchParams.get("text"), "Emma & Eric’s Wedding");
  assert.match(links.icsContent, /DTSTART;VALUE=DATE:20270925/);
  assert.match(links.icsContent, /DTEND;VALUE=DATE:20270926/);
  assert.match(
    links.icsContent,
    /DESCRIPTION:A garden celebration\\; dinner\\, dancing\\, and joy\./,
  );
  assert.ok(links.ics.startsWith("data:text/calendar;charset=utf-8,"));
});

test("rejects malformed calendar dates", () => {
  assert.throws(
    () =>
      calendarLinksFor({
        description: "Wedding",
        endDateExclusive: "tomorrow",
        location: "Wichita",
        startDate: "2027-09-25",
        title: "Wedding",
        uid: "wedding@example.com",
      }),
    /Invalid all-day calendar date/,
  );
});
