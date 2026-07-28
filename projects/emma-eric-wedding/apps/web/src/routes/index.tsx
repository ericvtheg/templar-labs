import { createFileRoute, Link } from "@tanstack/react-router";
import { type RefObject, useEffect, useId, useRef } from "react";

import { AddToCalendar } from "../components/add-to-calendar.tsx";
import { BotanicalStamp, GardenArtwork, LineFlourish } from "../components/garden-art";
import { SiteHeader } from "../components/site-header";
import { type WeddingSection, wedding } from "../content/wedding";

export const Route = createFileRoute("/")({
  component: WeddingHome,
});

const topId = "top";
const rsvpId = "rsvp";

function WeddingHome() {
  const weddingTitleId = useId();
  const siteRef = useRef<HTMLDivElement>(null);
  const visibleSections =
    wedding.status === "draft"
      ? wedding.sections
      : wedding.sections.filter((section) => section.published);
  useHomepageReveals(siteRef);

  return (
    <div className="wedding-site font-playful" id={topId} ref={siteRef}>
      <SiteHeader />
      <main>
        <section className="hero" aria-labelledby={weddingTitleId}>
          <div className="hero-wash" />
          <div className="hero-copy">
            <p className="eyebrow hero-eyebrow">Save the date</p>
            <h1 id={weddingTitleId}>
              <span>{wedding.couple.first}</span>
              <span className="hero-ampersand">&</span>
              <span>{wedding.couple.second}</span>
            </h1>
            <LineFlourish className="hero-flourish" />
            <div className="hero-details">
              <AddToCalendar />
              <p>
                {wedding.venue.name}
                <br />
                {wedding.venue.city}, {wedding.venue.region}
              </p>
            </div>
            <div className="hero-actions">
              <a className="button button-primary" href="#weekend">
                Explore the draft
              </a>
              <Link className="button button-quiet" to="/rsvp" viewTransition>
                RSVP
              </Link>
            </div>
          </div>

          <div className="hero-art" aria-hidden="true">
            <span className="sun-shape" />
            <GardenArtwork className="garden-artwork" />
          </div>

          <p className="hero-side-note">A garden celebration · Wichita, Kansas</p>
        </section>

        <section aria-label="Wedding details" className="fact-ribbon" data-reveal>
          <div>
            <span className="fact-number">01</span>
            <p>
              <span>Date</span>
              {wedding.date.display}
            </p>
          </div>
          <div>
            <span className="fact-number">02</span>
            <p>
              <span>Place</span>
              {wedding.venue.name}
            </p>
          </div>
          <div>
            <span className="fact-number">03</span>
            <p>
              <span>City</span>
              {wedding.venue.city}, {wedding.venue.region}
            </p>
          </div>
        </section>

        {visibleSections.map((section, index) => (
          <DraftSectionBlock index={index} key={section.id} section={section} />
        ))}

        <section className="rsvp-preview" data-reveal id={rsvpId}>
          <BotanicalStamp className="rsvp-stamp rsvp-stamp-left" />
          <BotanicalStamp className="rsvp-stamp rsvp-stamp-right" />
          <p className="eyebrow">Your invitation</p>
          <h2>Save your seat</h2>
          <p>
            Enter your full name as it appears on your invitation to respond for your household.
          </p>
          <Link className="button button-dark" to="/rsvp" viewTransition>
            RSVP now
          </Link>
        </section>
      </main>

      <footer className="site-footer" data-reveal>
        <div>
          <span className="footer-mark">E & E</span>
          <p>
            {wedding.date.compact} · {wedding.venue.city}, {wedding.venue.region}
          </p>
        </div>
        <Link to="/style">Review the style board</Link>
      </footer>
    </div>
  );
}

function DraftSectionBlock({
  index,
  section,
}: {
  readonly index: number;
  readonly section: WeddingSection;
}) {
  const isBotanicalSection = section.id === "story" || section.id === "faq";

  return (
    <section
      className={`content-section content-section-${section.id} ${index % 2 === 0 ? "section-warm" : "section-light section-reversed"}`}
      data-reveal
      id={section.id}
    >
      <div className="section-heading">
        <p className="eyebrow">{section.eyebrow}</p>
        <h2>{section.title}</h2>
        <LineFlourish className="section-flourish" />
      </div>

      <div className="draft-content-card">
        <span className="draft-label">Content placeholder</span>
        <p>{section.placeholder}</p>
        <small>
          This section remains hidden when the site is published until content is supplied.
        </small>
      </div>

      {isBotanicalSection ? (
        <BotanicalStamp className="section-stamp" />
      ) : (
        <div aria-hidden="true" className="petal-cluster">
          <span />
          <span />
          <span />
        </div>
      )}
    </section>
  );
}

function useHomepageReveals(containerRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const container = containerRef.current;
    if (container === null) {
      return;
    }

    const revealElements = Array.from(container.querySelectorAll<HTMLElement>("[data-reveal]"));
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReducedMotion || !("IntersectionObserver" in window)) {
      for (const element of revealElements) {
        element.setAttribute("data-revealed", "true");
      }
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) {
            continue;
          }

          const element = entry.target as HTMLElement;
          element.setAttribute("data-revealed", "true");
          observer.unobserve(element);
        }
      },
      { rootMargin: "0px 0px -12%", threshold: 0.12 },
    );

    for (const element of revealElements) {
      const bounds = element.getBoundingClientRect();
      if (bounds.top < window.innerHeight * 0.9 && bounds.bottom > 0) {
        element.setAttribute("data-revealed", "true");
      } else {
        observer.observe(element);
      }
    }

    container.classList.add("motion-reveals-ready");

    return () => observer.disconnect();
  }, [containerRef]);
}
