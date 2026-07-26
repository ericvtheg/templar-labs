import assert from "node:assert/strict";
import { test } from "node:test";
import type { EnrollmentDashboard } from "../src/lib/enrollment.ts";
import { buildVendorCsv, vendorExportFilename } from "../src/lib/vendor-export.ts";

test("exports named guests and plus-ones with vendor details", () => {
  const csv = buildVendorCsv(dashboardFixture());
  const lines = csv.slice(1).trimEnd().split("\r\n");

  assert.equal(
    lines[0],
    "Name,Household,Guest type,Guest of,Wedding,Wedding meal,Rehearsal dinner,Dietary restrictions",
  );
  assert.equal(
    lines[1],
    'Alex Garden,"The Garden, household",Named guest,,Attending,Herb-roasted chicken,Attending,Peanut allergy',
  );
  assert.equal(
    lines[2],
    'Taylor Bloom,"The Garden, household",Plus-one,Alex Garden,Attending,Wild mushroom risotto,Attending,Gluten-free',
  );
  assert.equal(lines[3], 'Sam Garden,"The Garden, household",Named guest,,Declined,,Not invited,');
});

test("marks pending responses and protects spreadsheet cells from formulas", () => {
  const dashboard = dashboardFixture();
  const pendingDashboard: EnrollmentDashboard = {
    ...dashboard,
    households: [
      {
        ...required(dashboard.households[0]),
        name: '=IMPORTDATA("https://example.com")',
        guests: [
          {
            ...required(dashboard.households[0]?.guests[0]),
            name: "+Pending Guest",
            eventResponses: [],
            dietaryRestrictions: "Line one\nLine two",
            plusOneName: "",
            plusOneMealSelections: [],
          },
        ],
      },
    ],
  };
  const csv = buildVendorCsv(pendingDashboard);

  assert.match(csv, /'\+Pending Guest/);
  assert.match(csv, /'=IMPORTDATA/);
  assert.match(csv, /Awaiting response/);
  assert.match(csv, /"Line one\nLine two"/);
});

test("dates the downloaded vendor roster filename", () => {
  assert.equal(
    vendorExportFilename(new Date(2026, 6, 26)),
    "emma-eric-vendor-guest-list-2026-07-26.csv",
  );
});

function dashboardFixture(): EnrollmentDashboard {
  return {
    households: [
      {
        id: "household-1",
        name: "The Garden, household",
        contactEmail: "garden@example.com",
        addressLine1: "123 Flower Lane",
        addressLine2: "",
        city: "Wichita",
        region: "Kansas",
        postalCode: "67203",
        country: "United States",
        guests: [
          {
            id: "guest-1",
            name: "Alex Garden",
            plusOneAllowed: true,
            eventIds: ["wedding", "rehearsal-dinner"],
            eventResponses: [
              {
                eventId: "wedding",
                attending: true,
                mealOptionId: "herb-roasted-chicken",
              },
              { eventId: "rehearsal-dinner", attending: true, mealOptionId: "" },
            ],
            dietaryRestrictions: "Peanut allergy",
            plusOneName: "Taylor Bloom",
            plusOneDietaryRestrictions: "Gluten-free",
            plusOneMealSelections: [{ eventId: "wedding", mealOptionId: "wild-mushroom-risotto" }],
          },
          {
            id: "guest-2",
            name: "Sam Garden",
            plusOneAllowed: false,
            eventIds: ["wedding"],
            eventResponses: [{ eventId: "wedding", attending: false, mealOptionId: "" }],
            dietaryRestrictions: "",
            plusOneName: "",
            plusOneDietaryRestrictions: "",
            plusOneMealSelections: [],
          },
        ],
        namedGuestCount: 2,
        plusOneCount: 1,
        invitedSeatCount: 3,
        respondedAt: "2026-08-01T12:00:00.000Z",
        createdAt: "2026-07-26T12:00:00.000Z",
      },
    ],
    summary: {
      householdCount: 1,
      namedGuestCount: 2,
      plusOneCount: 1,
      invitedSeatCount: 3,
    },
    responseSummary: {
      respondedHouseholdCount: 1,
      pendingHouseholdCount: 0,
      weddingAttendingCount: 2,
      rehearsalDinnerAttendingCount: 2,
    },
  };
}

function required<T>(value: T | undefined): T {
  if (value === undefined) {
    throw new Error("Expected test fixture value.");
  }

  return value;
}
