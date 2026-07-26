import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeGuestName } from "../src/lib/guest-name.ts";
import {
  type HouseholdRsvpInput,
  type RsvpHousehold,
  validateCompleteRsvp,
} from "../src/lib/rsvp.ts";
import {
  createRsvpAccessToken,
  householdIdFromAccessToken,
} from "../src/lib/rsvp-access.server.ts";
import { buildRsvpConfirmationEmail } from "../src/lib/rsvp-email.ts";

const invitedGuests = [
  {
    id: "guest-1",
    name: "Alex Garden",
    plusOneAllowed: true,
    eventIds: ["wedding", "rehearsal-dinner"],
  },
  {
    id: "guest-2",
    name: "Sam Garden",
    plusOneAllowed: false,
    eventIds: ["wedding"],
  },
] as const;

test("normalizes a full guest name without fuzzy matching", () => {
  assert.equal(normalizeGuestName("  ALEX   Garden "), "alex garden");
  assert.notEqual(normalizeGuestName("Alexander Garden"), normalizeGuestName("Alex Garden"));
});

test("validates one complete household response across every event", () => {
  assert.equal(validateCompleteRsvp(completeResponse(), invitedGuests), null);
});

test("requires every event response before the household can submit", () => {
  const response = completeResponse();
  const firstGuest = required(response.guests[0]);
  const result = validateCompleteRsvp(
    {
      ...response,
      guests: [
        {
          ...firstGuest,
          eventResponses: [required(firstGuest.eventResponses[0])],
        },
        required(response.guests[1]),
      ],
    },
    invitedGuests,
  );

  assert.match(result ?? "", /every event invitation/i);
});

test("requires a meal for each attending named guest and plus-one", () => {
  const response = completeResponse();
  const firstGuest = required(response.guests[0]);
  const result = validateCompleteRsvp(
    {
      ...response,
      guests: [
        {
          ...firstGuest,
          plusOne: { name: "Taylor Bloom", mealSelections: [] },
        },
        required(response.guests[1]),
      ],
    },
    invitedGuests,
  );

  assert.match(result ?? "", /Taylor Bloom’s meal/i);
});

test("signs, verifies, and expires household access tokens", async () => {
  const token = await createRsvpAccessToken("household-1", "test-secret", 1_000);

  assert.equal(await householdIdFromAccessToken(token, "test-secret", 2_000), "household-1");
  assert.equal(await householdIdFromAccessToken(token, "wrong-secret", 2_000), null);
  assert.equal(
    await householdIdFromAccessToken(token, "test-secret", 4 * 60 * 60 * 1000 + 1_001),
    null,
  );
});

test("renders every guest and event in the confirmation email", () => {
  const email = buildRsvpConfirmationEmail(confirmationHousehold());

  assert.match(email.text, /Alex Garden/);
  assert.match(email.text, /Wedding: Attending/);
  assert.match(email.text, /Rehearsal dinner: Attending/);
  assert.match(email.text, /Taylor Bloom/);
  assert.match(email.html, /Wild mushroom risotto/);
});

function completeResponse(): HouseholdRsvpInput {
  return {
    accessToken: "signed-token",
    contactEmail: "garden@example.com",
    guests: [
      {
        guestId: "guest-1",
        eventResponses: [
          {
            eventId: "wedding",
            attending: true,
            mealOptionId: "herb-roasted-chicken",
          },
          {
            eventId: "rehearsal-dinner",
            attending: true,
            mealOptionId: null,
          },
        ],
        plusOne: {
          name: "Taylor Bloom",
          mealSelections: [{ eventId: "wedding", mealOptionId: "wild-mushroom-risotto" }],
        },
      },
      {
        guestId: "guest-2",
        eventResponses: [
          {
            eventId: "wedding",
            attending: false,
            mealOptionId: null,
          },
        ],
        plusOne: null,
      },
    ],
  };
}

function confirmationHousehold(): RsvpHousehold {
  const response = completeResponse();
  const firstGuest = required(response.guests[0]);

  return {
    accessToken: "signed-token",
    name: "The Garden household",
    contactEmail: "garden@example.com",
    submitted: true,
    events: [],
    guests: [
      {
        id: "guest-1",
        name: "Alex Garden",
        plusOneAllowed: true,
        eventIds: ["wedding", "rehearsal-dinner"],
        eventResponses: firstGuest.eventResponses,
        plusOne: firstGuest.plusOne,
      },
    ],
  };
}

function required<T>(value: T | undefined): T {
  if (value === undefined) {
    throw new Error("Expected test fixture value.");
  }

  return value;
}
