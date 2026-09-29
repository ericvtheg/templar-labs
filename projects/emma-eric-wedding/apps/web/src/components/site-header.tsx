import { Link } from "@tanstack/react-router";

import { wedding } from "../content/wedding";
import { WeddingMonogram } from "./wedding-monogram.tsx";

export function SiteHeader({
  editorLink = false,
  showDraftBadge = wedding.status === "draft",
}: {
  readonly editorLink?: boolean;
  readonly showDraftBadge?: boolean;
} = {}) {
  return (
    <header className="site-header">
      <WeddingMonogram className="site-wordmark" homeAnchor />
      <nav aria-label="Wedding website navigation" className="site-nav">
        <a href="#weekend">Weekend</a>
        <a href="#travel">Travel</a>
        <a href="#faq">FAQ</a>
      </nav>
      <div className="header-actions">
        {showDraftBadge ? <span className="draft-pill">Draft</span> : null}
        {editorLink ? (
          <Link className="style-link" to="/edit" viewTransition>
            Edit site
          </Link>
        ) : null}
        <Link className="style-link" to="/style" viewTransition>
          Style board
        </Link>
      </div>
    </header>
  );
}
