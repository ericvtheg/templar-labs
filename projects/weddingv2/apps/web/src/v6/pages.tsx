// v6: Emma's third Canva export, reproduced panel for panel.
//
// It uses the same building blocks and styles as v4 (see canva/parts.tsx and
// v4/v4.css), placed on the round-three sheet. v6.css adds what is new in this
// round: the serif names, the photo and the two-column travel text.

import "./v6.css";

import { type CSSProperties, useEffect } from "react";
import bouquet from "../assets/round-3/bouquet.webp";
import dayFriday from "../assets/round-3/day-friday.webp";
import daySaturday from "../assets/round-3/day-saturday.webp";
import faqFlowers from "../assets/round-3/faq-flowers.webp";
import letter from "../assets/round-3/letter.webp";
import lily from "../assets/round-3/lily.webp";
import tagline from "../assets/round-3/tagline.webp";
import { FaqAccordion } from "../canva/FaqAccordion.tsx";
import { Art, Lettering, Lines, Panel, Text } from "../canva/parts.tsx";
import { box } from "../canva/sheet.ts";
import { pageById } from "../content/pages.ts";
import { heroPhoto } from "../content/photos.ts";
import {
  couple,
  faq,
  guestEvents,
  home,
  schedule,
  stay,
  thingsToDo,
  travel,
} from "../content/site.ts";
import { BookButton, useCurrentPage } from "../shared/chrome.tsx";
import { usePageTitle } from "../shared/hooks.ts";
import { photoUrl } from "../shared/photoFiles.ts";
import { boxes, hotelCenters, thingsRules } from "./spec.ts";

/* ---------- Home ---------- */

function Photo() {
  const url = photoUrl(heroPhoto);
  return (
    <figure className="v6-photo" style={boxes.photo}>
      {url === null ? (
        <p className="v6-photo__empty">
          A photo of {couple.first} &amp; {couple.second} goes here
        </p>
      ) : (
        <img src={url} alt={heroPhoto.alt} style={{ objectPosition: heroPhoto.focal }} />
      )}
    </figure>
  );
}

function SchedulePanels({ headingAs }: { headingAs: "h1" | "h2" }) {
  const welcome = guestEvents.find((event) => event.id === "welcome-party");
  const wedding = guestEvents.find((event) => event.id === "wedding");
  if (!welcome || !wedding) {
    return null;
  }
  const [arrival] = wedding.notes;

  return (
    <>
      <Panel name="schedule" anchor="schedule">
        <Text block="sched.heading" as={headingAs} className="v4-heading">
          {schedule.title}
        </Text>
        <Lettering src={dayFriday} text={welcome.day} at={boxes.dayFriday} className="v4-day" />
        <Text block="welcome.name" as="h3" className="v4-serif" layout="center">
          {welcome.name}
        </Text>
        {welcome.details && (
          <Text block="welcome.details" className="v4-serif" layout="center">
            <Lines block="welcome.details" text={welcome.details} />
          </Text>
        )}
      </Panel>

      <Panel name="wedding">
        <Lettering src={daySaturday} text={wedding.day} at={boxes.daySaturday} className="v4-day" />
        <Text block="sched.name" as="h3" className="v4-serif" layout="center">
          {wedding.name}
        </Text>
        <Text block="sched.time" className="v4-serif" layout="center">
          {wedding.time}
        </Text>
        {arrival && (
          <Text block="sched.note" className="v4-serif" layout="center">
            {arrival}
          </Text>
        )}
        <Text block="sched.venue" className="v4-serif" layout="center">
          {wedding.venue.name}
        </Text>
        <Text block="sched.address" className="v4-serif" layout="center">
          <a href={wedding.venue.mapUrl} target="_blank" rel="noreferrer">
            {wedding.venue.address}
          </a>
        </Text>
        {wedding.venueNote && (
          <Text block="sched.parking" className="v4-serif" layout="center">
            {wedding.venueNote}
          </Text>
        )}
      </Panel>
    </>
  );
}

export function Home() {
  usePageTitle(pageById("home").title);
  const letterText = [home.letter.greeting, ...home.letter.paragraphs].join(" ");

  return (
    <div className="v4-page">
      <Panel name="home">
        <Text block="home.names" as="h1" className="v6-names">
          <span>{couple.first}</span> <span>&amp;</span> <span>{couple.second}</span>
        </Text>
        <Lettering src={tagline} text={home.tagline} at={boxes.tagline} className="v6-tagline" />
        <Text block="home.date" className="v4-display">
          {couple.date}
        </Text>
        <Art src={bouquet} at={boxes.bouquet} className="v4-art--top" />
      </Panel>

      <Panel name="letter">
        <Photo />
        <Lettering src={letter} text={letterText} at={boxes.letter} className="v6-letter" />
      </Panel>

      <SchedulePanels headingAs="h2" />
    </div>
  );
}

export function Schedule() {
  usePageTitle(pageById("schedule").title);

  return (
    <div className="v4-page">
      <SchedulePanels headingAs="h1" />
    </div>
  );
}

/* ---------- Travel ---------- */

// The Book a room buttons sit under each hotel, on the same line.
const bookTop = 522;

/**
 * The hotels. In Emma's file this panel comes before the flight text, but her new
 * wording says "the hotels below", so the site shows it after.
 */
function HotelsPanel({ headingAs }: { headingAs: "h1" | "h2" }) {
  return (
    <Panel name="stay" anchor="stay">
      <Text block="travel.heading" as={headingAs} className="v4-heading">
        {stay.title}
      </Text>
      <Text block="stay.intro" className="v4-body" layout="center">
        {stay.intro.map((line) => (
          <span key={line} className="v4-line">
            {line}{" "}
          </span>
        ))}
      </Text>
      {stay.hotels.map((hotel, index) => {
        const key = `stay.h${index + 1}`;
        return (
          <article key={hotel.id} className="v4-hotel">
            <Text block={`${key}.name`} as="h3" className="v4-serif" layout="center">
              {hotel.name.map((line) => (
                <span key={line} className="v4-line">
                  {line}{" "}
                </span>
              ))}
            </Text>
            <Text block={`${key}.address`} className="v4-serif" layout="center">
              <a href={hotel.mapUrl} target="_blank" rel="noreferrer">
                {hotel.address}
              </a>
            </Text>
            <Text block={`${key}.notes`} as="ul" className="v4-serif" layout="center">
              {hotel.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </Text>
            <div className="v4-book" style={box(hotelCenters[index] ?? 682, bookTop, 300)}>
              <BookButton hotel={hotel} className="v4-button" />
            </div>
          </article>
        );
      })}
    </Panel>
  );
}

// Emma's two columns: the block names for each section of the travel text.
const travelBlocks: Record<string, string> = { flight: "flight", "getting-around": "around" };

function FlightPanel({ headingAs }: { headingAs: "h1" | "h2" }) {
  return (
    <Panel name="travel">
      <Text block="travel.heading" as={headingAs} className="v4-heading">
        {travel.title}
      </Text>
      {travel.sections.map((section) => {
        const name = travelBlocks[section.id] ?? section.id;
        return (
          <section key={section.id} className="v6-travel">
            <Text block={`${name}.label`} as="h3" className="v4-serif v4-caps" layout="center">
              {section.label}
            </Text>
            {section.paragraphs.map((text, index) => {
              const block = `${name}.p${index + 1}`;
              return (
                <Text key={block} block={block} className="v4-serif" layout="center">
                  <Lines block={block} text={text} />
                </Text>
              );
            })}
          </section>
        );
      })}
    </Panel>
  );
}

export function Travel() {
  const { page } = useCurrentPage();
  usePageTitle(pageById(page === "stay" ? "stay" : "travel").title);

  // /stay is the hotels half of this page.
  useEffect(() => {
    if (page === "stay") {
      document.getElementById("stay")?.scrollIntoView({ block: "start" });
    }
  }, [page]);

  return (
    <div className="v4-page">
      <FlightPanel headingAs="h1" />
      <HotelsPanel headingAs="h2" />
    </div>
  );
}

/* ---------- Things to Do ---------- */

export function ThingsToDo() {
  usePageTitle(pageById("things-to-do").title);

  return (
    <div className="v4-page">
      <Panel name="things">
        <Text block="things.heading" as="h1" className="v4-heading">
          {thingsToDo.title}
        </Text>
        <Art src={lily} at={boxes.lily} className="v4-art--lily" />
        {thingsToDo.activities.map((activity, index) => {
          const key = `things.i${index + 1}`;
          const rule = thingsRules[index];
          return (
            <section key={activity.id} className="v4-item">
              <Text block={`${key}.title`} as="h2" className="v4-serif">
                {activity.title}
              </Text>
              <Text block={`${key}.text`} className="v4-serif" layout="wrap">
                <Lines block={`${key}.text`} text={activity.text} />
              </Text>
              {rule !== undefined && (
                <hr className="v4-rule" style={{ "--y": rule } as CSSProperties} />
              )}
            </section>
          );
        })}
        <Text block="things.food" as="ul" className="v4-serif v4-food">
          {thingsToDo.food.map((group) => (
            <li key={group.id}>
              {group.label}: {group.places.join(", ")}
            </li>
          ))}
        </Text>
      </Panel>
    </div>
  );
}

/* ---------- FAQ ---------- */

export function Faq() {
  usePageTitle(pageById("faq").title);

  return (
    <div className="v4-page">
      <Panel name="faq">
        <Text block="faq.heading" as="h1" className="v4-heading">
          <Lines block="faq.heading" text={faq.title} />
        </Text>
        <Art src={faqFlowers} at={boxes.faqFlowers} className="v4-art--lily" />
        <FaqAccordion
          items={faq.items}
          prefix="v4"
          paragraph={(itemId, index, text) => (
            <Lines block={`faq.a.${itemId}.${index}`} text={text} />
          )}
        />
      </Panel>
    </div>
  );
}
