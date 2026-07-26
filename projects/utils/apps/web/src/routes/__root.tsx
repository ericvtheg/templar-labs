import { createRootRoute, HeadContent, Link, Outlet, Scripts } from "@tanstack/react-router";
import templarFaviconUrl from "@templar/assets/favicon.svg?url";

import appCss from "../styles.css?url";
import { tools } from "../tools";

export const Route = createRootRoute({
  component: AppShell,
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
        title: "Breli App Utils",
      },
      {
        name: "description",
        content: "Client-side developer utilities. No accounts, no ads, no storage.",
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

function AppShell() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-2">
          <Link className="font-mono text-sm font-semibold tracking-tight" to="/">
            Breli App Utils
          </Link>
          <span className="text-muted-foreground" aria-hidden="true">
            /
          </span>
          <nav className="flex min-w-0 flex-1 overflow-x-auto">
            <ul className="flex items-center gap-1 text-xs">
              {tools.map((tool) => (
                <li key={tool.slug} className="shrink-0">
                  <Link
                    activeProps={{
                      className: "bg-muted text-foreground",
                    }}
                    activeOptions={{
                      exact: true,
                    }}
                    className="inline-flex rounded px-2 py-1 font-medium text-muted-foreground hover:text-foreground"
                    to={`/tools/${tool.slug}`}
                  >
                    {tool.name}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}

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
