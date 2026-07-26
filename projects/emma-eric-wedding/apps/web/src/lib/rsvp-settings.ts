import { z } from "zod";

export const defaultRsvpDeadline = "2027-08-15";
export const rsvpSettingsId = "wedding-rsvp";
export const weddingTimeZone = "America/Chicago";

const isoDateInput = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a valid RSVP deadline.")
  .refine(isValidIsoDate, "Choose a valid RSVP deadline.");

export const rsvpSettingsInput = z.object({
  deadline: isoDateInput,
  isOpen: z.boolean(),
});

export type RsvpSettingsInput = z.infer<typeof rsvpSettingsInput>;

export type RsvpSettings = RsvpSettingsInput & {
  readonly deadlineDisplay: string;
  readonly fullEditingAllowed: boolean;
};

export function resolveRsvpSettings(
  settings: RsvpSettingsInput,
  now: Date = new Date(),
): RsvpSettings {
  return {
    ...settings,
    deadlineDisplay: formatRsvpDeadline(settings.deadline),
    fullEditingAllowed: settings.isOpen && localIsoDate(now, weddingTimeZone) <= settings.deadline,
  };
}

export function formatRsvpDeadline(deadline: string): string {
  const [year, month, day] = deadline.split("-").map(Number);

  if (year === undefined || month === undefined || day === undefined) {
    return deadline;
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function localIsoDate(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${value("year")}-${value("month")}-${value("day")}`;
}

function isValidIsoDate(value: string): boolean {
  const [year, month, day] = value.split("-").map(Number);

  if (year === undefined || month === undefined || day === undefined) {
    return false;
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}
