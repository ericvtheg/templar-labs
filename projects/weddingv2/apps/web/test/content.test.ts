import assert from "node:assert/strict";
import { test } from "node:test";
import { pagePath, pages, versions } from "../src/content/pages.ts";
import { allPhotos, heroPhoto, supportingPhotos } from "../src/content/photos.ts";
import {
  couple,
  faq,
  guestEvents,
  type Hotel,
  home,
  schedule,
  stay,
  thingsToDo,
  travel,
} from "../src/content/site.ts";
import { cardSpots, panel, polaroidSpots, sectionOrder } from "../src/v3/layout.ts";

function allText(): string {
  return JSON.stringify({ couple, home, schedule, travel, stay, thingsToDo, faq });
}

test("the Canva typos are fixed and nothing else is reworded", () => {
  const text = allText();
  assert.ok(!text.includes("find grab"), "Things to Do typo is back");
  assert.ok(!text.includes("plently"), "Travel typo is back");
  assert.ok(!text.includes("Kansas on to celebrate"), "letter typo is back");
  assert.ok(!text.includes("options everyday"), "FAQ typo is back");
  assert.ok(text.includes("where you can grab a coffee, and wander around for a bit."));
  assert.ok(text.includes("Hell yeah! There will be an open bar"));
});

test("the content uses typographic apostrophes", () => {
  assert.doesNotMatch(allText(), /[a-z]'[a-z]/i);
});

test("the guide has every section from the Canva design", () => {
  assert.equal(faq.items.length, 8);
  assert.equal(stay.hotels.length, 3);
  assert.equal(thingsToDo.activities.length, 4);
  assert.equal(thingsToDo.food.length, 3);
  assert.equal(travel.sections.length, 4);
});

test("content ids are unique", () => {
  const groups = [faq.items, stay.hotels, thingsToDo.activities, thingsToDo.food, schedule.events];
  for (const group of groups) {
    const ids = group.map((item) => item.id);
    assert.equal(new Set(ids).size, ids.length, `duplicate id in ${ids.join(", ")}`);
  }
});

test("guests see the wedding and the welcome party, not the rehearsal dinner", () => {
  assert.deepEqual(
    guestEvents.map((event) => event.id),
    ["wedding", "welcome-party"],
  );
});

test("the wedding is at Botanica and the welcome party venue is not announced yet", () => {
  const wedding = guestEvents.find((event) => event.id === "wedding");
  const welcome = guestEvents.find((event) => event.id === "welcome-party");
  assert.ok(wedding && welcome);
  assert.equal(wedding.venue.name, "Botanica, The Wichita Gardens");
  assert.equal(wedding.venueAnnounced, true);
  assert.equal(welcome.venueAnnounced, false);
  assert.match(welcome.details ?? "", /more information about where and when/);
});

test("the timeline moments repeat times that are in the schedule text", () => {
  for (const event of schedule.events) {
    if (!("moments" in event)) {
      continue;
    }
    const text = [event.time, ...event.notes].join(" ");
    for (const moment of event.moments) {
      assert.ok(text.includes(moment.time), `${moment.time} is not in "${text}"`);
    }
  }
});

test("hotel booking links are either missing or real URLs", () => {
  const hotels: readonly Hotel[] = stay.hotels;
  for (const hotel of hotels) {
    const url = hotel.bookingUrl;
    assert.ok(url === null || url.startsWith("https://"), `${hotel.id} has a bad booking URL`);
    assert.match(hotel.mapUrl, /^https:\/\/www\.google\.com\/maps\//);
  }
});

test("every page has its own URL in every version", () => {
  const paths = versions.flatMap((version) => pages.map((page) => pagePath(version.id, page.id)));
  assert.equal(new Set(paths).size, versions.length * pages.length);
  assert.equal(pagePath("v1", "home"), "/v1");
  assert.equal(pagePath("v3", "things-to-do"), "/v3/things-to-do");
});

test("the landing page has one hero photo and at least two more", () => {
  assert.equal(heroPhoto.id, "hero");
  assert.ok(supportingPhotos.length >= 2);
  assert.equal(new Set(allPhotos.map((slot) => slot.id)).size, allPhotos.length);
  for (const slot of allPhotos) {
    assert.ok(slot.alt.length > 0, `${slot.id} needs alt text`);
    assert.ok(slot.src === null || slot.src.startsWith("/photos/"), `${slot.id} has a bad src`);
  }
});

test("every v3 card lies on the table", () => {
  for (const id of sectionOrder) {
    const spot = cardSpots[id];
    const centerX = spot.x + spot.w / 2;
    const centerY = spot.y + spot.h / 2;
    assert.ok(centerX > 0 && centerX < panel.width, `${id} is off the table`);
    assert.ok(centerY > 0 && centerY < panel.height, `${id} is off the table`);
  }
  assert.ok(polaroidSpots.length >= allPhotos.length, "a photo has no polaroid spot");
});
