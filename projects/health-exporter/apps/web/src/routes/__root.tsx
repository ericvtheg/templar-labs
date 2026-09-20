import { createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";

export const Route = createRootRoute({
  head: () => ({ meta: [{ charSet: "utf-8" }, { title: "Templar Health Exporter API" }] }),
  shellComponent: ({ children }) => (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  ),
});
