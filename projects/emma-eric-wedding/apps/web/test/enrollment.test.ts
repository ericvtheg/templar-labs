import assert from "node:assert/strict";
import { test } from "node:test";
import { buildEnrollmentDashboard, householdEnrollmentInput } from "../src/lib/enrollment.ts";

test("validates and trims a household enrollment", () => {
  const enrollment = householdEnrollmentInput.parse({
    householdName: "  The Garden household  ",
    guests: [
      { name: "  Alex Garden ", plusOneAllowed: true },
      { name: "Sam Garden", plusOneAllowed: false },
    ],
  });

  assert.deepEqual(enrollment, {
    householdName: "The Garden household",
    guests: [
      { name: "Alex Garden", plusOneAllowed: true },
      { name: "Sam Garden", plusOneAllowed: false },
    ],
  });
});

test("requires at least one named guest", () => {
  const result = householdEnrollmentInput.safeParse({
    householdName: "The Garden household",
    guests: [],
  });

  assert.equal(result.success, false);
});

test("counts explicit plus-ones as invited seats", () => {
  const dashboard = buildEnrollmentDashboard(
    [
      {
        id: "household-1",
        name: "The Garden household",
        createdAt: new Date("2026-07-26T12:00:00.000Z"),
      },
      {
        id: "household-2",
        name: "The Orchard household",
        createdAt: new Date("2026-07-26T13:00:00.000Z"),
      },
    ],
    [
      {
        id: "guest-2",
        householdId: "household-1",
        name: "Sam Garden",
        plusOneAllowed: false,
        position: 1,
      },
      {
        id: "guest-1",
        householdId: "household-1",
        name: "Alex Garden",
        plusOneAllowed: true,
        position: 0,
      },
      {
        id: "guest-3",
        householdId: "household-2",
        name: "Jo Orchard",
        plusOneAllowed: true,
        position: 0,
      },
    ],
  );

  assert.deepEqual(dashboard.summary, {
    householdCount: 2,
    namedGuestCount: 3,
    plusOneCount: 2,
    invitedSeatCount: 5,
  });
  assert.deepEqual(
    dashboard.households[0]?.guests.map((guest) => guest.name),
    ["Alex Garden", "Sam Garden"],
  );
  assert.equal(dashboard.households[0]?.invitedSeatCount, 3);
});
