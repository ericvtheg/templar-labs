import { createFileRoute, Link } from "@tanstack/react-router";
import { useId } from "react";

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
  const visibleSections =
    wedding.status === "draft"
      ? wedding.sections
      : wedding.sections.filter((section) => section.published);

  return (
    <div className="wedding-site font-playful" id={topId}>
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
              <p>{wedding.date.display}</p>
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
              <Link className="button button-quiet" to="/rsvp">
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

        <section aria-label="Wedding details" className="fact-ribbon">
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

        <section className="rsvp-preview" id={rsvpId}>
          <BotanicalStamp className="rsvp-stamp rsvp-stamp-left" />
          <BotanicalStamp className="rsvp-stamp rsvp-stamp-right" />
          <p className="eyebrow">Your invitation</p>
          <h2>Save your seat</h2>
          <p>
            Enter your full name as it appears on your invitation to respond for your household.
          </p>
          <Link className="button button-dark" to="/rsvp">
            RSVP now
          </Link>
        </section>
      </main>

      <footer className="site-footer">
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
