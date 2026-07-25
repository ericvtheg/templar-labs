import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { authClient } from "../lib/auth-client.ts";

type SignInSearch = {
  readonly callbackURL?: string;
  readonly error?: string;
};

export const Route = createFileRoute("/sign-in")({
  validateSearch: (search: Record<string, unknown>): SignInSearch => {
    const { callbackURL, error } = search;
    return {
      ...(isSafeCallbackURL(callbackURL) ? { callbackURL } : {}),
      ...(typeof error === "string" ? { error } : {}),
    };
  },
  component: SignInPage,
});

function SignInPage() {
  const search = Route.useSearch();
  const [clientError, setClientError] = useState(false);
  const [isPending, setIsPending] = useState(false);

  async function signIn() {
    setClientError(false);
    setIsPending(true);

    try {
      const result = await authClient.signIn.social({
        provider: "google",
        callbackURL: search.callbackURL ?? "/",
        errorCallbackURL: "/sign-in",
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

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <p className="eyebrow">Templar Labs</p>
        <h1>Continue securely.</h1>
        <p>Use your Google account to continue to the requesting site.</p>
        {search.error !== undefined || clientError ? (
          <p className="auth-error" role="alert">
            Sign-in could not be completed.
          </p>
        ) : null}
        <button className="button" disabled={isPending} onClick={signIn} type="button">
          {isPending ? "Redirecting…" : "Continue with Google"}
        </button>
      </section>
    </main>
  );
}

function isSafeCallbackURL(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.startsWith("/api/auth/first-party/authorize?") &&
    !value.startsWith("//")
  );
}
