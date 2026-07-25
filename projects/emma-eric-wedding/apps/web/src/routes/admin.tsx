import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useId, useState } from "react";
import { type AdminAccess, adminEmail } from "../lib/admin-auth.ts";
import { getAdminAccess } from "../lib/auth.server.ts";
import { authClient } from "../lib/auth-client.ts";

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
  const [clientError, setClientError] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const hasError = access === "forbidden" || oauthError || clientError;

  async function signIn() {
    setClientError(false);
    setIsPending(true);

    try {
      const result = await authClient.signIn.social({
        provider: "google",
        callbackURL: "/admin",
        errorCallbackURL: "/admin",
        loginHint: adminEmail,
      });

      if (result.error !== null) {
        setClientError(true);
        setIsPending(false);
      }
    } catch {
      setClientError(true);
      setIsPending(false);
    }
  }

  async function signOut() {
    setIsPending(true);
    await authClient.signOut();
    window.location.assign("/admin");
  }

  return (
    <main className="admin-auth-shell">
      <section aria-labelledby={titleId} className="admin-auth-card">
        <p className="eyebrow">Private administration</p>
        <h1 id={titleId}>Emma & Eric</h1>
        <p className="admin-auth-copy">Sign in with the authorized Google account to continue.</p>
        {hasError ? (
          <p className="admin-auth-error" role="alert">
            This Google account does not have access.
          </p>
        ) : null}
        <button
          className="button button-primary admin-auth-button"
          disabled={isPending}
          onClick={access === "forbidden" ? signOut : signIn}
          type="button"
        >
          {isPending
            ? "Working…"
            : access === "forbidden"
              ? "Use another account"
              : "Continue with Google"}
        </button>
      </section>
    </main>
  );
}
