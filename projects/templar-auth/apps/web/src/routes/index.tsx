import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: AuthHome,
});

function AuthHome() {
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <p className="eyebrow">Breli App</p>
        <h1>Authentication service.</h1>
        <p>Breli App sign-in controls are presented by the application you are using.</p>
      </section>
    </main>
  );
}
