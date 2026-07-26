import assert from "node:assert/strict";
import { test } from "node:test";
import { buildEnrollmentDashboard, householdEnrollmentInput } from "../src/lib/enrollment.ts";

test("validates and trims a household enrollment", () => {
  const enrollment = householdEnrollmentInput.parse({
    householdName: "  The Garden household  ",
    contactEmail: "  garden@example.com ",
    addressLine1: "  123 Flower Lane ",
    addressLine2: "",
    city: " Wichita ",
    region: " Kansas ",
    postalCode: " 67203 ",
    country: " United States ",
    guests: [
      { name: "  Alex Garden ", plusOneAllowed: true },
      { name: "Sam Garden", plusOneAllowed: false },
    ],
  });

  assert.deepEqual(enrollment, {
    householdName: "The Garden household",
    contactEmail: "garden@example.com",
    addressLine1: "123 Flower Lane",
    addressLine2: "",
    city: "Wichita",
    region: "Kansas",
    postalCode: "67203",
    country: "United States",
    guests: [
      { name: "Alex Garden", plusOneAllowed: true },
      { name: "Sam Garden", plusOneAllowed: false },
    ],
  });
});

test("requires at least one named guest", () => {
  const result = householdEnrollmentInput.safeParse({
    householdName: "The Garden household",
    contactEmail: "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    region: "",
    postalCode: "",
    country: "",
    guests: [],
  });

  assert.equal(result.success, false);
});

test("rejects an invalid household email", () => {
  const result = householdEnrollmentInput.safeParse({
    householdName: "The Garden household",
    contactEmail: "not-an-email",
    addressLine1: "",
    addressLine2: "",
    city: "",
    region: "",
    postalCode: "",
    country: "",
    guests: [{ name: "Alex Garden", plusOneAllowed: false }],
  });

  assert.equal(result.success, false);
});

test("counts explicit plus-ones as invited seats", () => {
  const dashboard = buildEnrollmentDashboard(
    [
      {
        id: "household-1",
        name: "The Garden household",
        contactEmail: "garden@example.com",
        addressLine1: "123 Flower Lane",
        addressLine2: null,
        city: "Wichita",
        region: "Kansas",
        postalCode: "67203",
        country: "United States",
        createdAt: new Date("2026-07-26T12:00:00.000Z"),
      },
      {
        id: "household-2",
        name: "The Orchard household",
        contactEmail: null,
        addressLine1: null,
        addressLine2: null,
        city: null,
        region: null,
        postalCode: null,
        country: null,
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
  assert.equal(dashboard.households[0]?.contactEmail, "garden@example.com");
  assert.equal(dashboard.households[1]?.contactEmail, "");
});
