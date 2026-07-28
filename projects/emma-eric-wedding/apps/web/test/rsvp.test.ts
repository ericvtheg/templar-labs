import assert from "node:assert/strict";
import { test } from "node:test";
import { rsvpEvents } from "../src/content/rsvp.ts";
import { normalizeGuestName } from "../src/lib/guest-name.ts";
import {
  collectLateRsvpCancellations,
  type HouseholdRsvpInput,
  householdRsvpInput,
  type RsvpHousehold,
  validateCompleteRsvp,
  validateLateRsvpChange,
} from "../src/lib/rsvp.ts";
import {
  createRsvpAccessToken,
  householdIdFromAccessToken,
} from "../src/lib/rsvp-access.server.ts";
import { buildLateCancellationEmail, buildRsvpConfirmationEmail } from "../src/lib/rsvp-email.ts";
import {
  formatRsvpDeadline,
  resolveRsvpSettings,
  rsvpSettingsInput,
} from "../src/lib/rsvp-settings.ts";

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

test("orders the rehearsal dinner before the wedding celebration", () => {
  assert.deepEqual(
    rsvpEvents.map((event) => event.id),
    ["rehearsal-dinner", "wedding"],
  );
});

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
          plusOne: { name: "Taylor Bloom", dietaryRestrictions: "", mealSelections: [] },
        },
        required(response.guests[1]),
      ],
    },
    invitedGuests,
  );

  assert.match(result ?? "", /Taylor Bloom’s meal/i);
});

test("requires a valid confirmation email", () => {
  const response = completeResponse();

  assert.equal(householdRsvpInput.safeParse({ ...response, contactEmail: "" }).success, false);
  assert.equal(
    householdRsvpInput.safeParse({ ...response, contactEmail: "not-an-email" }).success,
    false,
  );
});

test("trims and limits dietary restrictions for every person", () => {
  const response = completeResponse();
  const firstGuest = required(response.guests[0]);
  const parsed = householdRsvpInput.parse({
    ...response,
    guests: [
      {
        ...firstGuest,
        dietaryRestrictions: "  Peanut allergy  ",
        plusOne: {
          name: "Taylor Bloom",
          dietaryRestrictions: "  Gluten-free  ",
          mealSelections: [{ eventId: "wedding", mealOptionId: "wild-mushroom-risotto" }],
        },
      },
      required(response.guests[1]),
    ],
  });

  assert.equal(parsed.guests[0]?.dietaryRestrictions, "Peanut allergy");
  assert.equal(parsed.guests[0]?.plusOne?.dietaryRestrictions, "Gluten-free");
  assert.equal(
    householdRsvpInput.safeParse({
      ...response,
      guests: [{ ...firstGuest, dietaryRestrictions: "x".repeat(501) }, response.guests[1]],
    }).success,
    false,
  );
});

test("trims and limits the optional household message", () => {
  const response = completeResponse();
  const parsed = householdRsvpInput.parse({
    ...response,
    message: "  We can’t wait to celebrate with you!  ",
  });

  assert.equal(parsed.message, "We can’t wait to celebrate with you!");
  assert.equal(
    householdRsvpInput.safeParse({ ...response, message: "x".repeat(2_001) }).success,
    false,
  );
});

test("keeps full RSVP editing open through the deadline day in Wichita", () => {
  const beforeMidnight = resolveRsvpSettings(
    { deadline: "2027-08-15", isOpen: true },
    new Date("2027-08-16T04:59:59.000Z"),
  );
  const afterMidnight = resolveRsvpSettings(
    { deadline: "2027-08-15", isOpen: true },
    new Date("2027-08-16T05:00:00.000Z"),
  );

  assert.equal(beforeMidnight.fullEditingAllowed, true);
  assert.equal(afterMidnight.fullEditingAllowed, false);
  assert.equal(beforeMidnight.deadlineDisplay, "August 15, 2027");
  assert.equal(formatRsvpDeadline("2027-08-15"), "August 15, 2027");
});

test("lets admin close full editing early and rejects invalid calendar dates", () => {
  const settings = resolveRsvpSettings(
    { deadline: "2027-08-15", isOpen: false },
    new Date("2027-01-01T12:00:00.000Z"),
  );

  assert.equal(settings.fullEditingAllowed, false);
  assert.equal(
    rsvpSettingsInput.safeParse({ deadline: "2027-02-30", isOpen: true }).success,
    false,
  );
});

test("allows only attendance cancellations after the RSVP deadline", () => {
  const response = completeResponse();
  const firstGuest = required(response.guests[0]);
  const cancellation = {
    ...response,
    guests: [
      {
        ...firstGuest,
        eventResponses: firstGuest.eventResponses.map((eventResponse) =>
          eventResponse.eventId === "wedding"
            ? { eventId: eventResponse.eventId, attending: false, mealOptionId: null }
            : eventResponse,
        ),
        plusOne: firstGuest.plusOne === null ? null : { ...firstGuest.plusOne, mealSelections: [] },
      },
      required(response.guests[1]),
    ],
  } satisfies HouseholdRsvpInput;
  const existing = confirmationHousehold();

  assert.equal(validateCompleteRsvp(cancellation, invitedGuests), null);
  assert.equal(validateLateRsvpChange(cancellation, existing), null);
  assert.deepEqual(collectLateRsvpCancellations(cancellation, existing), [
    { name: "Alex Garden", event: "Wedding" },
    { name: "Taylor Bloom", event: "Wedding" },
  ]);
});

test("rejects late acceptances and meal changes", () => {
  const response = completeResponse();
  const firstGuest = required(response.guests[0]);
  const secondGuest = required(response.guests[1]);
  const existing = confirmationHousehold();
  const lateAcceptance = {
    ...response,
    guests: [
      firstGuest,
      {
        ...secondGuest,
        eventResponses: [{ eventId: "wedding", attending: true, mealOptionId: "braised-beef" }],
      },
    ],
  } satisfies HouseholdRsvpInput;
  const mealChangeWithCancellation = {
    ...response,
    guests: [
      {
        ...firstGuest,
        eventResponses: firstGuest.eventResponses.map((eventResponse) =>
          eventResponse.eventId === "wedding"
            ? { eventId: eventResponse.eventId, attending: false, mealOptionId: null }
            : eventResponse,
        ),
        plusOne: null,
      },
      {
        ...secondGuest,
        eventResponses: [{ eventId: "wedding", attending: false, mealOptionId: "braised-beef" }],
      },
    ],
  } satisfies HouseholdRsvpInput;

  assert.match(validateLateRsvpChange(lateAcceptance, existing) ?? "", /only cancel/i);
  assert.match(validateLateRsvpChange(mealChangeWithCancellation, existing) ?? "", /only cancel/i);
  assert.match(validateLateRsvpChange(response, null) ?? "", /deadline has passed/i);
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
  assert.match(email.text, /We can’t wait to celebrate with you!/);
  assert.match(email.text, /Peanut allergy/);
  assert.match(email.html, /Gluten-free/);
  assert.match(email.html, /Wild mushroom risotto/);
  assert.match(email.html, /Your note to Emma &amp; Eric/);
});

test("renders a late cancellation notification for Emma and Eric", () => {
  const email = buildLateCancellationEmail(confirmationHousehold(), [
    { name: "Alex Garden", event: "Wedding" },
    { name: "Taylor Bloom", event: "Wedding" },
  ]);

  assert.match(email.subject, /Late RSVP cancellation/);
  assert.match(email.text, /Alex Garden: Wedding/);
  assert.match(email.text, /garden@example.com/);
  assert.match(email.html, /Taylor Bloom/);
});

function completeResponse(): HouseholdRsvpInput {
  return {
    accessToken: "signed-token",
    contactEmail: "garden@example.com",
    message: "We can’t wait to celebrate with you!",
    guests: [
      {
        guestId: "guest-1",
        dietaryRestrictions: "Peanut allergy",
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
          dietaryRestrictions: "Gluten-free",
          mealSelections: [{ eventId: "wedding", mealOptionId: "wild-mushroom-risotto" }],
        },
      },
      {
        guestId: "guest-2",
        dietaryRestrictions: "",
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
  const secondGuest = required(response.guests[1]);

  return {
    accessToken: "signed-token",
    name: "The Garden household",
    contactEmail: "garden@example.com",
    message: response.message,
    submitted: true,
    events: [],
    guests: [
      {
        id: "guest-1",
        name: "Alex Garden",
        dietaryRestrictions: firstGuest.dietaryRestrictions,
        plusOneAllowed: true,
        eventIds: ["wedding", "rehearsal-dinner"],
        eventResponses: firstGuest.eventResponses,
        plusOne: firstGuest.plusOne,
      },
      {
        id: "guest-2",
        name: "Sam Garden",
        dietaryRestrictions: secondGuest.dietaryRestrictions,
        plusOneAllowed: false,
        eventIds: ["wedding"],
        eventResponses: secondGuest.eventResponses,
        plusOne: null,
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
