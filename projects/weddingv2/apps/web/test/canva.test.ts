// v4 and v5 reproduce Emma's Canva design. These tests keep the content and the
// measured layout in step, so a text edit cannot silently break her line breaks.

import assert from "node:assert/strict";
import { test } from "node:test";
import { versions } from "../src/content/pages.ts";
import {
  faq,
  guestEvents,
  schedule,
  stay,
  thingsToDo,
  travel,
} from "../src/content/site-round-2.ts";
import { lineEnds, linesFor, place } from "../src/v4/spec.ts";

/** The text that each set of line breaks belongs to. */
function textFor(id: string): string | undefined {
  if (id === "faq.heading") {
    return faq.title;
  }
  if (id === "welcome.details") {
    return guestEvents.find((event) => event.id === "welcome-party")?.details;
  }
  const answer = id.match(/^faq\.a\.(.+)$/);
  if (answer) {
    return faq.items.find((item) => item.id === answer[1])?.answer;
  }
  const paragraph = id.match(/^travel\.p(\d)$/);
  if (paragraph) {
    return travel.sections[Number(paragraph[1]) - 1]?.lines.join(" ");
  }
  const activity = id.match(/^things\.i(\d)\.text$/);
  if (activity) {
    return thingsToDo.activities[Number(activity[1]) - 1]?.text;
  }
  return undefined;
}

test("every one of Emma's line breaks still falls inside its text", () => {
  for (const [id, ends] of Object.entries(lineEnds)) {
    const text = textFor(id);
    assert.ok(text, `no content found for ${id}`);
    assert.equal(linesFor(id, text).length, ends.length + 1, `${id} lost a line break`);
  }
});

test("lines keep every word, in order", () => {
  const details = textFor("welcome.details") ?? "";
  assert.equal(linesFor("welcome.details", details).join(" "), details);
  assert.deepEqual(linesFor("no.such.block", "one line"), ["one line"]);
});

test("every piece of text on the Canva pages has a measured position", () => {
  const ids = [
    "home.names",
    "home.date",
    "sched.heading",
    "welcome.details",
    "travel.heading",
    "stay.intro",
    "things.heading",
    "things.food",
    "faq.heading",
    ...travel.sections.map((_, index) => `travel.p${index + 1}`),
    ...stay.hotels.flatMap((_, index) =>
      ["name", "address", "notes"].map((part) => `stay.h${index + 1}.${part}`),
    ),
    ...thingsToDo.activities.flatMap((_, index) =>
      ["title", "text"].map((part) => `things.i${index + 1}.${part}`),
    ),
  ];
  for (const id of ids) {
    assert.doesNotThrow(() => place(id), `${id} is missing from spec.json`);
  }
  assert.throws(() => place("no.such.block"));
});

test("times use the plain hyphen Emma typed", () => {
  const wedding = schedule.events.find((event) => event.id === "wedding");
  assert.equal(wedding?.time, "5:00 PM - 10:30 PM");
  assert.ok(!JSON.stringify({ schedule, travel, faq }).includes("–"), "an en dash crept in");
});

test("versions 4 and 5 are the round made after Emma's first notes", () => {
  assert.deepEqual(
    versions.filter((version) => version.round === 2).map((version) => version.id),
    ["v4", "v5"],
  );
});
