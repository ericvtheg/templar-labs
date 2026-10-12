// Round three: Emma's updated Canva design (versions 6 and 7).

import assert from "node:assert/strict";
import { test } from "node:test";
import { versions } from "../src/content/pages.ts";
import { heroPhoto } from "../src/content/photos.ts";
import { faq, guestEvents, home, schedule, stay, thingsToDo, travel } from "../src/content/site.ts";
import { lineEnds, linesFor, place } from "../src/v6/spec.ts";

const everything = JSON.stringify({ home, schedule, travel, stay, thingsToDo, faq });

test("Emma's new wording is in", () => {
  assert.ok(everything.includes("No pressure to attend but if you are in town Friday evening"));
  assert.ok(everything.includes("If you stay at any of the hotels below"));
  assert.ok(everything.includes("Here you can find travel and accommodation information"));
  assert.ok(everything.includes("No you little freak!"));
});

test("her typos are fixed", () => {
  assert.ok(!everything.includes("accomadation"));
  assert.ok(!everything.includes("find grab"));
  assert.ok(!everything.includes("options everyday"));
});

test("the FAQ has her nine questions, in her order", () => {
  assert.deepEqual(
    faq.items.map((item) => item.id),
    [
      "indoor-or-outdoors",
      "weather",
      "dress-code",
      "kids",
      "plus-ones",
      "open-bar",
      "getting-to-wichita",
      "what-is-wichita-like",
      "rental-car",
    ],
  );
  // She removed the question about gifts.
  assert.ok(!faq.items.some((item) => item.question.includes("gifts")));
  assert.equal(faq.items.find((item) => item.id === "rental-car")?.answer.length, 2);
});

test("the schedule is in date order and hides the rehearsal dinner", () => {
  assert.deepEqual(
    guestEvents.map((event) => event.id),
    ["welcome-party", "wedding"],
  );
});

test("travel has two sections: Flight, then Getting around", () => {
  assert.deepEqual(
    travel.sections.map((section) => section.label),
    ["Flight", "Getting around"],
  );
});

/** The text that each set of v6 line breaks belongs to. */
function textFor(id: string): string | undefined {
  if (id === "faq.heading") {
    return faq.title;
  }
  if (id === "welcome.details") {
    return guestEvents.find((event) => event.id === "welcome-party")?.details;
  }
  const answer = id.match(/^faq\.a\.(.+)\.(\d)$/);
  if (answer) {
    return faq.items.find((item) => item.id === answer[1])?.answer[Number(answer[2])];
  }
  const paragraph = id.match(/^(flight|around)\.p(\d)$/);
  if (paragraph) {
    const section = travel.sections[paragraph[1] === "flight" ? 0 : 1];
    return section?.paragraphs[Number(paragraph[2]) - 1];
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

test("every travel paragraph has a measured position in version 6", () => {
  const names = ["flight", "around"];
  for (const [index, section] of travel.sections.entries()) {
    assert.doesNotThrow(() => place(`${names[index]}.label`));
    for (const number of section.paragraphs.keys()) {
      assert.doesNotThrow(() => place(`${names[index]}.p${number + 1}`));
    }
  }
});

test("the homepage photo is the one from her design", () => {
  assert.equal(heroPhoto.src, "emma-eric.jpg");
  assert.ok(heroPhoto.alt.length > 20);
});

test("the round-three versions are listed first", () => {
  assert.deepEqual(
    versions.slice(0, 2).map((version) => version.id),
    ["v6", "v7"],
  );
});
