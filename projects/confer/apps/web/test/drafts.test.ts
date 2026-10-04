import assert from "node:assert/strict";
import test from "node:test";
import { createDemoWorkspace } from "../src/lib/demo.ts";
import { createDraft } from "../src/lib/drafts.ts";
import { flaggedResponses } from "../src/lib/model.ts";

function demo() {
  const matter = createDemoWorkspace().matters[0];
  if (!matter) {
    throw new Error("The demo must contain a matter.");
  }
  return matter;
}
const now = new Date("2026-06-15T12:00:00Z");

test("letter uses exact source quotations, selected responses, and honest review status", () => {
  const matter = demo();
  const response = matter.responses[0];
  assert.ok(response);
  const draft = createDraft(matter, "letter", [response.id], now);
  assert.equal(draft.kind, "letter");
  assert.deepEqual(draft.responseIds, [response.id]);
  assert.ok(draft.content.includes(response.response));
  assert.ok(draft.content.includes(response.request));
  assert.match(draft.content, /FINDING NOT YET REVIEWED/);
  assert.match(draft.content, /FOR ATTORNEY REVIEW ONLY/);
  assert.equal(draft.updatedAt, now.toISOString());
  assert.ok(!draft.content.includes("Request for production No. 2"));
});

test("excludes dismissed responses even if selected", () => {
  const matter = demo();
  const selected = flaggedResponses(matter);
  assert.ok(selected[0]);
  selected[0].status = "dismissed";
  const draft = createDraft(
    matter,
    "letter",
    selected.map((response) => response.id),
    now,
  );
  assert.ok(!draft.responseIds.includes(selected[0].id));
  assert.ok(!draft.content.includes(selected[0].response));
});

test("does not generate from empty, missing, dismissed, or unflagged selections", () => {
  const matter = demo();
  const unflagged = matter.responses.find((response) => response.issues.length === 0);
  assert.ok(unflagged);
  for (const ids of [[], ["unknown"], [unflagged.id]]) {
    assert.throws(() => createDraft(matter, "letter", ids), /Select at least one/);
  }
});

test("never automatically adds internal review notes to an outbound letter", () => {
  const matter = demo();
  const response = matter.responses[0];
  assert.ok(response);
  response.note = "CONFIDENTIAL STRATEGY: do not send this.";
  const letter = createDraft(matter, "letter", [response.id], now);
  const motion = createDraft(matter, "motion", [response.id], now);
  assert.ok(!letter.content.includes(response.note));
  assert.match(motion.content, /INTERNAL ATTORNEY NOTES — NOT FOR OUTBOUND CORRESPONDENCE/);
  assert.ok(motion.content.includes(response.note));
});

test("motion outline includes research placeholders and never asserts a meet-and-confer occurred", () => {
  const matter = demo();
  const draft = createDraft(
    matter,
    "motion",
    flaggedResponses(matter).map((response) => response.id),
    now,
  );
  assert.match(draft.content, /not established deficiencies/);
  assert.match(draft.content, /NOT proof that a meet-and-confer took place/);
  assert.match(draft.content, /No authorities or court deadlines have been generated/);
  assert.match(draft.content, /Independently calculate and calendar/);
  assert.match(draft.content, /\[Research and insert/);
});

test("missing facts remain placeholders and supplement dates are user-entered, not calculated", () => {
  const matter = demo();
  matter.court = "";
  matter.caseNumber = "";
  matter.client = "";
  matter.sender = "";
  const ids = flaggedResponses(matter).map((response) => response.id);
  const withoutDate = createDraft(matter, "letter", ids, now);
  assert.match(withoutDate.content, /\[Court and jurisdiction\]/);
  assert.match(withoutDate.content, /\[Case number\]/);
  assert.match(withoutDate.content, /agree on a reasonable date/);
  matter.responseBy = "2026-07-20";
  const withDate = createDraft(matter, "letter", ids, now);
  assert.match(withDate.content, /Jul 20, 2026/);
  assert.match(withDate.content, /not a calculated court deadline/);
});
