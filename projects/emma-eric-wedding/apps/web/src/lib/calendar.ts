export type AllDayCalendarEvent = {
  readonly description: string;
  readonly endDateExclusive: string;
  readonly location: string;
  readonly startDate: string;
  readonly title: string;
  readonly uid: string;
};

export type CalendarLinks = {
  readonly google: string;
  readonly ics: string;
  readonly icsContent: string;
};

export function calendarLinksFor(event: AllDayCalendarEvent): CalendarLinks {
  const startDate = compactDate(event.startDate);
  const endDate = compactDate(event.endDateExclusive);
  const googleParameters = new URLSearchParams({
    action: "TEMPLATE",
    dates: `${startDate}/${endDate}`,
    details: event.description,
    location: event.location,
    text: event.title,
  });
  const icsContent = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Emma and Eric//Wedding//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${escapeCalendarText(event.uid)}`,
    "DTSTAMP:20260729T000000Z",
    `DTSTART;VALUE=DATE:${startDate}`,
    `DTEND;VALUE=DATE:${endDate}`,
    `SUMMARY:${escapeCalendarText(event.title)}`,
    `DESCRIPTION:${escapeCalendarText(event.description)}`,
    `LOCATION:${escapeCalendarText(event.location)}`,
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");

  return {
    google: `https://calendar.google.com/calendar/render?${googleParameters.toString()}`,
    ics: `data:text/calendar;charset=utf-8,${encodeURIComponent(icsContent)}`,
    icsContent,
  };
}

function compactDate(value: string): string {
  const compact = value.replaceAll("-", "");

  if (!/^\d{8}$/.test(compact)) {
    throw new Error(`Invalid all-day calendar date: ${value}`);
  }

  return compact;
}

function escapeCalendarText(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("\n", "\\n")
    .replaceAll(",", "\\,")
    .replaceAll(";", "\\;");
}
