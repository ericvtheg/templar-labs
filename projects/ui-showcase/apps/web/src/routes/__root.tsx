import { createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import templarFaviconUrl from "@templar/assets/favicon.svg?url";

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
        title: "Breli App UI Showcase",
      },
    ],
    links: [
      {
        rel: "icon",
        type: "image/svg+xml",
        href: templarFaviconUrl,
      },
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),

  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
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
