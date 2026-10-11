// What is printed on each card once it is opened. One sheet per section.

import type { ReactNode } from "react";
import { pageById } from "../content/pages.ts";
import {
  faq,
  guestEvents,
  type ScheduleEvent,
  schedule,
  stay,
  thingsToDo,
  travel,
} from "../content/site.ts";
import { art, artFor } from "../shared/art.ts";
import { BookButton } from "../shared/chrome.tsx";
import type { SectionId } from "./layout.ts";

function artUrl(id: string): string | undefined {
  const name = artFor[id];
  return name ? art[name] : undefined;
}

function EventColumn({ event }: { event: ScheduleEvent }) {
  return (
    <section className="v3-event">
      <img className="v3-event__art" src={artUrl(event.id)} alt="" />
      {event.lead && <p className="v3-event__lead">{event.lead}</p>}
      <p className="v3-script">{event.day}</p>
      <h3 className="v3-event__name">{event.name}</h3>
      {event.time && <p className="v3-event__time">{event.time}</p>}
      {event.notes.map((note) => (
        <p key={note} className="v3-event__note">
          {note}
        </p>
      ))}
      {event.details && <p className="v3-event__details">{event.details}</p>}
      {event.venueAnnounced && (
        <p className="v3-event__venue">
          <span>{event.venue.name}</span>
          <a href={event.venue.mapUrl} target="_blank" rel="noreferrer">
            {event.venue.address}
          </a>
          {event.venueNote && <span className="v3-event__note">{event.venueNote}</span>}
        </p>
      )}
      {event.moments && (
        <ol className="v3-moments" aria-label="Timeline">
          {event.moments.map((moment) => (
            <li key={moment.id}>
              <img src={artUrl(moment.id)} alt="" />
              {moment.time}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function ScheduleSheet() {
  return (
    <div className="v3-schedule">
      {guestEvents.map((event) => (
        <EventColumn key={event.id} event={event} />
      ))}
    </div>
  );
}

/** Groups the travel paragraphs under the labelled section they follow. */
function travelGroups() {
  const groups: { label: string; paragraphs: (readonly string[])[] }[] = [];
  for (const section of travel.sections) {
    const last = groups.at(-1);
    if (section.label !== null || !last) {
      groups.push({ label: section.label ?? "", paragraphs: [section.lines] });
    } else {
      last.paragraphs.push(section.lines);
    }
  }
  return groups;
}

const travelArt = [art.airplane, art.car] as const;

function TravelSheet() {
  return (
    <div className="v3-travel">
      {travelGroups().map((group, index) => (
        <section key={group.label}>
          <img src={travelArt[index]} alt="" />
          <h3 className="v3-kicker">{group.label}</h3>
          {group.paragraphs.map((lines) => (
            <p key={lines[0]}>{lines.join(" ")}</p>
          ))}
        </section>
      ))}
    </div>
  );
}

function StaySheet() {
  return (
    <div className="v3-stay">
      <p className="v3-stay__intro">
        {stay.intro.map((line) => (
          <span key={line}>{line}</span>
        ))}
      </p>
      <ul className="v3-hotels">
        {stay.hotels.map((hotel) => (
          <li key={hotel.id}>
            <img src={artUrl(hotel.id)} alt="" />
            <h3>
              {hotel.name.map((line) => (
                <span key={line}>{line}</span>
              ))}
            </h3>
            <a className="v3-link" href={hotel.mapUrl} target="_blank" rel="noreferrer">
              {hotel.address}
            </a>
            <ul>
              {hotel.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
            <BookButton hotel={hotel} className="v3-button" />
          </li>
        ))}
      </ul>
    </div>
  );
}

function ThingsSheet() {
  return (
    <div className="v3-things">
      <ul className="v3-activities">
        {thingsToDo.activities.map((activity) => (
          <li key={activity.id}>
            <img src={artUrl(activity.id)} alt="" />
            <h3>{activity.title}</h3>
            <p>{activity.text}</p>
          </li>
        ))}
      </ul>
      <aside className="v3-eats">
        <img src={art.plate} alt="" />
        {thingsToDo.food.map((group) => (
          <section key={group.id}>
            <h3 className="v3-kicker">{group.label}</h3>
            <p>{group.places.join(", ")}</p>
          </section>
        ))}
      </aside>
    </div>
  );
}

function FaqSheet() {
  return (
    <dl className="v3-faq">
      {faq.items.map((item) => (
        <div key={item.id}>
          <dt>{item.question}</dt>
          <dd>{item.answer}</dd>
        </div>
      ))}
    </dl>
  );
}

export const sheets: Record<SectionId, { title: string; body: () => ReactNode }> = {
  schedule: { title: schedule.title, body: ScheduleSheet },
  travel: { title: travel.title, body: TravelSheet },
  stay: { title: pageById("stay").title, body: StaySheet },
  "things-to-do": { title: thingsToDo.title, body: ThingsSheet },
  faq: { title: faq.title, body: FaqSheet },
};
