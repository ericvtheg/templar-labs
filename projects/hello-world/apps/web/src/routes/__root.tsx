import { createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { PostHogProvider } from "@posthog/react";
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
        title: "Hello World",
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
  const posthogToken = import.meta.env["VITE_PUBLIC_POSTHOG_PROJECT_TOKEN"];
  const posthogHost = import.meta.env["VITE_PUBLIC_POSTHOG_HOST"];

  if (import.meta.env["DEV"] && (!posthogToken || !posthogHost)) {
    console.error(
      "VITE_PUBLIC_POSTHOG_PROJECT_TOKEN or VITE_PUBLIC_POSTHOG_HOST variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once these variables are configured",
    );
  }

  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {posthogToken && posthogHost ? (
          <PostHogProvider
            apiKey={posthogToken}
            options={{
              api_host: "/ingest",
              ui_host: posthogHost,
              defaults: "2025-05-24",
              capture_exceptions: true,
              debug: import.meta.env["DEV"] as boolean,
              tracing_headers: typeof window !== "undefined" ? [window.location.hostname] : [],
            }}
          >
            {children}
          </PostHogProvider>
        ) : (
          children
        )}
        <Scripts />
      </body>
    </html>
  );
}
