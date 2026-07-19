import { Link } from "@tanstack/react-router";

import { wedding } from "../content/wedding";

export function SiteHeader() {
  return (
    <header className="site-header">
      <a aria-label="Emma and Eric home" className="site-wordmark" href="#top">
        E <span>&</span> E
      </a>
      <nav aria-label="Wedding website navigation" className="site-nav">
        <a href="#weekend">Weekend</a>
        <a href="#travel">Travel</a>
        <a href="#faq">FAQ</a>
      </nav>
      <div className="header-actions">
        {wedding.status === "draft" ? <span className="draft-pill">Draft</span> : null}
        <Link className="style-link" to="/style">
          Style board
        </Link>
      </div>
    </header>
  );
}
