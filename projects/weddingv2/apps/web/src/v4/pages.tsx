// v4 and v5: Emma's Canva, reproduced panel for panel.
//
// Each <Panel> is one of her 1366 x 768 Canva pages. Text and art sit at the
// positions measured from her screenshots (see spec.ts), and the panels stack so
// the page scrolls the way her design does. On a phone the same content reflows.

import { AnimatePresence, motion } from "motion/react";
import { type CSSProperties, type ElementType, type ReactNode, useEffect, useState } from "react";
import dayFriday from "../assets/lettering/day-friday.webp";
import daySaturday from "../assets/lettering/day-saturday.webp";
import inTown from "../assets/lettering/in-town.webp";
import letter from "../assets/lettering/letter.webp";
import letterNarrow from "../assets/lettering/letter-narrow.webp";
import tagline from "../assets/lettering/tagline.webp";
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
import { art } from "../shared/art.ts";
import { BookButton, useCurrentPage } from "../shared/chrome.tsx";
import { usePageTitle } from "../shared/hooks.ts";
import { artBoxes, box, linesFor, panel, place, thingsRules } from "./spec.ts";
import { useVariant } from "./V4Layout.tsx";

/* ---------- Building blocks ---------- */

type PanelProps = { name: string; height?: number; anchor?: string; children: ReactNode };

/** One Canva page. */
function Panel({ name, height = panel.height, anchor, children }: PanelProps) {
  return (
    <section
      className="v4-panel"
      id={anchor}
      data-panel={name}
      style={{ "--h": height } as CSSProperties}
    >
      {children}
    </section>
  );
}

type TextProps = {
  /** Key into spec.json. */
  block: string;
  as?: ElementType;
  className: string;
  /** Centered text is placed by its center line. Wrapped text keeps a box width. */
  layout?: "left" | "center" | "wrap";
  children: ReactNode;
};

/** A piece of live text at its Canva position. */
function Text({ block, as: Tag = "p", className, layout = "left", children }: TextProps) {
  return (
    <Tag
      className={`v4-text ${className}`}
      data-block={block}
      data-layout={layout}
      style={place(block)}
    >
      {children}
    </Tag>
  );
}

/**
 * Text broken into Emma's own lines. On a phone the lines run together and reflow.
 * A label, such as "Flight:", opens the first line in capitals.
 */
function Lines({ block, text, label }: { block: string; text: string; label?: string | null }) {
  return (
    <>
      {linesFor(block, text).map((line, index) => (
        <span key={line} className="v4-line">
          {index === 0 && label && <span className="v4-caps">{label}: </span>}
          {line}{" "}
        </span>
      ))}
    </>
  );
}

type LetteringProps = {
  src: string;
  /** The same words set on shorter lines, for a phone. */
  narrowSrc?: string;
  text: string;
  at: CSSProperties;
  as?: ElementType;
  className?: string;
};

/**
 * One of Emma's handwritten phrases, shown as her own lettering. Her handwriting
 * font is not available as a web font. The words stay in the page for screen readers.
 */
function Lettering({ src, narrowSrc, text, at, as: Tag = "p", className }: LetteringProps) {
  return (
    <Tag
      className={className ? `v4-lettering ${className}` : "v4-lettering"}
      data-narrow={narrowSrc ? "true" : undefined}
      style={at}
    >
      <img className="v4-lettering__wide" src={src} alt="" />
      {narrowSrc && <img className="v4-lettering__narrow" src={narrowSrc} alt="" />}
      <span className="sr-only">{text}</span>
    </Tag>
  );
}

function Art({ src, at, className }: { src: string; at: CSSProperties; className?: string }) {
  return (
    <img className={className ? `v4-art ${className}` : "v4-art"} src={src} alt="" style={at} />
  );
}

/* ---------- Home ---------- */

// With a photo, the tagline panel ends just under "Meet us in Kansas?" and the
// photo follows it. Without one, the panel is Emma's full page.
const taglinePanelHeight = { withPhoto: 476, plain: panel.height };

/** The one photo on the homepage. Any shape of picture works: it is never cropped. */
function OnePhoto() {
  const slot = heroPhoto;
  return (
    <section className="v4-photo-panel">
      <div className="v4-photo">
        {slot.src === null ? (
          <p className="v4-photo__empty">
            A photo of {couple.first} &amp; {couple.second} goes here
          </p>
        ) : (
          <img src={slot.src} alt={slot.alt} />
        )}
      </div>
    </section>
  );
}

function SchedulePanels({ headingAs }: { headingAs: "h1" | "h2" }) {
  const [wedding, welcome] = guestEvents;
  if (!wedding || !welcome) {
    return null;
  }
  const [arrival] = wedding.notes;

  return (
    <>
      <Panel name="schedule" anchor="schedule">
        <Text block="sched.heading" as={headingAs} className="v4-heading">
          {schedule.title}
        </Text>
        <Lettering
          src={daySaturday}
          text={wedding.day}
          at={box(516.75, 176, 333.25)}
          className="v4-day"
        />
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

      <Panel name="welcome">
        {welcome.lead && (
          <Lettering
            src={inTown}
            text={welcome.lead}
            at={box(120, 45.25, 408.75)}
            as="h2"
            className="v4-lead"
          />
        )}
        <Lettering
          src={dayFriday}
          text={welcome.day}
          at={box(531.5, 195, 301.5)}
          className="v4-day"
        />
        <Text block="welcome.name" as="h3" className="v4-serif" layout="center">
          {welcome.name}
        </Text>
        {welcome.details && (
          <Text block="welcome.details" className="v4-serif" layout="center">
            <Lines block="welcome.details" text={welcome.details} />
          </Text>
        )}
      </Panel>
    </>
  );
}

export function Home() {
  usePageTitle(pageById("home").title);
  const { photo } = useVariant();
  const letterText = [home.letter.greeting, ...home.letter.lines].join(" ");

  return (
    <div className="v4-page">
      <Panel name="home">
        <Text block="home.names" as="h1" className="v4-names">
          <span>{couple.first}</span> <span>&amp;</span> <span>{couple.second}</span>
        </Text>
        <Text block="home.date" className="v4-display">
          {couple.date}
        </Text>
        <Art src={art.bouquet} at={artBoxes.bouquetTop} className="v4-art--top" />
      </Panel>

      <Panel
        name="tagline"
        height={photo ? taglinePanelHeight.withPhoto : taglinePanelHeight.plain}
      >
        <Lettering
          src={tagline}
          text={home.tagline}
          at={box(324.25, 333.25, 706.75)}
          className="v4-tagline"
        />
      </Panel>
      {photo && <OnePhoto />}

      <Panel name="letter">
        <Art src={art.bouquet} at={artBoxes.bouquetLetter} className="v4-art--letter" />
        <Lettering
          src={letter}
          narrowSrc={letterNarrow}
          text={letterText}
          at={box(658.25, 264.25, 623.25)}
          className="v4-letter"
        />
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
      <Panel name="travel">
        <Text block="travel.heading" as="h1" className="v4-heading">
          {travel.title}
        </Text>
        {travel.sections.map((section, index) => {
          const id = `travel.p${index + 1}`;
          return (
            <Text key={id} block={id} className="v4-body" layout="center">
              <Lines block={id} text={section.lines.join(" ")} label={section.label} />
            </Text>
          );
        })}
      </Panel>

      <Panel name="stay" anchor="stay">
        <Text block="travel.heading" as="h2" className="v4-heading">
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
              <div className="v4-book" style={box([256, 682, 1100][index] ?? 682, bookTop, 300)}>
                <BookButton hotel={hotel} className="v4-button" />
              </div>
            </article>
          );
        })}
      </Panel>
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
        <Art src={art.lily} at={artBoxes.lily} className="v4-art--lily" />
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
  const [openId, setOpenId] = useState<string | null>(faq.items[0].id);

  return (
    <div className="v4-page">
      <Panel name="faq">
        <Text block="faq.heading" as="h1" className="v4-heading">
          <Lines block="faq.heading" text={faq.title} />
        </Text>
        <Art src={art.lily} at={artBoxes.lily} className="v4-art--lily" />

        <div className="v4-faq">
          {faq.items.map((item) => {
            const open = item.id === openId;
            return (
              <section key={item.id} className="v4-faq__item">
                <h2>
                  <button
                    type="button"
                    id={`v4-q-${item.id}`}
                    aria-expanded={open}
                    aria-controls={`v4-a-${item.id}`}
                    onClick={() => setOpenId(open ? null : item.id)}
                  >
                    <span className="v4-faq__flower" aria-hidden="true" />
                    <span>{item.question}</span>
                    <span className="v4-faq__mark" aria-hidden="true" />
                  </button>
                </h2>
                <AnimatePresence initial={false}>
                  {open && (
                    <motion.div
                      id={`v4-a-${item.id}`}
                      role="region"
                      aria-labelledby={`v4-q-${item.id}`}
                      className="v4-faq__answer"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                    >
                      <p>
                        <Lines block={`faq.a.${item.id}`} text={item.answer} />
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </section>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}
