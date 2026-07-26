import { z } from "zod";
import type { WeddingEventId } from "../content/rsvp.ts";
import { normalizeGuestName } from "./guest-name.ts";

const weddingEventIdInput = z.enum(["wedding", "rehearsal-dinner"]);
const eventIdsInput = z
  .array(weddingEventIdInput)
  .min(1, "Invite each named guest to at least one event.")
  .max(2)
  .refine((eventIds) => new Set(eventIds).size === eventIds.length, "Choose each event once.");

const namedGuestInput = z.object({
  name: z.string().trim().min(1, "Each named guest needs a name.").max(100),
  plusOneAllowed: z.boolean(),
  eventIds: eventIdsInput,
});
const uniqueGuestNames = <Guest extends { readonly name: string }>(guests: readonly Guest[]) =>
  new Set(guests.map((guest) => normalizeGuestName(guest.name))).size === guests.length;

const optionalTextInput = (maximumLength: number) => z.string().trim().max(maximumLength);
const contactEmailInput = optionalTextInput(254).refine(
  (email) => email.length === 0 || z.email().safeParse(email).success,
  "Enter a valid email address.",
);
const householdDetailsInput = {
  householdName: z.string().trim().min(1, "Household name is required.").max(120),
  contactEmail: contactEmailInput,
  addressLine1: optionalTextInput(160),
  addressLine2: optionalTextInput(160),
  city: optionalTextInput(100),
  region: optionalTextInput(100),
  postalCode: optionalTextInput(32),
  country: optionalTextInput(100),
};

export const householdEnrollmentInput = z.object({
  ...householdDetailsInput,
  guests: z
    .array(namedGuestInput)
    .min(1, "Add at least one named guest.")
    .max(20)
    .refine(uniqueGuestNames, "Each named guest needs a unique full name."),
});

export const householdUpdateInput = z.object({
  householdId: z.string().trim().min(1),
  ...householdDetailsInput,
  guests: z
    .array(namedGuestInput.extend({ id: z.string().trim().min(1).optional() }))
    .min(1, "Add at least one named guest.")
    .max(20)
    .refine(uniqueGuestNames, "Each named guest needs a unique full name."),
});

export const householdDeleteInput = z.object({
  householdId: z.string().trim().min(1),
});

export type HouseholdEnrollmentInput = z.infer<typeof householdEnrollmentInput>;
export type HouseholdUpdateInput = z.infer<typeof householdUpdateInput>;

export type EnrollmentHouseholdRow = {
  readonly id: string;
  readonly name: string;
  readonly contactEmail: string | null;
  readonly addressLine1: string | null;
  readonly addressLine2: string | null;
  readonly city: string | null;
  readonly region: string | null;
  readonly postalCode: string | null;
  readonly country: string | null;
  readonly createdAt: Date;
};

export type EnrollmentGuestRow = {
  readonly id: string;
  readonly householdId: string;
  readonly name: string;
  readonly plusOneAllowed: boolean;
  readonly position: number;
};

export type EnrollmentEventInvitationRow = {
  readonly guestId: string;
  readonly eventId: string;
};

export type EnrollmentHouseholdRsvpRow = {
  readonly householdId: string;
  readonly updatedAt: Date;
};

export type EnrollmentEventResponseRow = {
  readonly guestId: string;
  readonly eventId: string;
  readonly attending: boolean;
  readonly mealOptionId: string | null;
};

export type EnrollmentGuestRsvpDetailRow = {
  readonly guestId: string;
  readonly dietaryRestrictions: string;
};

export type EnrollmentPlusOneResponseRow = {
  readonly guestId: string;
  readonly name: string;
  readonly dietaryRestrictions: string;
};

export type EnrolledGuest = {
  readonly id: string;
  readonly name: string;
  readonly plusOneAllowed: boolean;
  readonly eventIds: readonly WeddingEventId[];
  readonly eventResponses: readonly {
    readonly eventId: WeddingEventId;
    readonly attending: boolean;
    readonly mealOptionId: string;
  }[];
  readonly dietaryRestrictions: string;
  readonly plusOneName: string;
  readonly plusOneDietaryRestrictions: string;
};

export type EnrolledHousehold = {
  readonly id: string;
  readonly name: string;
  readonly contactEmail: string;
  readonly addressLine1: string;
  readonly addressLine2: string;
  readonly city: string;
  readonly region: string;
  readonly postalCode: string;
  readonly country: string;
  readonly guests: readonly EnrolledGuest[];
  readonly namedGuestCount: number;
  readonly plusOneCount: number;
  readonly invitedSeatCount: number;
  readonly respondedAt: string | null;
  readonly createdAt: string;
};

export type EnrollmentDashboard = {
  readonly households: readonly EnrolledHousehold[];
  readonly summary: {
    readonly householdCount: number;
    readonly namedGuestCount: number;
    readonly plusOneCount: number;
    readonly invitedSeatCount: number;
  };
  readonly responseSummary: {
    readonly respondedHouseholdCount: number;
    readonly pendingHouseholdCount: number;
    readonly weddingAttendingCount: number;
    readonly rehearsalDinnerAttendingCount: number;
  };
};

export function buildEnrollmentDashboard(
  householdRows: readonly EnrollmentHouseholdRow[],
  guestRows: readonly EnrollmentGuestRow[],
  eventInvitationRows: readonly EnrollmentEventInvitationRow[] = [],
  householdRsvpRows: readonly EnrollmentHouseholdRsvpRow[] = [],
  eventResponseRows: readonly EnrollmentEventResponseRow[] = [],
  plusOneResponseRows: readonly EnrollmentPlusOneResponseRow[] = [],
  guestRsvpDetailRows: readonly EnrollmentGuestRsvpDetailRow[] = [],
): EnrollmentDashboard {
  const guestsByHousehold = new Map<string, EnrollmentGuestRow[]>();
  const eventIdsByGuest = new Map<string, WeddingEventId[]>();

  for (const guest of guestRows) {
    const householdGuests = guestsByHousehold.get(guest.householdId) ?? [];
    householdGuests.push(guest);
    guestsByHousehold.set(guest.householdId, householdGuests);
  }

  for (const invitation of eventInvitationRows) {
    if (invitation.eventId !== "wedding" && invitation.eventId !== "rehearsal-dinner") {
      continue;
    }

    const guestEventIds = eventIdsByGuest.get(invitation.guestId) ?? [];
    guestEventIds.push(invitation.eventId);
    eventIdsByGuest.set(invitation.guestId, guestEventIds);
  }

  const households = householdRows.map((household) => {
    const guests = (guestsByHousehold.get(household.id) ?? [])
      .toSorted((left, right) => left.position - right.position)
      .map(({ id, name, plusOneAllowed }) => ({
        id,
        name,
        plusOneAllowed,
        eventIds: eventIdsByGuest.get(id) ?? [],
        eventResponses: eventResponseRows
          .filter(
            (response) =>
              response.guestId === id &&
              (response.eventId === "wedding" || response.eventId === "rehearsal-dinner") &&
              (eventIdsByGuest.get(id) ?? []).includes(response.eventId),
          )
          .map((response) => ({
            eventId: response.eventId as WeddingEventId,
            attending: response.attending,
            mealOptionId: response.mealOptionId ?? "",
          })),
        dietaryRestrictions:
          guestRsvpDetailRows.find((detail) => detail.guestId === id)?.dietaryRestrictions ?? "",
        plusOneName: plusOneResponseRows.find((response) => response.guestId === id)?.name ?? "",
        plusOneDietaryRestrictions:
          plusOneResponseRows.find((response) => response.guestId === id)?.dietaryRestrictions ??
          "",
      }));
    const plusOneCount = guests.filter((guest) => guest.plusOneAllowed).length;
    const rsvpUpdatedAt = householdRsvpRows.find(
      (response) => response.householdId === household.id,
    )?.updatedAt;
    const responseIsComplete = guests.every((guest) =>
      guest.eventIds.every((eventId) =>
        guest.eventResponses.some((response) => response.eventId === eventId),
      ),
    );

    return {
      id: household.id,
      name: household.name,
      contactEmail: household.contactEmail ?? "",
      addressLine1: household.addressLine1 ?? "",
      addressLine2: household.addressLine2 ?? "",
      city: household.city ?? "",
      region: household.region ?? "",
      postalCode: household.postalCode ?? "",
      country: household.country ?? "",
      guests,
      namedGuestCount: guests.length,
      plusOneCount,
      invitedSeatCount: guests.length + plusOneCount,
      respondedAt:
        rsvpUpdatedAt === undefined || !responseIsComplete ? null : rsvpUpdatedAt.toISOString(),
      createdAt: household.createdAt.toISOString(),
    };
  });

  const respondedHouseholdCount = households.filter(
    (household) => household.respondedAt !== null,
  ).length;
  const eventAttendingCount = (eventId: WeddingEventId) =>
    households.reduce(
      (total, household) =>
        total +
        household.guests.reduce((guestTotal, guest) => {
          const attending = guest.eventResponses.some(
            (response) => response.eventId === eventId && response.attending,
          );
          return guestTotal + (attending ? 1 : 0) + (attending && guest.plusOneName ? 1 : 0);
        }, 0),
      0,
    );

  return {
    households,
    summary: households.reduce(
      (summary, household) => ({
        householdCount: summary.householdCount + 1,
        namedGuestCount: summary.namedGuestCount + household.namedGuestCount,
        plusOneCount: summary.plusOneCount + household.plusOneCount,
        invitedSeatCount: summary.invitedSeatCount + household.invitedSeatCount,
      }),
      {
        householdCount: 0,
        namedGuestCount: 0,
        plusOneCount: 0,
        invitedSeatCount: 0,
      },
    ),
    responseSummary: {
      respondedHouseholdCount,
      pendingHouseholdCount: households.length - respondedHouseholdCount,
      weddingAttendingCount: eventAttendingCount("wedding"),
      rehearsalDinnerAttendingCount: eventAttendingCount("rehearsal-dinner"),
    },
  };
}
