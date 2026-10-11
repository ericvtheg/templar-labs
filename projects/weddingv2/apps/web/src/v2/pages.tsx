import { AnimatePresence, motion } from "motion/react";
import {
  type FocusEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
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
import { art, artFor } from "../shared/art.ts";
import { BookButton } from "../shared/chrome.tsx";
import { useMediaQuery, usePageTitle } from "../shared/hooks.ts";
import { Frame, Meadow, Squiggle, Stem, Vine } from "./parts.tsx";

const narrowQuery = "(max-width: 860px)";

function artUrl(id: string): string | undefined {
  const name = artFor[id];
  return name ? art[name] : undefined;
}

export function Home() {
  usePageTitle(pageById("home").title);
  const [second, third, fourth] = supportingPhotos;

  return (
    <div className="v2-page v2-home">
      <div className="v2-home__words">
        <p className="v2-home__tagline">{home.tagline}</p>
        <h1 className="v2-names">
          <span>
            {couple.first} <i>&amp;</i>
          </span>{" "}
          <span>{couple.second}</span>
        </h1>
        <p className="v2-date">{couple.date}</p>
        <p className="v2-letter">
          {home.letter.greeting}
          {home.letter.lines.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </p>
        <div className="v2-home__links">
          <Link className="v2-button" to={pagePath("v2", "schedule")}>
            {pageById("schedule").title}
          </Link>
          <Link className="v2-button v2-button--quiet" to={pagePath("v2", "travel")}>
            {pageById("travel").title}
          </Link>
        </div>
      </div>

      <div className="v2-collage">
        <img className="v2-collage__bouquet" src={art.bouquet} alt="" width={1228} height={1224} />
        <Stem name="stemCosmos" className="v2-collage__stem-a" delay={0.5} sway={2.4} />
        <Stem name="stemSprig" className="v2-collage__stem-b" delay={0.75} sway={3} />
        {fourth && <Frame slot={fourth} seed={41} className="v2-collage__d" tape="right" />}
        <Frame slot={heroPhoto} seed={7} className="v2-collage__hero" />
        {second && <Frame slot={second} seed={19} className="v2-collage__b" tape="right" />}
        {third && <Frame slot={third} seed={28} className="v2-collage__c" />}
      </div>
    </div>
  );
}

function Stop({ event }: { event: ScheduleEvent }) {
  const badge = artUrl(event.id);

  return (
    <section className="v2-stop" data-event={event.id}>
      <div className="v2-stop__badge">{badge && <img src={badge} alt="" />}</div>
      {event.lead && <p className="v2-stop__lead">{event.lead}</p>}
      <p className="v2-stop__day">{event.day}</p>
      <h2 className="v2-stop__name">{event.name}</h2>
      {event.time && <p className="v2-stop__time">{event.time}</p>}
      {event.notes.map((note) => (
        <p key={note} className="v2-stop__note">
          {note}
        </p>
      ))}
      {event.details && <p className="v2-stop__details">{event.details}</p>}
      {event.venueAnnounced && (
        <p className="v2-stop__venue">
          <span>{event.venue.name}</span>
          <a href={event.venue.mapUrl} target="_blank" rel="noreferrer">
            {event.venue.address}
          </a>
          {event.venueNote && <span className="v2-stop__note">{event.venueNote}</span>}
        </p>
      )}
      {event.moments && (
        <ol className="v2-moments" aria-label="Timeline">
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

export function Schedule() {
  usePageTitle(pageById("schedule").title);
  // The timeline runs in date order, so the Friday welcome party comes first.
  const stops = guestEvents.toReversed();

  return (
    <div className="v2-page v2-schedule">
      <h1 className="v2-heading">{schedule.title}</h1>
      <div className="v2-timeline">
        <Vine />
        {stops.map((event) => (
          <Stop key={event.id} event={event} />
        ))}
      </div>
      <Meadow
        stems={[
          { name: "growGrass", side: "left", offset: 6, height: 190 },
          { name: "growCosmos", side: "left", offset: 96, height: 150 },
          { name: "growSunflower", side: "right", offset: 14, height: 180 },
        ]}
      />
    </div>
  );
}

function TravelToggle({ current }: { current: "travel" | "stay" }) {
  return (
    <nav className="v2-toggle" aria-label="Travel">
      {travelParts.map((part) => (
        <Link
          key={part.id}
          className="v2-toggle__link"
          to={pagePath("v2", part.id)}
          aria-current={part.id === current ? "page" : undefined}
        >
          {part.label}
        </Link>
      ))}
    </nav>
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

export function Travel() {
  usePageTitle(pageById("travel").title);

  return (
    <div className="v2-page v2-travel">
      <header className="v2-page__head">
        <h1 className="v2-heading">{travel.title}</h1>
        <TravelToggle current="travel" />
      </header>
      <div className="v2-travel__grid">
        {travelGroups().map((group, index) => (
          <section key={group.label} className="v2-travel__group">
            <img className="v2-travel__art" src={travelArt[index]} alt="" />
            <h2 className="v2-kicker">
              {group.label}
              <Squiggle />
            </h2>
            {group.paragraphs.map((lines) => (
              <p key={lines[0]}>{lines.join(" ")}</p>
            ))}
          </section>
        ))}
      </div>
      <Meadow
        stems={[
          { name: "growBuds", side: "left", offset: 8, height: 230 },
          { name: "growCosmos", side: "left", offset: 104, height: 200 },
          { name: "growGrass", side: "left", offset: 206, height: 170 },
          { name: "growRoses", side: "left", offset: 312, height: 150 },
        ]}
      />
    </div>
  );
}

function HotelCarousel() {
  const trackRef = useRef<HTMLDivElement>(null);
  const narrow = useMediaQuery(narrowQuery);
  const [active, setActive] = useState(0);
  const count = stay.hotels.length;

  const go = useCallback((index: number, smooth = true) => {
    const track = trackRef.current;
    const slide = track?.children[index];
    if (!track || !(slide instanceof HTMLElement)) {
      return;
    }
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    track.scrollTo({
      left: slide.offsetLeft - (track.clientWidth - slide.offsetWidth) / 2,
      behavior: smooth && !reduced ? "smooth" : "auto",
    });
  }, []);

  // On a wide screen the middle hotel starts in front, so all three are in view.
  useEffect(() => {
    go(narrow ? 0 : Math.floor(count / 2), false);
  }, [narrow, count, go]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) {
      return;
    }
    const update = () => {
      const center = track.scrollLeft + track.clientWidth / 2;
      let nearest = 0;
      let distance = Number.POSITIVE_INFINITY;
      Array.from(track.children).forEach((child, index) => {
        if (!(child instanceof HTMLElement)) {
          return;
        }
        const gap = Math.abs(child.offsetLeft + child.offsetWidth / 2 - center);
        if (gap < distance) {
          distance = gap;
          nearest = index;
        }
      });
      setActive(nearest);
    };
    update();
    track.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      track.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowRight") {
      go(Math.min(active + 1, count - 1));
    } else if (event.key === "ArrowLeft") {
      go(Math.max(active - 1, 0));
    } else {
      return;
    }
    event.preventDefault();
  };

  // Tabbing into a hotel that is off to the side brings it to the front.
  const onFocus = (event: FocusEvent<HTMLDivElement>) => {
    const slide = event.target.closest(".v2-hotel");
    const index = slide ? Array.from(event.currentTarget.children).indexOf(slide) : -1;
    if (index >= 0 && index !== active) {
      go(index);
    }
  };

  return (
    <section className="v2-carousel" aria-roledescription="carousel" aria-label="Hotels">
      {/* biome-ignore lint/a11y/noStaticElementInteractions: arrow keys move the focused carousel */}
      <div
        ref={trackRef}
        className="v2-carousel__track"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region must be focusable
        tabIndex={0}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
      >
        {stay.hotels.map((hotel, index) => (
          <article
            key={hotel.id}
            className="v2-hotel"
            data-active={index === active}
            aria-roledescription="slide"
            aria-label={`${index + 1} of ${count}: ${hotel.name.join(" ")}`}
          >
            <img className="v2-hotel__art" src={artUrl(hotel.id)} alt="" />
            <h2 className="v2-hotel__name">
              {hotel.name.map((line) => (
                <span key={line}>{line}</span>
              ))}
            </h2>
            <a className="v2-hotel__address" href={hotel.mapUrl} target="_blank" rel="noreferrer">
              {hotel.address}
            </a>
            <ul className="v2-hotel__notes">
              {hotel.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
            <BookButton hotel={hotel} className="v2-button" />
          </article>
        ))}
      </div>

      <div className="v2-carousel__controls">
        <button
          type="button"
          className="v2-arrow"
          aria-label="Previous hotel"
          disabled={active === 0}
          onClick={() => go(active - 1)}
        >
          <Arrow />
        </button>
        <p className="v2-carousel__count" aria-live="polite">
          {active + 1} <span>of</span> {count}
        </p>
        <button
          type="button"
          className="v2-arrow v2-arrow--next"
          aria-label="Next hotel"
          disabled={active === count - 1}
          onClick={() => go(active + 1)}
        >
          <Arrow />
        </button>
      </div>
    </section>
  );
}

function Arrow() {
  return (
    <svg viewBox="0 0 44 20" aria-hidden="true" focusable="false">
      <path d="M41 10 C 30 8.5, 16 11.5, 4 10 M12 3 C 9 6, 6.5 8.5, 3.5 10 C 6.5 11.5, 9.5 14, 12.5 17" />
    </svg>
  );
}

export function Stay() {
  usePageTitle(pageById("stay").title);

  return (
    <div className="v2-page v2-stay">
      <header className="v2-page__head">
        <h1 className="v2-heading">{stay.title}</h1>
        <TravelToggle current="stay" />
      </header>
      <p className="v2-stay__intro">
        {stay.intro.map((line) => (
          <span key={line}>{line}</span>
        ))}
      </p>
      <HotelCarousel />
    </div>
  );
}

export function ThingsToDo() {
  usePageTitle(pageById("things-to-do").title);

  return (
    <div className="v2-page v2-things">
      <h1 className="v2-heading">{thingsToDo.title}</h1>
      <div className="v2-things__grid">
        <ul className="v2-cards">
          {thingsToDo.activities.map((activity) => (
            <li key={activity.id} className="v2-card">
              <img src={artUrl(activity.id)} alt="" />
              <h2>{activity.title}</h2>
              <p>{activity.text}</p>
            </li>
          ))}
        </ul>
        <aside className="v2-eats">
          <img src={art.plate} alt="" />
          {thingsToDo.food.map((group) => (
            <section key={group.id}>
              <h2>{group.label}</h2>
              <p>
                {group.places.map((place) => (
                  <span key={place}>{place}</span>
                ))}
              </p>
            </section>
          ))}
        </aside>
      </div>
    </div>
  );
}

export function Faq() {
  usePageTitle(pageById("faq").title);
  const narrow = useMediaQuery(narrowQuery);
  const [activeId, setActiveId] = useState<string | null>(faq.items[0].id);
  const active = faq.items.find((item) => item.id === activeId) ?? faq.items[0];

  return (
    <div className="v2-page v2-faq">
      <div className="v2-faq__questions">
        <h1 className="v2-heading">{faq.title}</h1>
        <ul>
          {faq.items.map((item) => {
            const open = item.id === activeId;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  aria-expanded={narrow ? open : undefined}
                  aria-pressed={narrow ? undefined : open}
                  onClick={() => setActiveId(narrow && open ? null : item.id)}
                >
                  {item.question}
                </button>
                <AnimatePresence initial={false}>
                  {narrow && open && (
                    <motion.div
                      className="v2-faq__inline"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                    >
                      <p>{item.answer}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </li>
            );
          })}
        </ul>
      </div>

      {!narrow && (
        <div className="v2-faq__answer" aria-live="polite">
          <AnimatePresence mode="wait" initial={false}>
            <motion.article
              key={active.id}
              className="v2-note"
              initial={{ opacity: 0, y: 16, rotate: 3 }}
              animate={{ opacity: 1, y: 0, rotate: 1.2 }}
              exit={{ opacity: 0, y: -10, rotate: -1, transition: { duration: 0.16 } }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            >
              <img className="v2-note__art" src={artUrl(active.id)} alt="" />
              <h2>{active.question}</h2>
              <p>{active.answer}</p>
            </motion.article>
          </AnimatePresence>
        </div>
      )}

      <Meadow
        stems={[
          { name: "growLily", side: "right", offset: 10, height: 190 },
          { name: "growRoses", side: "right", offset: 130, height: 140 },
        ]}
      />
    </div>
  );
}
