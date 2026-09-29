import { type Config, Render } from "@puckeditor/core";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import type { WeddingBlock, WeddingPageData } from "../lib/wedding-page.ts";
import { BotanicalStamp, GardenArtwork, LineFlourish, StateFlowerPair } from "./garden-art.tsx";
import { SiteHeader } from "./site-header.tsx";

type PropsOf<T extends WeddingBlock["type"]> = Omit<
  Extract<WeddingBlock, { type: T }>["props"],
  "id"
>;
type RootProps = WeddingPageData["root"]["props"];
type WeddingComponents = {
  HeroBlock: PropsOf<"HeroBlock">;
  DetailsBlock: PropsOf<"DetailsBlock">;
  ScheduleBlock: PropsOf<"ScheduleBlock">;
  StoryBlock: PropsOf<"StoryBlock">;
  TravelBlock: PropsOf<"TravelBlock">;
  StayBlock: PropsOf<"StayBlock">;
  FaqBlock: PropsOf<"FaqBlock">;
  RegistryBlock: PropsOf<"RegistryBlock">;
  PhotoBlock: PropsOf<"PhotoBlock">;
};

const topId = "top";
const rsvpId = "rsvp";

const visibleField = {
  type: "radio" as const,
  label: "Show on published site",
  options: [
    { label: "Show", value: true },
    { label: "Keep hidden", value: false },
  ],
};

const sectionFields = {
  visible: visibleField,
  eyebrow: { type: "text" as const, label: "Small heading" },
  title: { type: "text" as const, label: "Heading" },
};

const guideItemsField = {
  type: "array" as const,
  label: "Cards",
  arrayFields: {
    title: { type: "text" as const, label: "Card heading" },
    details: { type: "textarea" as const, label: "Details" },
  },
  defaultItemProps: { title: "New recommendation", details: "Add the helpful details here." },
  getItemSummary: (item: { title: string }) => item.title,
  max: 12,
};

export const weddingPageConfig: Config<WeddingComponents, RootProps> = {
  categories: {
    essentials: {
      title: "Wedding sections",
      components: [
        "HeroBlock",
        "DetailsBlock",
        "ScheduleBlock",
        "StoryBlock",
        "TravelBlock",
        "StayBlock",
        "FaqBlock",
        "RegistryBlock",
      ],
    },
    media: { title: "Photos", components: ["PhotoBlock"] },
  },
  root: {
    fields: {
      font: {
        type: "select",
        label: "Type style",
        options: [
          { label: "Playful editorial", value: "playful" },
          { label: "Classic garden", value: "classic" },
          { label: "Clean modern", value: "modern" },
        ],
      },
      paperTone: {
        type: "select",
        label: "Paper tone",
        options: [
          { label: "Warm ivory", value: "ivory" },
          { label: "Soft blush", value: "blush" },
          { label: "Pale sage", value: "sage" },
        ],
      },
      spacing: {
        type: "radio",
        label: "Section spacing",
        options: [
          { label: "Cozy", value: "cozy" },
          { label: "Airy", value: "airy" },
        ],
      },
    },
    defaultProps: { font: "playful", paperTone: "ivory", spacing: "airy" },
    render: ({ children, font, paperTone, spacing, puck }) => (
      <div className={`wedding-site font-${font} paper-${paperTone} spacing-${spacing}`} id={topId}>
        <SiteHeader
          // biome-ignore lint/complexity/useLiteralKeys: Puck metadata is intentionally index-typed.
          editorLink={puck.metadata["canEdit"] === true}
          showDraftBadge={puck.isEditing}
        />
        <main>{children}</main>
        <RsvpSection />
        <footer className="site-footer" data-reveal>
          <div>
            <span className="footer-mark">E & E</span>
            <p>09 · 25 · 27 · Wichita, Kansas</p>
          </div>
          <Link to="/style">Review the style board</Link>
        </footer>
      </div>
    ),
  },
  components: {
    HeroBlock: {
      label: "Hero",
      fields: {
        visible: visibleField,
        eyebrow: { type: "text", label: "Small heading" },
        firstName: { type: "text", label: "First name" },
        secondName: { type: "text", label: "Second name" },
        date: { type: "text", label: "Date" },
        venue: { type: "text", label: "Venue" },
        location: { type: "text", label: "Location" },
        primaryLabel: { type: "text", label: "Button label" },
        primaryHref: { type: "text", label: "Button link" },
      },
      defaultProps: {
        visible: true,
        eyebrow: "Save the date",
        firstName: "Emma",
        secondName: "Eric",
        date: "September 25, 2027",
        venue: "Botanica, The Wichita Gardens",
        location: "Wichita, Kansas",
        primaryLabel: "Explore the weekend",
        primaryHref: "#weekend",
      },
      render: (props) => (
        <Visible visible={props.visible} editing={props.puck.isEditing}>
          <section className="hero" aria-label={`${props.firstName} and ${props.secondName}`}>
            <div className="hero-wash" />
            <div className="hero-copy">
              <p className="eyebrow hero-eyebrow">{props.eyebrow}</p>
              <h1>
                <span>{props.firstName}</span>
                <span className="hero-ampersand">&</span>
                <span>{props.secondName}</span>
              </h1>
              <LineFlourish className="hero-flourish" />
              <div className="hero-details">
                <p>{props.date}</p>
                <p>
                  {props.venue}
                  <br />
                  {props.location}
                </p>
              </div>
              <div className="hero-actions">
                <a className="button button-primary" href={props.primaryHref}>
                  {props.primaryLabel}
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
            <p className="hero-side-note">California poppies · Kansas sunflowers</p>
          </section>
        </Visible>
      ),
    },
    DetailsBlock: {
      label: "Details ribbon",
      fields: {
        visible: visibleField,
        dateLabel: { type: "text", label: "Date label" },
        date: { type: "text", label: "Date" },
        venueLabel: { type: "text", label: "Venue label" },
        venue: { type: "text", label: "Venue" },
        cityLabel: { type: "text", label: "City label" },
        city: { type: "text", label: "City" },
      },
      defaultProps: {
        visible: true,
        dateLabel: "Date",
        date: "September 25, 2027",
        venueLabel: "Place",
        venue: "Botanica, The Wichita Gardens",
        cityLabel: "City",
        city: "Wichita, Kansas",
      },
      render: (props) => (
        <Visible visible={props.visible} editing={props.puck.isEditing}>
          <section aria-label="Wedding details" className="fact-ribbon" data-reveal>
            <Fact number="01" label={props.dateLabel}>
              {props.date}
            </Fact>
            <Fact number="02" label={props.venueLabel}>
              {props.venue}
            </Fact>
            <Fact number="03" label={props.cityLabel}>
              {props.city}
            </Fact>
          </section>
        </Visible>
      ),
    },
    ScheduleBlock: {
      label: "Schedule",
      fields: {
        ...sectionFields,
        introduction: { type: "textarea", label: "Introduction" },
        items: {
          type: "array",
          label: "Events",
          arrayFields: {
            time: { type: "text", label: "Time" },
            title: { type: "text", label: "Event" },
            details: { type: "textarea", label: "Details" },
          },
          defaultItemProps: { time: "4:00 PM", title: "Ceremony", details: "Botanica" },
          getItemSummary: (item) => `${item.time} · ${item.title}`,
          max: 12,
        },
      },
      defaultProps: {
        visible: true,
        eyebrow: "The weekend",
        title: "Meet us in the garden",
        introduction: "Add the weekend schedule.",
        items: [],
      },
      render: (props) => (
        <SectionFrame {...props} botanical={false}>
          <p className="editable-section-intro">{props.introduction}</p>
          {props.items.length > 0 ? (
            <div className="schedule-grid">
              {props.items.map((item) => (
                <article className="schedule-card" key={`${item.time}-${item.title}`}>
                  <p>{item.time}</p>
                  <h3>{item.title}</h3>
                  {item.details ? <span>{item.details}</span> : null}
                </article>
              ))}
            </div>
          ) : (
            <EmptyEditorNote editing={props.puck.isEditing}>
              Add confirmed events when they are ready.
            </EmptyEditorNote>
          )}
        </SectionFrame>
      ),
    },
    StoryBlock: {
      label: "Our story",
      fields: { ...sectionFields, body: { type: "textarea", label: "Story" } },
      defaultProps: {
        visible: true,
        eyebrow: "Our story",
        title: "In our own words",
        body: "Tell your story here.",
      },
      render: (props) => (
        <SectionFrame {...props} botanical>
          <p className="editable-prose">{props.body}</p>
        </SectionFrame>
      ),
    },
    TravelBlock: guideConfig("Travel", "Getting to Wichita", "Travel"),
    StayBlock: guideConfig("While you’re here", "Make the most of your stay", "Stay"),
    FaqBlock: {
      label: "FAQ",
      fields: {
        ...sectionFields,
        items: {
          type: "array",
          label: "Questions",
          arrayFields: {
            question: { type: "text", label: "Question" },
            answer: { type: "textarea", label: "Answer" },
          },
          defaultItemProps: { question: "What should I know?", answer: "Add the answer here." },
          getItemSummary: (item) => item.question,
          max: 20,
        },
      },
      defaultProps: {
        visible: true,
        eyebrow: "Good to know",
        title: "Questions, answered",
        items: [],
      },
      render: (props) => (
        <SectionFrame {...props} botanical>
          {props.items.length > 0 ? (
            <div className="faq-list">
              {props.items.map((item) => (
                <details key={item.question}>
                  <summary>{item.question}</summary>
                  <p>{item.answer}</p>
                </details>
              ))}
            </div>
          ) : (
            <EmptyEditorNote editing={props.puck.isEditing}>
              Add questions when answers are confirmed.
            </EmptyEditorNote>
          )}
        </SectionFrame>
      ),
    },
    RegistryBlock: {
      label: "Registry",
      fields: {
        ...sectionFields,
        body: { type: "textarea", label: "Message" },
        linkLabel: { type: "text", label: "Link label" },
        linkUrl: { type: "text", label: "HTTPS link" },
      },
      defaultProps: {
        visible: true,
        eyebrow: "Registry",
        title: "Gifts & good wishes",
        body: "Your presence is the greatest gift.",
        linkLabel: "",
        linkUrl: "",
      },
      render: (props) => (
        <SectionFrame {...props} botanical={false}>
          <p className="editable-prose">{props.body}</p>
          {props.linkLabel && props.linkUrl ? (
            <a className="button button-primary" href={props.linkUrl}>
              {props.linkLabel}
            </a>
          ) : null}
        </SectionFrame>
      ),
    },
    PhotoBlock: {
      label: "Photo",
      fields: {
        visible: visibleField,
        url: { type: "text", label: "HTTPS image URL" },
        alt: { type: "text", label: "Image description" },
        caption: { type: "text", label: "Caption" },
        shape: {
          type: "select",
          label: "Shape",
          options: [
            { label: "Landscape", value: "landscape" },
            { label: "Portrait", value: "portrait" },
            { label: "Full width", value: "full" },
          ],
        },
      },
      defaultProps: {
        visible: true,
        url: "/social-card.png",
        alt: "Emma and Eric",
        caption: "",
        shape: "landscape",
      },
      render: (props) => (
        <Visible visible={props.visible} editing={props.puck.isEditing}>
          <figure className={`wedding-photo wedding-photo-${props.shape}`}>
            <img src={props.url} alt={props.alt} />
            {props.caption ? <figcaption>{props.caption}</figcaption> : null}
          </figure>
        </Visible>
      ),
    },
  },
};

export function WeddingPage({
  data,
  canEdit = false,
}: {
  readonly data: WeddingPageData;
  readonly canEdit?: boolean;
}) {
  return (
    <Render config={weddingPageConfig as unknown as Config} data={data} metadata={{ canEdit }} />
  );
}

function guideConfig(eyebrow: string, title: string, label: string) {
  return {
    label,
    fields: {
      ...sectionFields,
      introduction: { type: "textarea" as const, label: "Introduction" },
      items: guideItemsField,
    },
    defaultProps: {
      visible: true,
      eyebrow,
      title,
      introduction: "Add the helpful details here.",
      items: [],
    },
    render: (props: PropsOf<"TravelBlock"> & { id: string; puck: { isEditing: boolean } }) => (
      <SectionFrame {...props} botanical={false}>
        <p className="editable-section-intro">{props.introduction}</p>
        {props.items.length > 0 ? (
          <div className="guide-grid">
            {props.items.map((item) => (
              <article key={item.title}>
                <h3>{item.title}</h3>
                <p>{item.details}</p>
              </article>
            ))}
          </div>
        ) : (
          <EmptyEditorNote editing={props.puck.isEditing}>
            Add recommendations when they are confirmed.
          </EmptyEditorNote>
        )}
      </SectionFrame>
    ),
  };
}

function SectionFrame(props: {
  readonly id: string;
  readonly visible: boolean;
  readonly eyebrow: string;
  readonly title: string;
  readonly botanical: boolean;
  readonly puck: { readonly isEditing: boolean };
  readonly children: ReactNode;
}) {
  return (
    <Visible visible={props.visible} editing={props.puck.isEditing}>
      <section
        className={`content-section content-section-${props.id} section-light${props.visible ? "" : " editor-hidden-section"}`}
        id={props.id}
      >
        <div className="section-heading">
          <p className="eyebrow">{props.eyebrow}</p>
          <h2>{props.title}</h2>
          <LineFlourish className="section-flourish" />
        </div>
        <div className="published-content-card">{props.children}</div>
        {props.botanical ? (
          <BotanicalStamp className="section-stamp" />
        ) : (
          <div aria-hidden="true" className="petal-cluster">
            <span />
            <span />
            <span />
          </div>
        )}
      </section>
    </Visible>
  );
}

function Visible({
  visible,
  editing,
  children,
}: {
  readonly visible: boolean;
  readonly editing: boolean;
  readonly children: ReactNode;
}) {
  return visible || editing ? (
    <div className={visible ? undefined : "editor-hidden-block"}>{children}</div>
  ) : null;
}

function EmptyEditorNote({
  editing,
  children,
}: {
  readonly editing: boolean;
  readonly children: ReactNode;
}) {
  return editing ? <p className="editor-empty-note">{children}</p> : null;
}

function Fact({
  number,
  label,
  children,
}: {
  readonly number: string;
  readonly label: string;
  readonly children: ReactNode;
}) {
  return (
    <div>
      <span className="fact-number">{number}</span>
      <p>
        <span>{label}</span>
        {children}
      </p>
    </div>
  );
}

function RsvpSection() {
  return (
    <section className="rsvp-preview" id={rsvpId}>
      <StateFlowerPair className="rsvp-state-flowers" />
      <p className="eyebrow">Your invitation</p>
      <h2>Save your seat</h2>
      <p>Enter your full name as it appears on your invitation to respond for your household.</p>
      <Link className="button button-dark" to="/rsvp">
        RSVP now
      </Link>
    </section>
  );
}
