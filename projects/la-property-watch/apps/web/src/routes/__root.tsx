import { createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import type { ReactNode } from "react";
import appCss from "../styles.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "LA Property Watch — Templar Labs" },
      {
        name: "description",
        content: "Private Los Angeles County foreclosure source research and provenance tracking.",
      },
      { name: "theme-color", content: "#17251f" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootDocument,
  errorComponent: ({ reset }) => (
    <main className="center-page">
      <div className="error-mark">LP</div>
      <p className="eyebrow">Private research workspace</p>
      <h1>We couldn’t load the watch desk.</h1>
      <p className="muted">No records were changed. Try loading the protected workspace again.</p>
      <button className="button primary" type="button" onClick={reset}>
        Try again
      </button>
    </main>
  ),
  notFoundComponent: () => (
    <main className="center-page">
      <p className="eyebrow">404</p>
      <h1>That page isn’t in the research file.</h1>
      <a className="button primary" href="/">
        Return to the watch desk
      </a>
    </main>
  ),
});

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
