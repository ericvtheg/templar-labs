import { useId } from "react";
import { Link, useLocation } from "react-router";
import { type PageId, pages, type VersionId, versions } from "../content/pages.ts";
import { type Hotel, stay } from "../content/site.ts";

/** The version and page for the current URL. */
export function useCurrentPage(): { version: VersionId | null; page: PageId } {
  const { pathname } = useLocation();
  const [, first = "", slug = ""] = pathname.split("/");
  const version = versions.find((candidate) => candidate.id === first)?.id ?? null;
  const page = pages.find((candidate) => candidate.slug === slug)?.id ?? "home";
  return { version, page };
}

/** Reviewer chrome: open the same page in another version. Not part of any design. */
export function VersionSwitcher() {
  const { version, page } = useCurrentPage();
  const slug = pages.find((candidate) => candidate.id === page)?.slug ?? "";

  return (
    <nav className="switcher" aria-label="Design versions">
      <Link to="/" aria-label="All versions">
        ‹
      </Link>
      {versions.map((candidate) => (
        <Link
          key={candidate.id}
          to={slug === "" ? `/${candidate.id}` : `/${candidate.id}/${slug}`}
          aria-current={candidate.id === version ? "true" : undefined}
          aria-label={`Version ${candidate.number}: ${candidate.name}`}
        >
          {Number(candidate.number)}
        </Link>
      ))}
    </nav>
  );
}

type BookButtonProps = {
  hotel: Hotel;
  /** Class for the button. The note below it gets `${className}-note`. */
  className: string;
};

/** The room-block booking button. Shows a labelled placeholder until the link exists. */
export function BookButton({ hotel, className }: BookButtonProps) {
  const noteId = useId();
  const hotelName = hotel.name.join(" ");

  if (hotel.bookingUrl !== null) {
    return (
      <a className={className} href={hotel.bookingUrl} target="_blank" rel="noreferrer">
        {stay.bookLabel}
        <span className="sr-only"> at {hotelName}</span>
      </a>
    );
  }

  return (
    <>
      <button type="button" className={className} aria-disabled="true" aria-describedby={noteId}>
        {stay.bookLabel}
        <span className="sr-only"> at {hotelName}</span>
      </button>
      <span id={noteId} className={`${className}-note`}>
        {stay.bookPendingNote}
      </span>
    </>
  );
}
