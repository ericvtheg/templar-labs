import { Link } from "@tanstack/react-router";

import { wedding } from "../content/wedding";
import { WeddingMonogram } from "./wedding-monogram.tsx";

export function SiteHeader() {
  return (
    <header className="site-header">
      <WeddingMonogram className="site-wordmark" homeAnchor />
      <nav aria-label="Wedding website navigation" className="site-nav">
        <a href="#weekend">Weekend</a>
        <a href="#travel">Travel</a>
        <a href="#faq">FAQ</a>
      </nav>
      <div className="header-actions">
        {wedding.status === "draft" ? <span className="draft-pill">Draft</span> : null}
        <Link className="style-link" to="/style" viewTransition>
          Style board
        </Link>
      </div>
    </header>
  );
}
