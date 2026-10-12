import "./v3.css";

import { AnimatePresence, motion } from "motion/react";
import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link, useNavigate } from "react-router";
import { pageById, pagePath } from "../content/pages.ts";
import { allPhotos, type PhotoSlot } from "../content/photos.ts";
import { couple, faq, home, schedule, thingsToDo, travel } from "../content/site-round-2.ts";
import { type ArtName, art } from "../shared/art.ts";
import { useCurrentPage, VersionSwitcher } from "../shared/chrome.tsx";
import { useEscape, useMediaQuery, usePageTitle, useViewport } from "../shared/hooks.ts";
import { Photo } from "../shared/Photo.tsx";
import { seeded } from "../shared/random.ts";
import {
  boxStyle,
  cardSpots,
  envelopeSpot,
  invitationSpot,
  panel,
  polaroidSpots,
  pressedFlowers,
  type SectionId,
  type Spot,
  sectionOrder,
  sheet,
  unitFor,
} from "./layout.ts";
import { sheets } from "./sheets.tsx";

/** closed: the sealed envelope. opening: the cards fly out. open: everything is on the table. */
type Phase = "closed" | "opening" | "open";

const openedKey = "weddingv2:envelope-opened";
const narrowQuery = "(max-width: 860px)";
const ease = [0.22, 1, 0.36, 1] as const;

const covers: Record<SectionId, { art: ArtName; title: string; line: string }> = {
  schedule: { art: "arch", title: schedule.title, line: schedule.events[0].day },
  travel: { art: "airplane", title: travel.title, line: "Getting here" },
  stay: { art: "key", title: pageById("stay").label, line: "Three hotel options" },
  "things-to-do": { art: "boot", title: thingsToDo.title, line: couple.place },
  faq: { art: "bowtie", title: faq.shortTitle, line: "" },
};

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function readOpened(): boolean {
  try {
    return window.sessionStorage.getItem(openedKey) === "1";
  } catch {
    return false;
  }
}

function writeOpened(opened: boolean): void {
  try {
    if (opened) {
      window.sessionStorage.setItem(openedKey, "1");
    } else {
      window.sessionStorage.removeItem(openedKey);
    }
  } catch {
    // Storage can be unavailable (private mode). The envelope then opens on every visit.
  }
}

/* ---------- The envelope ---------- */

type EnvelopeProps = { phase: Phase; onOpen: () => void; onReset: () => void };

function Envelope({ phase, onOpen, onReset }: EnvelopeProps) {
  return (
    <div className="v3-envelope" data-phase={phase}>
      <div className="v3-envelope__inside" style={{ backgroundImage: `url(${art.bouquet})` }} />
      <svg
        className="v3-envelope__pocket"
        viewBox="0 0 520 340"
        preserveAspectRatio="none"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M0 0 L260 200 L520 0 V335 Q520 340 515 340 H5 Q0 340 0 335 Z" />
        <path d="M2 338 L224 172 M518 338 L296 172" />
      </svg>
      <div className="v3-envelope__flap" />
      {phase === "closed" ? (
        <button type="button" className="v3-seal" onClick={onOpen}>
          <span aria-hidden="true">
            {couple.first.charAt(0)}
            <i>&amp;</i>
            {couple.second.charAt(0)}
          </span>
          <span className="sr-only">Open the invitation</span>
        </button>
      ) : (
        <button type="button" className="v3-envelope__reset" onClick={onReset}>
          <span className="sr-only">Put the cards back in the envelope</span>
        </button>
      )}
    </div>
  );
}

/* ---------- Things on the table ---------- */

function Invitation() {
  return (
    <div className="v3-invite">
      <img className="v3-invite__bouquet" src={art.bouquet} alt="" width={1500} height={1499} />
      <p className="v3-invite__tagline">{home.tagline}</p>
      <h1 className="v3-invite__names">
        {couple.first} <i>&amp;</i> {couple.second}
      </h1>
      <p className="v3-invite__date">{couple.date}</p>
      <p className="v3-invite__letter">
        {home.letter.greeting}
        {home.letter.lines.map((line) => (
          <span key={line}>{line}</span>
        ))}
      </p>
    </div>
  );
}

function Polaroid({ slot }: { slot: PhotoSlot }) {
  return (
    <figure className="v3-polaroid">
      <Photo slot={slot} className="v3-polaroid__photo" eager />
      <figcaption>{slot.caption}</figcaption>
    </figure>
  );
}

function CardCover({ id, lifted }: { id: SectionId; lifted: boolean }) {
  const cover = covers[id];

  return (
    <Link
      to={pagePath("v3", id)}
      className="v3-card"
      data-card={id}
      data-lifted={lifted}
      aria-label={`Open ${pageById(id).title}`}
    >
      <img src={art[cover.art]} alt="" />
      <span className="v3-card__title">{cover.title}</span>
      {cover.line && <span className="v3-card__line">{cover.line}</span>}
    </Link>
  );
}

/* ---------- Dappled light ---------- */

function Shade({ seed, className }: { seed: number; className: string }) {
  const leaves = useMemo(() => {
    const random = seeded(seed);
    const clusters = Array.from({ length: 9 }, () => ({ x: random() * 1000, y: random() * 700 }));
    return clusters.flatMap((cluster, clusterIndex) =>
      Array.from({ length: 7 }, (_, leafIndex) => ({
        key: `${clusterIndex}-${leafIndex}`,
        cx: cluster.x + (random() - 0.5) * 230,
        cy: cluster.y + (random() - 0.5) * 190,
        rx: 28 + random() * 44,
        ry: 11 + random() * 17,
        angle: random() * 180,
        opacity: 0.35 + random() * 0.55,
      })),
    );
  }, [seed]);

  return (
    <svg
      className={className}
      viewBox="0 0 1000 700"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      {leaves.map((leaf) => (
        <ellipse
          key={leaf.key}
          cx={leaf.cx}
          cy={leaf.cy}
          rx={leaf.rx}
          ry={leaf.ry}
          opacity={leaf.opacity}
          transform={`rotate(${leaf.angle} ${leaf.cx} ${leaf.cy})`}
        />
      ))}
    </svg>
  );
}

function Light() {
  return (
    <div className="v3-light" aria-hidden="true">
      <Shade seed={11} className="v3-light__shade v3-light__shade--a" />
      <Shade seed={47} className="v3-light__shade v3-light__shade--b" />
    </div>
  );
}

/* ---------- Desktop: the table ---------- */

type ItemProps = {
  spot: Spot;
  unit: number;
  phase: Phase;
  /** Position in the queue of things leaving the envelope. */
  order: number;
  className?: string;
  children: ReactNode;
};

/** One thing on the table. It starts inside the envelope and flies to its spot. */
function Item({ spot, unit, phase, order, className, children }: ItemProps) {
  const target =
    phase === "closed"
      ? {
          x: (panel.width / 2 - spot.w / 2) * unit,
          y: (panel.height / 2 - spot.h / 2) * unit,
          rotate: 0,
          scale: 0.3,
          opacity: 0,
        }
      : { x: spot.x * unit, y: spot.y * unit, rotate: spot.r, scale: 1, opacity: 1 };

  const delay = 0.62 + order * 0.065;
  const transition =
    phase === "opening"
      ? {
          delay,
          type: "spring" as const,
          stiffness: 105,
          damping: 16,
          opacity: { delay, duration: 0.2 },
        }
      : { duration: phase === "closed" ? 0.45 : 0.3, ease };

  return (
    <motion.div
      className={className ? `v3-item ${className}` : "v3-item"}
      style={boxStyle(spot, unit)}
      initial={false}
      animate={target}
      transition={transition}
    >
      {children}
    </motion.div>
  );
}

type SceneProps = {
  unit: number;
  phase: Phase;
  active: SectionId | null;
  onOpen: () => void;
  onReset: () => void;
};

function Table({ unit, phase, active, onOpen, onReset }: SceneProps) {
  const opened = phase !== "closed";
  const envelope = opened ? envelopeSpot.resting : envelopeSpot.closed;
  // The order things leave the envelope: flowers, photos, the invitation, then the cards.
  const photoOrder = pressedFlowers.length;
  const inviteOrder = photoOrder + polaroidSpots.length;
  const cardOrder = inviteOrder + 1;

  return (
    <div
      className="v3-panel"
      style={{ width: panel.width * unit, height: panel.height * unit }}
      data-phase={phase}
    >
      <div className="v3-welcome" aria-hidden={opened}>
        <p className="v3-welcome__names">
          {couple.first} <i>&amp;</i> {couple.second}
        </p>
        <p className="v3-welcome__hint">Break the seal to open</p>
      </div>

      <motion.div
        className="v3-item"
        style={boxStyle(envelope, unit)}
        initial={false}
        animate={{
          x: envelope.x * unit,
          y: envelope.y * unit,
          rotate: envelope.r,
          scale: opened ? 0.84 : 1,
        }}
        transition={
          phase === "opening" ? { delay: 0.5, duration: 1.05, ease } : { duration: 0.6, ease }
        }
      >
        <Envelope phase={phase} onOpen={onOpen} onReset={onReset} />
      </motion.div>

      <div className="v3-items" inert={!opened}>
        {pressedFlowers.map((flower, index) => (
          <Item
            key={flower.art}
            spot={flower}
            unit={unit}
            phase={phase}
            order={index}
            className="v3-pressed"
          >
            <img src={art[flower.art]} alt="" />
          </Item>
        ))}

        {allPhotos.map((slot, index) => {
          const spot = polaroidSpots[index];
          if (!spot) {
            return null;
          }
          return (
            <Item key={slot.id} spot={spot} unit={unit} phase={phase} order={photoOrder + index}>
              <Polaroid slot={slot} />
            </Item>
          );
        })}

        <Item spot={invitationSpot} unit={unit} phase={phase} order={inviteOrder}>
          <Invitation />
        </Item>

        {sectionOrder.map((id, index) => (
          <Item key={id} spot={cardSpots[id]} unit={unit} phase={phase} order={cardOrder + index}>
            <CardCover id={id} lifted={active === id} />
          </Item>
        ))}
      </div>
    </div>
  );
}

/* ---------- Phone: a swipeable deck ---------- */

function Deck({ phase, active, onOpen, onReset }: SceneProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState(0);
  const slideCount = 2 + sectionOrder.length;

  useEffect(() => {
    const track = trackRef.current;
    if (!track || phase === "closed") {
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
      setCurrent(nearest);
    };
    update();
    track.addEventListener("scroll", update, { passive: true });
    return () => track.removeEventListener("scroll", update);
  }, [phase]);

  if (phase === "closed") {
    return (
      <div className="v3-deck-intro">
        <p className="v3-welcome__names">
          {couple.first} <i>&amp;</i> {couple.second}
        </p>
        <div className="v3-deck-intro__envelope">
          <Envelope phase={phase} onOpen={onOpen} onReset={onReset} />
        </div>
        <p className="v3-welcome__hint">Break the seal to open</p>
      </div>
    );
  }

  return (
    <div className="v3-deck" data-phase={phase}>
      {/* biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region must be focusable */}
      <div ref={trackRef} className="v3-deck__track" tabIndex={0}>
        <section className="v3-slide" aria-label="Invitation">
          <Invitation />
        </section>
        <section className="v3-slide v3-slide--photos" aria-label="Photos">
          {allPhotos.map((slot) => (
            <Polaroid key={slot.id} slot={slot} />
          ))}
        </section>
        {sectionOrder.map((id) => (
          <section key={id} className="v3-slide v3-slide--card">
            <CardCover id={id} lifted={active === id} />
          </section>
        ))}
      </div>
      <div className="v3-deck__foot" aria-hidden="true">
        <p className="v3-deck__dots">
          {Array.from({ length: slideCount }, (_, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: the dots are a fixed row
            <span key={index} data-current={index === current} />
          ))}
        </p>
        <p className="v3-deck__hint">Swipe through the cards</p>
      </div>
      <p className="sr-only" aria-live="polite">
        Card {current + 1} of {slideCount}
      </p>
    </div>
  );
}

/* ---------- An opened card ---------- */

type Origin = {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotate: number;
  opacity: number;
};

/** Where a card lies right now, as a transform of the full-size sheet. */
function measureOrigin(id: SectionId, size: { w: number; h: number }): Origin | null {
  const card = document.querySelector<HTMLElement>(`[data-card="${id}"]`);
  if (!card) {
    return null;
  }
  const box = card.getBoundingClientRect();
  if (box.width === 0 || box.height === 0) {
    return null;
  }
  // On a phone the cards sit in the deck, almost square to the screen.
  const tilt = window.matchMedia(narrowQuery).matches ? 0 : cardSpots[id].r;

  return {
    x: box.left + box.width / 2 - window.innerWidth / 2,
    y: box.top + box.height / 2 - window.innerHeight / 2,
    scaleX: card.offsetWidth / size.w,
    scaleY: card.offsetHeight / size.h,
    rotate: tilt,
    opacity: 1,
  };
}

/** A pressed flower in a free corner of the sheet. */
const sheetFlowers: Partial<Record<SectionId, { art: ArtName; side: "left" | "right" }>> = {
  schedule: { art: "stemRose", side: "right" },
  travel: { art: "stemCosmos", side: "left" },
  faq: { art: "stemLily", side: "right" },
};

const fallbackOrigin: Origin = { x: 0, y: 36, scaleX: 0.96, scaleY: 0.96, rotate: 0, opacity: 0 };

type SheetProps = { id: SectionId; size: { w: number; h: number } };

function Sheet({ id, size }: SheetProps) {
  const navigate = useNavigate();
  const ref = useRef<HTMLElement>(null);
  const [from] = useState(() => measureOrigin(id, size) ?? fallbackOrigin);
  const close = useCallback(() => navigate(pagePath("v3", "home")), [navigate]);
  const index = sectionOrder.indexOf(id);
  const previous = sectionOrder[index - 1];
  const next = sectionOrder[index + 1];
  const { title, body: Body } = sheets[id];
  const flower = sheetFlowers[id];

  useEscape(true, close);

  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);

  return (
    <motion.article
      ref={ref}
      className="v3-sheet"
      data-page={id}
      role="dialog"
      aria-modal="true"
      aria-labelledby={`v3-title-${id}`}
      tabIndex={-1}
      style={{ width: size.w, height: size.h }}
      variants={{
        lifted: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotate: 0, opacity: 1 },
        // Measured when the sheet closes, so it lands on the card wherever it is now.
        down: () => measureOrigin(id, size) ?? fallbackOrigin,
      }}
      initial={from}
      animate="lifted"
      exit="down"
      transition={{ duration: 0.62, ease: [0.2, 0.9, 0.25, 1] }}
    >
      <motion.div
        className="v3-sheet__inner"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, transition: { delay: 0.26, duration: 0.4 } }}
        exit={{ opacity: 0, transition: { duration: 0.12 } }}
      >
        <button type="button" className="v3-sheet__close" onClick={close}>
          <span aria-hidden="true">×</span>
          <span className="sr-only">Back to the table</span>
        </button>

        <header className="v3-sheet__head">
          <h2 id={`v3-title-${id}`}>{title}</h2>
        </header>

        <div className="v3-sheet__body">
          <Body />
        </div>

        {flower && (
          <img className="v3-sheet__flower" data-side={flower.side} src={art[flower.art]} alt="" />
        )}

        <footer className="v3-sheet__foot">
          {previous ? (
            <Link to={pagePath("v3", previous)} rel="prev">
              <span aria-hidden="true">←</span> {pageById(previous).label}
            </Link>
          ) : (
            <span />
          )}
          <Link to={pagePath("v3", "home")} className="v3-sheet__home">
            Back to the table
          </Link>
          {next ? (
            <Link to={pagePath("v3", next)} rel="next">
              {pageById(next).label} <span aria-hidden="true">→</span>
            </Link>
          ) : (
            <span />
          )}
        </footer>
      </motion.div>
    </motion.article>
  );
}

/* ---------- The app ---------- */

export function V3App() {
  const { page } = useCurrentPage();
  const viewport = useViewport();
  const narrow = useMediaQuery(narrowQuery);
  const active = page === "home" ? null : page;
  const [phase, setPhase] = useState<Phase>(() =>
    active !== null || readOpened() || prefersReducedMotion() ? "open" : "closed",
  );
  const lastActive = useRef<SectionId | null>(active);

  usePageTitle(pageById(page).title);

  // A link straight to a card skips the envelope.
  useEffect(() => {
    if (active !== null) {
      setPhase((current) => (current === "closed" ? "open" : current));
    }
  }, [active]);

  useEffect(() => {
    if (phase !== "opening") {
      return;
    }
    const timer = window.setTimeout(() => setPhase("open"), 2600);
    return () => window.clearTimeout(timer);
  }, [phase]);

  // When a card is put down, focus returns to it.
  useEffect(() => {
    const previous = lastActive.current;
    lastActive.current = active;
    if (active === null && previous !== null) {
      document
        .querySelector<HTMLElement>(`[data-card="${previous}"]`)
        ?.focus({ preventScroll: true });
    }
  }, [active]);

  const open = useCallback(() => {
    writeOpened(true);
    setPhase("opening");
  }, []);

  const reset = useCallback(() => {
    writeOpened(false);
    setPhase("closed");
  }, []);

  const unit = narrow ? 1 : unitFor(viewport.width, viewport.height);
  const size = narrow
    ? { w: viewport.width, h: viewport.height }
    : {
        w: Math.min(sheet.width * unit, viewport.width - 40),
        h: Math.min(sheet.height * unit, viewport.height - 28),
      };
  const Scene = narrow ? Deck : Table;

  return (
    <div className="v3" style={{ "--u": `${unit}px` } as CSSProperties}>
      <main className="v3-table" inert={active !== null}>
        <Scene unit={unit} phase={phase} active={active} onOpen={open} onReset={reset} />
        <Light />
      </main>

      <AnimatePresence>
        {active !== null && (
          <motion.div
            key="scrim"
            className="v3-scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
          >
            <Link to={pagePath("v3", "home")} tabIndex={-1} aria-label="Back to the table" />
          </motion.div>
        )}
        {active !== null && <Sheet key={active} id={active} size={size} />}
      </AnimatePresence>

      <VersionSwitcher />
    </div>
  );
}
