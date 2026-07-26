import { createServerFn } from "@tanstack/react-start";
import { eq } from "@templar/db";
import { makeEmail } from "@templar/email";
import { Effect } from "effect";
import {
  eventInvitations,
  guestEventResponses,
  guestRsvpDetails,
  guests,
  householdRsvps,
  households,
  plusOneMealSelections,
  plusOneResponses,
  rsvpRevisions,
} from "../../../../db/schema.ts";
import { isWeddingEventId, rsvpEvents, type WeddingEventId } from "../content/rsvp.ts";
import { getWeddingDatabase, type WeddingDatabase } from "./database.server.ts";
import { normalizeGuestName } from "./guest-name.ts";
import {
  type HouseholdRsvpInput,
  householdRsvpInput,
  type InvitedGuest,
  type RsvpHousehold,
  type RsvpLookupResult,
  type RsvpSubmissionResult,
  rsvpLookupInput,
  validateCompleteRsvp,
} from "./rsvp.ts";
import { createRsvpAccessToken, householdIdFromAccessToken } from "./rsvp-access.server.ts";
import { buildRsvpConfirmationEmail } from "./rsvp-email.ts";

type RsvpBindings = {
  readonly APP_ENV: "local" | "prod";
  readonly AUTH_SECRET: string;
  readonly EMAIL: Parameters<typeof makeEmail>[0];
  readonly RSVP_LOOKUP_RATE_LIMIT: {
    readonly limit: (input: { readonly key: string }) => Promise<{ readonly success: boolean }>;
  };
};

export const findRsvpHousehold = createServerFn({ method: "POST" })
  .inputValidator(rsvpLookupInput)
  .handler(async (context): Promise<RsvpLookupResult> => {
    const request = requestFromContext(context);
    const bindings = await getBindings();
    const rateLimit = await bindings.RSVP_LOOKUP_RATE_LIMIT.limit({
      key: request.headers.get("CF-Connecting-IP") ?? "local",
    });

    if (!rateLimit.success) {
      return { status: "rate-limited", household: null };
    }

    const database = await getWeddingDatabase();
    const guestRows = await database.db.select().from(guests);
    const normalizedName = normalizeGuestName(context.data.fullName);
    const matchingGuests = guestRows.filter(
      (guest) => normalizeGuestName(guest.name) === normalizedName,
    );

    if (matchingGuests.length !== 1) {
      return { status: "not-found", household: null };
    }

    const householdId = matchingGuests[0]?.householdId;
    if (householdId === undefined) {
      return { status: "not-found", household: null };
    }

    const accessToken = await createRsvpAccessToken(householdId, bindings.AUTH_SECRET);
    const household = await readRsvpHousehold(database, householdId, accessToken);

    return household === null
      ? { status: "not-found", household: null }
      : { status: "found", household };
  });

export const submitHouseholdRsvp = createServerFn({ method: "POST" })
  .inputValidator(householdRsvpInput)
  .handler(async (context): Promise<RsvpSubmissionResult> => {
    const bindings = await getBindings();
    const householdId = await householdIdFromAccessToken(
      context.data.accessToken,
      bindings.AUTH_SECRET,
    );

    if (householdId === null) {
      throw new Error("This RSVP session has expired. Look up the invitation again.");
    }

    const database = await getWeddingDatabase();
    const invitedGuests = await readInvitedGuests(database, householdId);
    const validationError = validateCompleteRsvp(context.data, invitedGuests);

    if (validationError !== null) {
      throw new Error(validationError);
    }

    await persistRsvp(database, householdId, context.data, invitedGuests);

    const household = await readRsvpHousehold(database, householdId, context.data.accessToken);

    if (household === null) {
      throw new Error("The saved RSVP could not be loaded.");
    }

    return {
      household,
      emailStatus: await sendConfirmationEmail(bindings, household),
    };
  });

async function persistRsvp(
  database: WeddingDatabase,
  householdId: string,
  input: HouseholdRsvpInput,
  invitedGuests: readonly InvitedGuest[],
) {
  const now = new Date();
  const existingRsvp = await database.db
    .select({ submittedAt: householdRsvps.submittedAt })
    .from(householdRsvps)
    .where(eq(householdRsvps.householdId, householdId))
    .limit(1);
  const guestResponses = input.guests.flatMap((guest) =>
    guest.eventResponses.map((response) => ({
      guestId: guest.guestId,
      eventId: response.eventId,
      attending: response.attending,
      mealOptionId: response.mealOptionId,
      createdAt: now,
      updatedAt: now,
    })),
  );
  const plusOnes = input.guests.flatMap((guest) =>
    guest.plusOne === null
      ? []
      : [
          {
            guestId: guest.guestId,
            name: guest.plusOne.name,
            dietaryRestrictions: guest.plusOne.dietaryRestrictions,
            createdAt: now,
            updatedAt: now,
          },
        ],
  );
  const plusOneMeals = input.guests.flatMap((guest) =>
    guest.plusOne === null
      ? []
      : guest.plusOne.mealSelections.map((selection) => ({
          guestId: guest.guestId,
          eventId: selection.eventId,
          mealOptionId: selection.mealOptionId,
          createdAt: now,
          updatedAt: now,
        })),
  );
  const householdUpsert = database.db
    .insert(householdRsvps)
    .values({
      householdId,
      contactEmail: input.contactEmail.length === 0 ? null : input.contactEmail,
      message: input.message,
      submittedAt: existingRsvp[0]?.submittedAt ?? now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: householdRsvps.householdId,
      set: {
        contactEmail: input.contactEmail.length === 0 ? null : input.contactEmail,
        message: input.message,
        updatedAt: now,
      },
    });

  await database.db.batch([
    householdUpsert,
    database.db.insert(rsvpRevisions).values({
      id: crypto.randomUUID(),
      householdId,
      responseJson: JSON.stringify({
        contactEmail: input.contactEmail,
        message: input.message,
        guests: input.guests,
      }),
      createdAt: now,
    }),
    ...invitedGuests.map((guest) =>
      database.db.delete(guestEventResponses).where(eq(guestEventResponses.guestId, guest.id)),
    ),
    ...invitedGuests.map((guest) =>
      database.db.delete(guestRsvpDetails).where(eq(guestRsvpDetails.guestId, guest.id)),
    ),
    ...invitedGuests.map((guest) =>
      database.db.delete(plusOneMealSelections).where(eq(plusOneMealSelections.guestId, guest.id)),
    ),
    ...invitedGuests.map((guest) =>
      database.db.delete(plusOneResponses).where(eq(plusOneResponses.guestId, guest.id)),
    ),
    database.db.insert(guestEventResponses).values(guestResponses),
    database.db.insert(guestRsvpDetails).values(
      input.guests.map((guest) => ({
        guestId: guest.guestId,
        dietaryRestrictions: guest.dietaryRestrictions,
        createdAt: now,
        updatedAt: now,
      })),
    ),
    ...(plusOnes.length === 0 ? [] : [database.db.insert(plusOneResponses).values(plusOnes)]),
    ...(plusOneMeals.length === 0
      ? []
      : [database.db.insert(plusOneMealSelections).values(plusOneMeals)]),
  ]);
}

async function readInvitedGuests(
  database: WeddingDatabase,
  householdId: string,
): Promise<readonly InvitedGuest[]> {
  const [guestRows, invitationRows] = await Promise.all([
    database.db.select().from(guests).where(eq(guests.householdId, householdId)),
    database.db.select().from(eventInvitations),
  ]);

  return guestRows.map((guest) => ({
    id: guest.id,
    name: guest.name,
    plusOneAllowed: guest.plusOneAllowed,
    eventIds: invitationRows
      .filter((invitation) => invitation.guestId === guest.id)
      .map((invitation) => invitation.eventId),
  }));
}

async function readRsvpHousehold(
  database: WeddingDatabase,
  householdId: string,
  accessToken: string,
): Promise<RsvpHousehold | null> {
  const [
    householdRows,
    guestRows,
    invitationRows,
    householdRsvpRows,
    responseRows,
    guestRsvpDetailRows,
    plusOneRows,
    plusOneMealRows,
  ] = await Promise.all([
    database.db.select().from(households).where(eq(households.id, householdId)).limit(1),
    database.db.select().from(guests).where(eq(guests.householdId, householdId)),
    database.db.select().from(eventInvitations),
    database.db
      .select()
      .from(householdRsvps)
      .where(eq(householdRsvps.householdId, householdId))
      .limit(1),
    database.db.select().from(guestEventResponses),
    database.db.select().from(guestRsvpDetails),
    database.db.select().from(plusOneResponses),
    database.db.select().from(plusOneMealSelections),
  ]);
  const household = householdRows[0];

  if (household === undefined) {
    return null;
  }

  const guestIds = new Set(guestRows.map((guest) => guest.id));
  const householdInvitations = invitationRows.filter((invitation) =>
    guestIds.has(invitation.guestId),
  );
  const householdEventIds = new Set(householdInvitations.map((invitation) => invitation.eventId));

  return {
    accessToken,
    name: household.name,
    contactEmail: householdRsvpRows[0]?.contactEmail ?? household.contactEmail ?? "",
    message: householdRsvpRows[0]?.message ?? "",
    submitted: householdRsvpRows[0] !== undefined,
    events: rsvpEvents.filter((event) => householdEventIds.has(event.id)),
    guests: guestRows
      .toSorted((left, right) => left.position - right.position)
      .map((guest) => {
        const eventIds = rsvpEvents
          .map((event) => event.id)
          .filter((eventId) =>
            householdInvitations.some(
              (invitation) => invitation.guestId === guest.id && invitation.eventId === eventId,
            ),
          );
        const plusOne = plusOneRows.find((response) => response.guestId === guest.id);

        return {
          id: guest.id,
          name: guest.name,
          plusOneAllowed: guest.plusOneAllowed,
          eventIds,
          dietaryRestrictions:
            guestRsvpDetailRows.find((detail) => detail.guestId === guest.id)
              ?.dietaryRestrictions ?? "",
          eventResponses: eventIds.map((eventId) => {
            const response = responseRows.find(
              (candidate) => candidate.guestId === guest.id && candidate.eventId === eventId,
            );

            return {
              eventId,
              attending: response?.attending ?? null,
              mealOptionId: response?.mealOptionId ?? null,
            };
          }),
          plusOne:
            plusOne === undefined
              ? null
              : {
                  name: plusOne.name,
                  dietaryRestrictions: plusOne.dietaryRestrictions,
                  mealSelections: plusOneMealRows
                    .filter(
                      (selection) =>
                        selection.guestId === guest.id && isWeddingEventId(selection.eventId),
                    )
                    .map((selection) => ({
                      eventId: selection.eventId as WeddingEventId,
                      mealOptionId: selection.mealOptionId,
                    })),
                },
        };
      }),
  };
}

async function sendConfirmationEmail(
  bindings: RsvpBindings,
  household: RsvpHousehold,
): Promise<RsvpSubmissionResult["emailStatus"]> {
  if (household.contactEmail.length === 0) {
    return "skipped";
  }

  const message = buildRsvpConfirmationEmail(household);
  const email = makeEmail(bindings.EMAIL, {
    app: "emma-eric-wedding",
    environment: bindings.APP_ENV,
    defaultFrom: { email: "rsvp@ericventor.com", name: "Emma & Eric" },
  });

  try {
    const result = await Effect.runPromise(
      email.send({
        to: household.contactEmail,
        subject: message.subject,
        text: message.text,
        html: message.html,
      }),
    );

    return result.status === "skipped" ? "skipped" : "sent";
  } catch (error) {
    console.error("RSVP confirmation email failed", {
      household: household.name,
      error,
    });
    return "failed";
  }
}

async function getBindings(): Promise<RsvpBindings> {
  const { env } = await import("cloudflare:workers");
  return env as unknown as RsvpBindings;
}

function requestFromContext(context: unknown): Request {
  const request = (context as { readonly request?: Request }).request;

  if (request === undefined) {
    throw new Error("Request context unavailable.");
  }

  return request;
}
