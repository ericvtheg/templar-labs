// v7: Recommended. Emma's round-three design, with type sizes and spacing tuned
// for computers and phones.
//
// v6 pins every word to its place on her Canva pages. This version keeps her
// fonts, colors, art and structure, but lays the pages out responsively:
//   - one small type scale, and nothing below a comfortable reading size
//   - Flight and Getting around as two matching columns
//   - less empty space between sections, so there is less scrolling
// The styles are in v7.css.

import "./v7.css";

import { useEffect, useRef } from "react";
import bouquet from "../assets/round-3/bouquet.webp";
import dayFriday from "../assets/round-3/day-friday.webp";
import daySaturday from "../assets/round-3/day-saturday.webp";
import faqFlowers from "../assets/round-3/faq-flowers.webp";
import letter from "../assets/round-3/letter.webp";
import lily from "../assets/round-3/lily.webp";
import tagline from "../assets/round-3/tagline.webp";
import { FaqAccordion } from "../canva/FaqAccordion.tsx";
import { pageById } from "../content/pages.ts";
import { heroPhoto } from "../content/photos.ts";
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
import { BookButton, useCurrentPage } from "../shared/chrome.tsx";
import { usePageTitle } from "../shared/hooks.ts";
import { photoUrl } from "../shared/photoFiles.ts";

/** Emma's handwritten day lines, by event. */
const dayLettering: Record<string, string> = {
  "welcome-party": dayFriday,
  wedding: daySaturday,
};

/** One of Emma's handwritten phrases. The words stay in the page for screen readers. */
function Handwriting({ src, text, className }: { src: string; text: string; className: string }) {
  return (
    <p className={className}>
      <img src={src} alt="" />
      <span className="sr-only">{text}</span>
    </p>
  );
}

/* ---------- Home ---------- */

function Event({ event }: { event: ScheduleEvent }) {
  const day = dayLettering[event.id];

  return (
    <article className="v7-event">
      {day ? (
        <Handwriting src={day} text={event.day} className="v7-day" />
      ) : (
        <p className="v7-event__line">{event.day}</p>
      )}
      <h3 className="v7-event__line">{event.name}</h3>
      {event.time && <p className="v7-event__line">{event.time}</p>}
      {event.notes.map((note) => (
        <p key={note} className="v7-event__note">
          {note}
        </p>
      ))}
      {event.details && <p className="v7-event__details">{event.details}</p>}
      {event.venueAnnounced && (
        <p className="v7-event__venue">
          <span className="v7-event__line">{event.venue.name}</span>
          <a className="v7-event__line" href={event.venue.mapUrl} target="_blank" rel="noreferrer">
            {event.venue.address}
          </a>
          {event.venueNote && <span className="v7-event__note">{event.venueNote}</span>}
        </p>
      )}
    </article>
  );
}

function ScheduleSection({ headingAs: Heading }: { headingAs: "h1" | "h2" }) {
  return (
    <section className="v7-section">
      <Heading className="v7-heading">{schedule.title}</Heading>
      <div className="v7-events">
        {guestEvents.map((event) => (
          <Event key={event.id} event={event} />
        ))}
      </div>
    </section>
  );
}

export function Home() {
  usePageTitle(pageById("home").title);
  const letterText = [home.letter.greeting, ...home.letter.paragraphs].join(" ");
  const photo = photoUrl(heroPhoto);

  return (
    <div className="v7-page">
      <section className="v7-hero">
        <div className="v7-hero__text">
          <h1 className="v7-names">
            <span>{couple.first}</span> <span>&amp;</span> <span>{couple.second}</span>
          </h1>
          <div>
            <Handwriting src={tagline} text={home.tagline} className="v7-tagline" />
            <p className="v7-date">{couple.date}</p>
          </div>
        </div>
        <img className="v7-hero__art" src={bouquet} alt="" />
      </section>

      <section className="v7-letter">
        <figure className="v7-photo">
          {photo === null ? (
            <p className="v7-photo__empty">
              A photo of {couple.first} &amp; {couple.second} goes here
            </p>
          ) : (
            <img src={photo} alt={heroPhoto.alt} style={{ objectPosition: heroPhoto.focal }} />
          )}
        </figure>
        <Handwriting src={letter} text={letterText} className="v7-letter__text" />
      </section>

      <ScheduleSection headingAs="h2" />
    </div>
  );
}

export function Schedule() {
  usePageTitle(pageById("schedule").title);

  return (
    <div className="v7-page">
      <ScheduleSection headingAs="h1" />
    </div>
  );
}

/* ---------- Travel ---------- */

export function Travel() {
  const { page } = useCurrentPage();
  const stayRef = useRef<HTMLElement>(null);
  usePageTitle(pageById(page === "stay" ? "stay" : "travel").title);

  // /stay is the hotels half of this page.
  useEffect(() => {
    if (page === "stay") {
      stayRef.current?.scrollIntoView({ block: "start" });
    }
  }, [page]);

  return (
    <div className="v7-page">
      <section className="v7-section">
        <h1 className="v7-heading">{travel.title}</h1>
        <div className="v7-columns">
          {travel.sections.map((section) => (
            <section key={section.id} className="v7-column">
              <h2 className="v7-label">{section.label}</h2>
              {section.paragraphs.map((text) => (
                <p key={text}>{text}</p>
              ))}
            </section>
          ))}
        </div>
      </section>

      <section ref={stayRef} className="v7-section v7-stay">
        <p className="v7-stay__intro">
          {stay.intro.map((line) => (
            <span key={line}>{line} </span>
          ))}
        </p>
        <ul className="v7-hotels">
          {stay.hotels.map((hotel) => (
            <li key={hotel.id} className="v7-hotel">
              <h2>
                {hotel.name.map((line) => (
                  <span key={line}>{line} </span>
                ))}
              </h2>
              <a className="v7-hotel__address" href={hotel.mapUrl} target="_blank" rel="noreferrer">
                {hotel.address}
              </a>
              <ul>
                {hotel.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
              <div className="v7-hotel__book">
                <BookButton hotel={hotel} className="v7-button" />
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/* ---------- FAQ ---------- */

export function Faq() {
  usePageTitle(pageById("faq").title);

  return (
    <div className="v7-page">
      <section className="v7-section v7-split">
        <h1 className="v7-heading">{faq.title}</h1>
        <img className="v7-split__art" src={faqFlowers} alt="" />
        <div className="v7-split__list">
          <FaqAccordion items={faq.items} prefix="v7" />
        </div>
      </section>
    </div>
  );
}

/* ---------- Things to Do ---------- */

export function ThingsToDo() {
  usePageTitle(pageById("things-to-do").title);

  return (
    <div className="v7-page">
      <section className="v7-section v7-split">
        <h1 className="v7-heading">{thingsToDo.title}</h1>
        <img className="v7-split__art" src={lily} alt="" />
        <div className="v7-split__list">
          {thingsToDo.activities.map((activity) => (
            <section key={activity.id} className="v7-thing">
              <h2>{activity.title}</h2>
              <p>{activity.text}</p>
            </section>
          ))}
          <ul className="v7-food">
            {thingsToDo.food.map((group) => (
              <li key={group.id}>
                {group.label}: {group.places.join(", ")}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
