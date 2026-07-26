import { createRootRoute, HeadContent, Link, Scripts } from "@tanstack/react-router";

import appCss from "../styles.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        title: "Emma & Eric | September 25, 2027",
      },
      {
        name: "description",
        content: "The draft wedding website for Emma and Eric at Botanica, The Wichita Gardens.",
      },
      {
        property: "og:title",
        content: "Emma & Eric — September 25, 2027",
      },
      {
        property: "og:description",
        content: "A garden celebration at Botanica in Wichita, Kansas.",
      },
      {
        property: "og:type",
        content: "website",
      },
      {
        property: "og:url",
        content: "https://emmaand.ericventor.com/",
      },
      {
        property: "og:image",
        content: "https://emmaand.ericventor.com/social-card.png",
      },
      {
        property: "og:image:secure_url",
        content: "https://emmaand.ericventor.com/social-card.png",
      },
      {
        property: "og:image:type",
        content: "image/png",
      },
      {
        property: "og:image:width",
        content: "1200",
      },
      {
        property: "og:image:height",
        content: "630",
      },
      {
        property: "og:image:alt",
        content: "Emma and Eric — September 25, 2027 at Botanica in Wichita, Kansas",
      },
      {
        name: "twitter:card",
        content: "summary_large_image",
      },
      {
        name: "twitter:title",
        content: "Emma & Eric — September 25, 2027",
      },
      {
        name: "twitter:description",
        content: "A garden celebration at Botanica in Wichita, Kansas.",
      },
      {
        name: "twitter:image",
        content: "https://emmaand.ericventor.com/social-card.png",
      },
      {
        name: "robots",
        content: "noindex, nofollow, noarchive",
      },
      {
        name: "theme-color",
        content: "#fbf6ee",
      },
    ],
    links: [
      {
        rel: "icon",
        type: "image/svg+xml",
        href: "/favicon-v2.svg",
      },
      {
        rel: "shortcut icon",
        href: "/favicon-v2.svg",
      },
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  notFoundComponent: NotFoundPage,
  shellComponent: RootDocument,
});

function NotFoundPage() {
  return (
    <main className="style-board">
      <header className="style-board-header">
        <div>
          <p className="eyebrow">404 · Wrong garden path</p>
          <h1>Lost in the garden.</h1>
          <p className="style-intro">
            This page could not be found, but the celebration is still right where we left it.
          </p>
        </div>
        <Link className="back-link" to="/">
          Return home <span aria-hidden="true">→</span>
        </Link>
      </header>
    </main>
  );
}

function RootDocument({ children }: { readonly children: React.ReactNode }) {
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
