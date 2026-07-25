import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: AuthHome,
});

function AuthHome() {
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <p className="eyebrow">Templar Labs</p>
        <h1>Authentication service.</h1>
        <p>Sign-in controls are presented by the Templar application you are using.</p>
      </section>
    </main>
  );
}
