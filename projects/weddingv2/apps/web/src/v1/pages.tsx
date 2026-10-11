import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { Link } from "react-router";
import { pageById, pagePath, travelParts } from "../content/pages.ts";
import { heroPhoto, supportingPhotos } from "../content/photos.ts";
import {
  couple,
  faq,
  guestEvents,
  home,
  type ScheduleEvent,
  schedule,
  stay,
  thingsToDo,
  travel,
} from "../content/site.ts";
import { art } from "../shared/art.ts";
import { BookButton } from "../shared/chrome.tsx";
import { usePageTitle } from "../shared/hooks.ts";
import { Photo } from "../shared/Photo.tsx";

export function Home() {
  usePageTitle(pageById("home").title);
  const [second, third] = supportingPhotos;

  return (
    <div className="v1-home">
      <header className="v1-home__title">
        <h1 className="v1-names">
          <span>{couple.first}</span> <span>&amp;</span> <span>{couple.second}</span>
        </h1>
        <p className="v1-date">{couple.date}</p>
      </header>

      <img className="v1-home__bouquet" src={art.bouquet} alt="" width={1228} height={1224} />

      <div className="v1-home__photos">
        {second && <Photo slot={second} className="v1-photo" eager />}
        <Photo slot={heroPhoto} className="v1-photo v1-photo--hero" eager />
        {third && <Photo slot={third} className="v1-photo" eager />}
      </div>

      <div className="v1-home__hello">
        <p className="v1-tagline">{home.tagline}</p>
        <p className="v1-letter">
          {home.letter.greeting}
          {home.letter.lines.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </p>
      </div>
    </div>
  );
}

function EventDetails({ event }: { event: ScheduleEvent }) {
  return (
    <div className="v1-event__body">
      <p className="v1-day">{event.day}</p>
      <p className="v1-event__line">{event.name}</p>
      {event.time && <p className="v1-event__line">{event.time}</p>}
      {event.notes.map((note) => (
        <p key={note} className="v1-event__note">
          {note}
        </p>
      ))}
      {event.details && <p className="v1-event__details">{event.details}</p>}
      {event.venueAnnounced && (
        <div className="v1-event__venue">
          <p className="v1-event__line">{event.venue.name}</p>
          <p className="v1-event__line">
            <a href={event.venue.mapUrl} target="_blank" rel="noreferrer">
              {event.venue.address}
            </a>
          </p>
          {event.venueNote && <p className="v1-event__note">{event.venueNote}</p>}
        </div>
      )}
    </div>
  );
}

export function Schedule() {
  usePageTitle(pageById("schedule").title);

  return (
    <div className="v1-schedule">
      {guestEvents.map((event, index) => (
        <section key={event.id} className="v1-event">
          {index === 0 ? (
            <h1 className="v1-heading">{schedule.title}</h1>
          ) : (
            <h2 className="v1-lead">{event.lead}</h2>
          )}
          <EventDetails event={event} />
        </section>
      ))}
    </div>
  );
}

function TravelTabs({ current }: { current: "travel" | "stay" }) {
  return (
    <nav className="v1-tabs" aria-label="Travel">
      {travelParts.map((part) => (
        <Link
          key={part.id}
          to={pagePath("v1", part.id)}
          aria-current={part.id === current ? "page" : undefined}
        >
          {part.label}
        </Link>
      ))}
    </nav>
  );
}

export function Travel() {
  usePageTitle(pageById("travel").title);

  return (
    <div className="v1-travel">
      <header className="v1-travel__head">
        <h1 className="v1-heading">{travel.title}</h1>
        <TravelTabs current="travel" />
      </header>
      <div className="v1-travel__body">
        {travel.sections.map((section) => (
          <p key={section.lines[0]}>
            {section.label && <span className="v1-label">{section.label}: </span>}
            {section.lines.map((line, index) => (
              <span key={line} className={index === 0 ? undefined : "v1-travel__line"}>
                {line}
              </span>
            ))}
          </p>
        ))}
      </div>
    </div>
  );
}

export function Stay() {
  usePageTitle(pageById("stay").title);

  return (
    <div className="v1-travel v1-stay">
      <header className="v1-travel__head">
        <h1 className="v1-heading">{stay.title}</h1>
        <TravelTabs current="stay" />
      </header>
      <div className="v1-stay__body">
        <p className="v1-stay__intro">
          {stay.intro.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </p>
        <ul className="v1-hotels">
          {stay.hotels.map((hotel) => (
            <li key={hotel.id} className="v1-hotel">
              <h2 className="v1-hotel__name">
                {hotel.name.map((line) => (
                  <span key={line}>{line}</span>
                ))}
              </h2>
              <p className="v1-hotel__address">
                <a href={hotel.mapUrl} target="_blank" rel="noreferrer">
                  {hotel.address}
                </a>
              </p>
              <ul className="v1-hotel__notes">
                {hotel.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
              <BookButton hotel={hotel} className="v1-button" />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function ThingsToDo() {
  usePageTitle(pageById("things-to-do").title);

  return (
    <div className="v1-list-page">
      <h1 className="v1-heading">{thingsToDo.title}</h1>
      <img className="v1-list-page__art" src={art.lily} alt="" width={980} height={1026} />
      <div className="v1-list">
        {thingsToDo.activities.map((activity) => (
          <section key={activity.id} className="v1-list__item">
            <h2>{activity.title}</h2>
            <p>{activity.text}</p>
          </section>
        ))}
        <ul className="v1-food">
          {thingsToDo.food.map((group) => (
            <li key={group.id}>
              {group.label}: {group.places.join(", ")}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function Faq() {
  usePageTitle(pageById("faq").title);
  const [openId, setOpenId] = useState<string | null>(faq.items[0].id);

  return (
    <div className="v1-list-page v1-list-page--faq">
      <h1 className="v1-heading">{faq.title}</h1>
      <img className="v1-list-page__art" src={art.lily} alt="" width={980} height={1026} />
      <div className="v1-list v1-faq">
        {faq.items.map((item) => {
          const open = item.id === openId;
          return (
            <section key={item.id} className="v1-faq__item">
              <h2>
                <button
                  type="button"
                  id={`v1-q-${item.id}`}
                  aria-expanded={open}
                  aria-controls={`v1-a-${item.id}`}
                  onClick={() => setOpenId(open ? null : item.id)}
                >
                  <span>{item.question}</span>
                  <span className="v1-faq__mark" aria-hidden="true" />
                </button>
              </h2>
              <AnimatePresence initial={false}>
                {open && (
                  <motion.div
                    id={`v1-a-${item.id}`}
                    role="region"
                    aria-labelledby={`v1-q-${item.id}`}
                    className="v1-faq__answer"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <p>{item.answer}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </section>
          );
        })}
      </div>
    </div>
  );
}
