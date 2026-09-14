import { createFileRoute } from "@tanstack/react-router";
import { authFailureMessage } from "../lib/auth-errors.ts";
export const Route = createFileRoute("/auth-error")({
  validateSearch: ({ reason }: Record<string, unknown>) => ({
    reason: typeof reason === "string" ? reason : "unknown",
  }),
  component: AuthError,
});
function AuthError() {
  const { reason } = Route.useSearch();
  return (
    <main className="landing-copy">
      <section className="panel onboarding">
        <span className="eyebrow">CHINA · SIGN-IN DIAGNOSTIC</span>
        <h1>Sign-in hit a snag.</h1>
        <p role="alert">{authFailureMessage(reason)}</p>
        <p className="fine-print">
          An existing Templar login is reused automatically. Skipping Google’s screen is normal;
          failing the return trip is not.
        </p>
        <div className="button-row">
          <a className="button primary" href="/api/auth/sign-in?returnTo=/">
            Try sign-in again →
          </a>
          <a className="button" href="/">
            Back to China
          </a>
        </div>
      </section>
    </main>
  );
}
