import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: AuthHome,
});

function AuthHome() {
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <p className="eyebrow">Templar Labs</p>
        <h1>One secure sign-in.</h1>
        <p>This service provides identity to authorized Templar websites.</p>
        <Link className="button" to="/sign-in">
          Sign in
        </Link>
      </section>
    </main>
  );
}
