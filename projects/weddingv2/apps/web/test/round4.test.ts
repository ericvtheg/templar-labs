// Round four: animation, and a photo for each thing to do (versions 8 and 9).

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { versions } from "../src/content/pages.ts";
import { thingsToDo } from "../src/content/site.ts";

const root = new URL("..", import.meta.url);

test("the newest versions are listed first", () => {
  assert.deepEqual(
    versions.slice(0, 2).map((version) => version.id),
    ["v8", "v9"],
  );
});

test("Emma's new wording for Dead Center Vintage is in", () => {
  const [first] = thingsToDo.activities;
  assert.ok(first.text.includes("Emma’s matron of honor, Kenzie, and our officiant, Laz"));
});

test("every thing to do has a photo with a description", () => {
  for (const activity of thingsToDo.activities) {
    assert.match(activity.photo.file, /^[\w-]+\.jpg$/);
    assert.ok(activity.photo.alt.length > 20, `${activity.id} needs alt text`);
  }
});

test("only the Cowtown photo shows Emma and Eric", () => {
  assert.deepEqual(
    thingsToDo.activities.filter((activity) => activity.photo.ofUs).map((activity) => activity.id),
    ["cowtown"],
  );
});

test("the photos of places are in the repository", () => {
  for (const activity of thingsToDo.activities) {
    if (!activity.photo.ofUs) {
      const file = new URL(`src/assets/round-4/places/${activity.photo.file}`, root);
      assert.ok(existsSync(file), `${activity.photo.file} is missing`);
    }
  }
});

test("photos of Emma and Eric stay out of git until they decide", () => {
  const ignore = readFileSync(new URL("../../.gitignore", root), "utf8");
  if (ignore.includes("apps/web/src/assets/photos/")) {
    // Still held back: the exports that contain those photos must be held back too.
    assert.ok(ignore.includes("reference/round-3/home.png"));
    assert.ok(ignore.includes("reference/round-4/things.png"));
  }
});
