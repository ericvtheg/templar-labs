import { z } from "zod";
import {
  eventById,
  isWeddingEventId,
  mealOptionById,
  type RsvpEvent,
  type WeddingEventId,
} from "../content/rsvp.ts";

const weddingEventIdInput = z.enum(["wedding", "rehearsal-dinner"]);
const confirmationEmailInput = z
  .string()
  .trim()
  .min(1, "Enter an email address for the RSVP confirmation.")
  .max(254)
  .refine((email) => z.email().safeParse(email).success, "Enter a valid email address.");

export const rsvpLookupInput = z.object({
  fullName: z.string().trim().min(2, "Enter your full name.").max(100),
});

const eventResponseInput = z.object({
  eventId: weddingEventIdInput,
  attending: z.boolean(),
  mealOptionId: z.string().trim().min(1).nullable(),
});

const plusOneInput = z.object({
  name: z.string().trim().min(1, "Enter your guest’s full name.").max(100),
  dietaryRestrictions: z.string().trim().max(500),
  mealSelections: z.array(
    z.object({
      eventId: weddingEventIdInput,
      mealOptionId: z.string().trim().min(1),
    }),
  ),
});

export const householdRsvpInput = z.object({
  accessToken: z.string().min(1),
  contactEmail: confirmationEmailInput,
  guests: z
    .array(
      z.object({
        guestId: z.string().min(1),
        dietaryRestrictions: z.string().trim().max(500),
        eventResponses: z.array(eventResponseInput),
        plusOne: plusOneInput.nullable(),
      }),
    )
    .min(1),
});

export type HouseholdRsvpInput = z.infer<typeof householdRsvpInput>;

export type RsvpEventResponse = {
  readonly eventId: WeddingEventId;
  readonly attending: boolean | null;
  readonly mealOptionId: string | null;
};

export type RsvpPlusOne = {
  readonly name: string;
  readonly dietaryRestrictions: string;
  readonly mealSelections: readonly {
    readonly eventId: WeddingEventId;
    readonly mealOptionId: string;
  }[];
};

export type RsvpGuest = {
  readonly id: string;
  readonly name: string;
  readonly dietaryRestrictions: string;
  readonly plusOneAllowed: boolean;
  readonly eventIds: readonly WeddingEventId[];
  readonly eventResponses: readonly RsvpEventResponse[];
  readonly plusOne: RsvpPlusOne | null;
};

export type RsvpHousehold = {
  readonly accessToken: string;
  readonly name: string;
  readonly contactEmail: string;
  readonly submitted: boolean;
  readonly events: readonly RsvpEvent[];
  readonly guests: readonly RsvpGuest[];
};

export type RsvpLookupResult =
  | { readonly status: "found"; readonly household: RsvpHousehold }
  | { readonly status: "not-found" | "rate-limited"; readonly household: null };

export type RsvpSubmissionResult = {
  readonly household: RsvpHousehold;
  readonly emailStatus: "sent" | "skipped" | "failed";
};

export type InvitedGuest = {
  readonly id: string;
  readonly name: string;
  readonly plusOneAllowed: boolean;
  readonly eventIds: readonly string[];
};

export function validateCompleteRsvp(
  input: HouseholdRsvpInput,
  invitedGuests: readonly InvitedGuest[],
): string | null {
  if (input.guests.length !== invitedGuests.length) {
    return "Respond for every person named on the invitation.";
  }

  const responsesByGuest = new Map(input.guests.map((guest) => [guest.guestId, guest]));

  if (responsesByGuest.size !== input.guests.length) {
    return "Each person can appear only once.";
  }

  for (const invitedGuest of invitedGuests) {
    const guestResponse = responsesByGuest.get(invitedGuest.id);

    if (guestResponse === undefined) {
      return `Complete the RSVP for ${invitedGuest.name}.`;
    }

    const eventResponses = new Map(
      guestResponse.eventResponses.map((response) => [response.eventId, response]),
    );
    const validEventIds = invitedGuest.eventIds.filter(isWeddingEventId);

    if (
      eventResponses.size !== guestResponse.eventResponses.length ||
      eventResponses.size !== validEventIds.length ||
      validEventIds.some((eventId) => !eventResponses.has(eventId))
    ) {
      return `Answer every event invitation for ${invitedGuest.name}.`;
    }

    for (const eventId of validEventIds) {
      const eventResponse = eventResponses.get(eventId);
      const weddingEvent = eventById(eventId);

      if (eventResponse === undefined || weddingEvent === undefined) {
        return `Answer every event invitation for ${invitedGuest.name}.`;
      }

      if (!eventResponse.attending && eventResponse.mealOptionId !== null) {
        return `Remove the meal selection for ${invitedGuest.name}’s declined event.`;
      }

      if (eventResponse.attending && weddingEvent.mealOptions.length > 0) {
        if (
          eventResponse.mealOptionId === null ||
          mealOptionById(eventId, eventResponse.mealOptionId) === undefined
        ) {
          return `Choose ${invitedGuest.name}’s meal for ${weddingEvent.shortTitle}.`;
        }
      }

      if (weddingEvent.mealOptions.length === 0 && eventResponse.mealOptionId !== null) {
        return `${weddingEvent.shortTitle} does not have a meal selection yet.`;
      }
    }

    const attendingEventIds = guestResponse.eventResponses
      .filter((response) => response.attending)
      .map((response) => response.eventId);

    if (attendingEventIds.length === 0 && guestResponse.dietaryRestrictions.length > 0) {
      return `Remove the dietary restrictions for ${invitedGuest.name}’s declined invitation.`;
    }

    if (guestResponse.plusOne !== null) {
      if (!invitedGuest.plusOneAllowed || attendingEventIds.length === 0) {
        return `${invitedGuest.name} cannot add a guest to this response.`;
      }

      const plusOneMeals = new Map(
        guestResponse.plusOne.mealSelections.map((selection) => [selection.eventId, selection]),
      );

      if (plusOneMeals.size !== guestResponse.plusOne.mealSelections.length) {
        return "Choose each guest meal once.";
      }

      for (const eventId of attendingEventIds) {
        const weddingEvent = eventById(eventId);

        if (weddingEvent === undefined || weddingEvent.mealOptions.length === 0) {
          continue;
        }

        const selection = plusOneMeals.get(eventId);
        if (
          selection === undefined ||
          mealOptionById(eventId, selection.mealOptionId) === undefined
        ) {
          return `Choose ${guestResponse.plusOne.name}’s meal for ${weddingEvent.shortTitle}.`;
        }
      }

      if (
        guestResponse.plusOne.mealSelections.some(
          (selection) =>
            !attendingEventIds.includes(selection.eventId) ||
            mealOptionById(selection.eventId, selection.mealOptionId) === undefined,
        )
      ) {
        return "A guest meal must belong to an event they are attending.";
      }
    }
  }

  if (
    input.guests.some((guest) => !invitedGuests.some((invited) => invited.id === guest.guestId))
  ) {
    return "This response includes someone outside the household.";
  }

  return null;
}
