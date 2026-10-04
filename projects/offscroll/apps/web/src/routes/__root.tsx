import { createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { Leaf } from "lucide-react";
import type { ReactNode } from "react";
import appCss from "../styles.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Offscroll — Less feed. More life." },
      {
        name: "description",
        content:
          "Less doomscrolling, together. Challenge your friends, reclaim your time, and earn rewards that matter.",
      },
      { name: "theme-color", content: "#244d3e" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
    ],
  }),
  shellComponent: RootDocument,
  errorComponent: ({ reset }) => (
    <div className="error-page">
      <Leaf size={36} />
      <h1>A little hiccup.</h1>
      <p>We couldn’t load your circle. Your check-ins haven’t been changed.</p>
      <button type="button" className="button primary" onClick={reset}>
        Try again
      </button>
    </div>
  ),
  notFoundComponent: () => (
    <div className="error-page">
      <Leaf size={36} />
      <h1>A little off track?</h1>
      <p>This page doesn’t exist.</p>
      <a className="button primary" href="/">
        Back to Offscroll
      </a>
    </div>
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
