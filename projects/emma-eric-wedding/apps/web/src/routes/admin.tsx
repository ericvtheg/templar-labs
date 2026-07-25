import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useId } from "react";
import type { AdminAccess } from "../lib/admin-auth.ts";
import { getAdminAccess } from "../lib/auth.server.ts";

type AdminSearch = {
  readonly error?: string;
};

const loadAdminAccess = createServerFn({ method: "GET" }).handler(async (context) => {
  const request = (context as { readonly request?: Request }).request;

  if (request === undefined) {
    throw new Error("Request context unavailable.");
  }

  return await getAdminAccess(request);
});

export const Route = createFileRoute("/admin")({
  validateSearch: (search: Record<string, unknown>): AdminSearch => {
    const { error } = search;

    return typeof error === "string" ? { error } : {};
  },
  loader: () => loadAdminAccess(),
  component: AdminPage,
});

function AdminPage() {
  const access = Route.useLoaderData() as AdminAccess;
  const search = Route.useSearch();

  if (access === "authorized") {
    return <main aria-label="Admin" className="admin-page" />;
  }

  return <AdminSignIn access={access} oauthError={search.error !== undefined} />;
}

function AdminSignIn({
  access,
  oauthError,
}: {
  readonly access: Exclude<AdminAccess, "authorized">;
  readonly oauthError: boolean;
}) {
  const titleId = useId();
  const hasError = access === "forbidden" || oauthError;

  return (
    <main className="admin-auth-shell">
      <section aria-labelledby={titleId} className="admin-auth-card">
        <p className="eyebrow">Private administration</p>
        <h1 id={titleId}>Emma & Eric</h1>
        <p className="admin-auth-copy">Continue through Templar Auth.</p>
        {hasError ? (
          <p className="admin-auth-error" role="alert">
            This Google account does not have access.
          </p>
        ) : null}
        {access === "forbidden" ? (
          <form action="/api/auth/sign-out?returnTo=/admin" method="post">
            <button className="button button-primary admin-auth-button" type="submit">
              Sign out
            </button>
          </form>
        ) : (
          <a
            className="button button-primary admin-auth-button"
            href="/api/auth/sign-in?returnTo=/admin"
          >
            Continue with Google
          </a>
        )}
      </section>
    </main>
  );
}
