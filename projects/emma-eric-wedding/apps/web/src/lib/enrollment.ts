import { z } from "zod";

const namedGuestInput = z.object({
  name: z.string().trim().min(1, "Each named guest needs a name.").max(100),
  plusOneAllowed: z.boolean(),
});

export const householdEnrollmentInput = z.object({
  householdName: z.string().trim().min(1, "Household name is required.").max(120),
  guests: z.array(namedGuestInput).min(1, "Add at least one named guest.").max(20),
});

export type HouseholdEnrollmentInput = z.infer<typeof householdEnrollmentInput>;

export type EnrollmentHouseholdRow = {
  readonly id: string;
  readonly name: string;
  readonly createdAt: Date;
};

export type EnrollmentGuestRow = {
  readonly id: string;
  readonly householdId: string;
  readonly name: string;
  readonly plusOneAllowed: boolean;
  readonly position: number;
};

export type EnrolledGuest = {
  readonly id: string;
  readonly name: string;
  readonly plusOneAllowed: boolean;
};

export type EnrolledHousehold = {
  readonly id: string;
  readonly name: string;
  readonly guests: readonly EnrolledGuest[];
  readonly namedGuestCount: number;
  readonly plusOneCount: number;
  readonly invitedSeatCount: number;
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
};

export function buildEnrollmentDashboard(
  householdRows: readonly EnrollmentHouseholdRow[],
  guestRows: readonly EnrollmentGuestRow[],
): EnrollmentDashboard {
  const guestsByHousehold = new Map<string, EnrollmentGuestRow[]>();

  for (const guest of guestRows) {
    const householdGuests = guestsByHousehold.get(guest.householdId) ?? [];
    householdGuests.push(guest);
    guestsByHousehold.set(guest.householdId, householdGuests);
  }

  const households = householdRows.map((household) => {
    const guests = (guestsByHousehold.get(household.id) ?? [])
      .toSorted((left, right) => left.position - right.position)
      .map(({ id, name, plusOneAllowed }) => ({ id, name, plusOneAllowed }));
    const plusOneCount = guests.filter((guest) => guest.plusOneAllowed).length;

    return {
      id: household.id,
      name: household.name,
      guests,
      namedGuestCount: guests.length,
      plusOneCount,
      invitedSeatCount: guests.length + plusOneCount,
      createdAt: household.createdAt.toISOString(),
    };
  });

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
  };
}
