import { useEffect, useId, useRef, useState } from "react";

import { wedding } from "../content/wedding.ts";
import { calendarLinksFor } from "../lib/calendar.ts";

const calendarLinks = calendarLinksFor({
  description: "Celebrate the wedding of Emma and Eric at Botanica, The Wichita Gardens.",
  endDateExclusive: "2027-09-26",
  location: `${wedding.venue.name}, ${wedding.venue.city}, ${wedding.venue.region}`,
  startDate: wedding.date.iso,
  title: "Emma & Eric’s Wedding",
  uid: "emma-eric-wedding-20270925@emmaand.ericventor.com",
});

export function AddToCalendar() {
  const panelId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        containerRef.current !== null &&
        !containerRef.current.contains(event.target)
      ) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div className="add-to-calendar" ref={containerRef}>
      <button
        aria-controls={panelId}
        aria-expanded={open}
        className="calendar-trigger"
        onClick={() => setOpen((current) => !current)}
        ref={triggerRef}
        type="button"
      >
        <span>{wedding.date.display}</span>
        <small>
          Add to calendar
          <svg aria-hidden="true" viewBox="0 0 20 20">
            <path d="M5.5 2.75v2.5m9-2.5v2.5M3 7.25h14M4.25 4h11.5A1.25 1.25 0 0 1 17 5.25v10.5A1.25 1.25 0 0 1 15.75 17H4.25A1.25 1.25 0 0 1 3 15.75V5.25A1.25 1.25 0 0 1 4.25 4Z" />
          </svg>
        </small>
      </button>

      {open ? (
        <section
          aria-label="Add wedding date to a calendar"
          className="calendar-popover"
          id={panelId}
        >
          <span className="calendar-popover-eyebrow">Save the date</span>
          <strong>{wedding.date.display}</strong>
          <div>
            <a href={calendarLinks.google} rel="noreferrer" target="_blank">
              Google Calendar <span aria-hidden="true">↗</span>
            </a>
            <a download="emma-and-eric-wedding.ics" href={calendarLinks.ics}>
              Apple or Outlook <span aria-hidden="true">↓</span>
            </a>
          </div>
          <small>Saved as an all-day celebration.</small>
        </section>
      ) : null}
    </div>
  );
}
