import { createFileRoute, Link } from "@tanstack/react-router";
import { tools } from "../tools";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-mono text-2xl font-semibold tracking-tight">templar/utils</h1>
        <p className="text-sm text-muted-foreground">
          Client-side developer utilities. No accounts, no ads, no storage.
        </p>
      </header>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {tools.map((tool) => (
          <li key={tool.slug}>
            <Link
              className="block rounded-lg border bg-card px-4 py-3 transition-colors hover:border-foreground/20 hover:bg-muted/50"
              to={`/tools/${tool.slug}`}
            >
              <div className="font-medium">{tool.name}</div>
              <div className="text-xs text-muted-foreground">{tool.blurb}</div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
