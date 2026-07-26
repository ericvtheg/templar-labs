import { mealOptionById, rsvpEvents, type WeddingEventId } from "../content/rsvp.ts";
import type { EnrolledGuest, EnrollmentDashboard } from "./enrollment.ts";

const vendorExportHeaders = [
  "Name",
  "Household",
  "Guest type",
  "Guest of",
  ...rsvpEvents.flatMap((event) =>
    event.mealOptions.length === 0
      ? [event.shortTitle]
      : [event.shortTitle, `${event.shortTitle} meal`],
  ),
  "Dietary restrictions",
  "Message to Emma & Eric",
] as const;

type VendorExportRow = {
  readonly name: string;
  readonly household: string;
  readonly guestType: "Named guest" | "Plus-one";
  readonly guestOf: string;
  readonly eventCells: readonly string[];
  readonly dietaryRestrictions: string;
  readonly message: string;
};

export function buildVendorCsv(dashboard: EnrollmentDashboard): string {
  const rows = dashboard.households
    .toSorted((left, right) => left.name.localeCompare(right.name, "en", { sensitivity: "base" }))
    .flatMap((household) =>
      household.guests.flatMap((guest) =>
        vendorRowsForGuest(household.name, household.message, guest),
      ),
    );

  return `\uFEFF${[vendorExportHeaders, ...rows.map(rowValues)].map(serializeRow).join("\r\n")}\r\n`;
}

export function vendorExportFilename(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `emma-eric-vendor-guest-list-${year}-${month}-${day}.csv`;
}

function vendorRowsForGuest(
  household: string,
  message: string,
  guest: EnrolledGuest,
): readonly VendorExportRow[] {
  const namedGuestRow: VendorExportRow = {
    name: guest.name,
    household,
    guestType: "Named guest",
    guestOf: "",
    eventCells: rsvpEvents.flatMap((event) =>
      event.mealOptions.length === 0
        ? [eventStatus(guest, event.id)]
        : [eventStatus(guest, event.id), namedGuestMeal(guest, event.id)],
    ),
    dietaryRestrictions: guest.dietaryRestrictions,
    message,
  };

  if (guest.plusOneName.length === 0) {
    return [namedGuestRow];
  }

  return [
    namedGuestRow,
    {
      name: guest.plusOneName,
      household,
      guestType: "Plus-one",
      guestOf: guest.name,
      eventCells: rsvpEvents.flatMap((event) =>
        event.mealOptions.length === 0
          ? [plusOneEventStatus(guest, event.id)]
          : [plusOneEventStatus(guest, event.id), plusOneMeal(guest, event.id)],
      ),
      dietaryRestrictions: guest.plusOneDietaryRestrictions,
      message,
    },
  ];
}

function eventStatus(guest: EnrolledGuest, eventId: WeddingEventId): string {
  if (!guest.eventIds.includes(eventId)) {
    return "Not invited";
  }

  const response = guest.eventResponses.find((candidate) => candidate.eventId === eventId);

  if (response === undefined) {
    return "Awaiting response";
  }

  return response.attending ? "Attending" : "Declined";
}

function plusOneEventStatus(guest: EnrolledGuest, eventId: WeddingEventId): string {
  return guest.eventResponses.some((response) => response.eventId === eventId && response.attending)
    ? "Attending"
    : "Not attending";
}

function namedGuestMeal(guest: EnrolledGuest, eventId: WeddingEventId): string {
  const mealOptionId = guest.eventResponses.find(
    (response) => response.eventId === eventId && response.attending,
  )?.mealOptionId;

  return mealLabel(eventId, mealOptionId);
}

function plusOneMeal(guest: EnrolledGuest, eventId: WeddingEventId): string {
  const mealOptionId = guest.plusOneMealSelections.find(
    (selection) => selection.eventId === eventId,
  )?.mealOptionId;

  return mealLabel(eventId, mealOptionId);
}

function mealLabel(eventId: WeddingEventId, mealOptionId: string | undefined): string {
  if (mealOptionId === undefined || mealOptionId.length === 0) {
    return "";
  }

  return mealOptionById(eventId, mealOptionId)?.label ?? mealOptionId;
}

function rowValues(row: VendorExportRow): readonly string[] {
  return [
    row.name,
    row.household,
    row.guestType,
    row.guestOf,
    ...row.eventCells,
    row.dietaryRestrictions,
    row.message,
  ];
}

function serializeRow(values: readonly string[]): string {
  return values.map(serializeCell).join(",");
}

function serializeCell(value: string): string {
  const spreadsheetSafeValue = /^[=+\-@\t\r\n]/.test(value) ? `'${value}` : value;

  return /[",\r\n]/.test(spreadsheetSafeValue)
    ? `"${spreadsheetSafeValue.replaceAll('"', '""')}"`
    : spreadsheetSafeValue;
}
