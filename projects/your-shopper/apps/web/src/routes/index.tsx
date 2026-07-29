import { createFileRoute } from "@tanstack/react-router";
import { createServerFn, useServerFn } from "@tanstack/react-start";
import { Effect } from "effect";
import { useId, useState, useTransition } from "react";
import { getApiAuth } from "../lib/api-auth.server.ts";
import { getAuth, requireAdmin } from "../lib/auth.server.ts";

type DashboardKey = {
  readonly id: string;
  readonly name: string;
  readonly start: string;
  readonly permissions: readonly string[];
  readonly createdAt: string;
  readonly expiresAt: string | null;
  readonly lastUsedAt: string | null;
  readonly revokedAt: string | null;
};

type DashboardData = {
  readonly baseUrl: string;
  readonly user: {
    readonly id: string;
    readonly name: string;
    readonly email: string;
    readonly admin: boolean;
  } | null;
  readonly keys: readonly DashboardKey[];
};

const loadDashboard = createServerFn({ method: "GET" }).handler(
  async (context): Promise<DashboardData> => {
    const request = requestFromContext(context);
    const auth = await getAuth(request);
    const session = await auth.api.getSession({ headers: request.headers });
    const baseUrl = new URL(request.url).origin;

    if (session === null) {
      return { baseUrl, user: null, keys: [] };
    }

    const user = {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      admin: session.user.admin === true,
    };
    if (!user.admin) {
      return { baseUrl, user, keys: [] };
    }

    await requireAdmin(request);
    const apiAuth = await getApiAuth();
    const keys = await Effect.runPromise(apiAuth.listKeys({ userId: user.id }));
    return { baseUrl, user, keys: keys.map(toDashboardKey) };
  },
);

const createKey = createServerFn({ method: "POST" })
  .inputValidator((input: unknown): { readonly name: string } => {
    if (
      typeof input !== "object" ||
      input === null ||
      !("name" in input) ||
      typeof input.name !== "string"
    ) {
      throw new Error("A key name is required.");
    }
    return { name: input.name };
  })
  .handler(async (context) => {
    const request = requestFromContext(context);
    const user = await requireAdmin(request);
    const apiAuth = await getApiAuth();
    const created = await Effect.runPromise(
      apiAuth.createKey({
        userId: user.id,
        name: context.data.name,
        permissions: { runs: ["create"] },
      }),
    );

    return {
      key: created.key,
      apiKey: toDashboardKey(created.apiKey),
    };
  });

const revokeKey = createServerFn({ method: "POST" })
  .inputValidator((input: unknown): { readonly id: string } => {
    if (
      typeof input !== "object" ||
      input === null ||
      !("id" in input) ||
      typeof input.id !== "string"
    ) {
      throw new Error("A key ID is required.");
    }
    return { id: input.id };
  })
  .handler(async (context) => {
    const request = requestFromContext(context);
    const user = await requireAdmin(request);
    const apiAuth = await getApiAuth();
    await Effect.runPromise(apiAuth.revokeKey({ userId: user.id, id: context.data.id }));
    return { id: context.data.id, revokedAt: new Date().toISOString() };
  });

export const Route = createFileRoute("/")({
  loader: () => loadDashboard(),
  component: Home,
});

function Home() {
  const dashboard = Route.useLoaderData();

  if (dashboard.user === null) {
    return <Landing />;
  }
  if (!dashboard.user.admin) {
    return <PrivateAccess email={dashboard.user.email} />;
  }

  return <KeyDashboard initial={{ ...dashboard, user: dashboard.user }} />;
}

function Landing() {
  return (
    <main className="landing-shell">
      <nav className="landing-nav" aria-label="Primary navigation">
        <a className="wordmark" href="/">
          <span className="wordmark-mark">YS</span>
          Your Shopper
        </a>
        <SignInButton compact />
      </nav>

      <section className="landing-hero">
        <div className="landing-copy">
          <p className="eyebrow">Shopping research for agents</p>
          <h1>Research the purchase, not just the product.</h1>
          <p className="lede landing-lede">
            Your Shopper turns a real buying brief into a source-backed recommendation—checking
            price, availability, compatibility, and the constraints that make a purchase work.
          </p>
          <div className="hero-actions">
            <SignInButton />
            <span>Private beta · admin access only</span>
          </div>
        </div>

        <div className="research-visual">
          <div className="research-grid-lines" aria-hidden="true" />
          <span className="source-chip source-chip-one" aria-hidden="true">
            Retailers
          </span>
          <span className="source-chip source-chip-two" aria-hidden="true">
            Manuals
          </span>
          <span className="source-chip source-chip-three" aria-hidden="true">
            Reviews
          </span>
          <span className="source-chip source-chip-four" aria-hidden="true">
            Stock
          </span>
          <span className="research-path research-path-one" aria-hidden="true" />
          <span className="research-path research-path-two" aria-hidden="true" />
          <article className="research-card" aria-label="Animated example of shopping research">
            <div className="research-card-topline">
              <span className="live-dot" />
              Researching
              <span className="research-status" aria-hidden="true">
                <span>Parsing brief</span>
                <span>Searching sources</span>
                <span>Checking constraints</span>
                <span>Recommendation ready</span>
              </span>
              <span className="visually-hidden">Sources checked</span>
            </div>
            <p className="research-prompt">
              “Find a quiet 60 cm dishwasher under $900 that ships to Stockholm and fits an IKEA
              Metod kitchen.”
            </p>
            <div className="constraint-grid">
              <ResearchSignal label="Budget" value="≤ $900" />
              <ResearchSignal label="Fit" value="60 cm / Metod" />
              <ResearchSignal label="Delivery" value="Stockholm" />
              <ResearchSignal label="Priority" value="Quiet cycles" />
            </div>
            <div className="recommendation-preview">
              <span>Recommendation</span>
              <strong>One clear pick, with caveats and alternatives.</strong>
              <p>Current prices and claims stay linked to their sources.</p>
            </div>
          </article>
        </div>
      </section>

      <section className="signal-strip" aria-label="Research coverage">
        <span>Live price</span>
        <span>Availability</span>
        <span>Compatibility</span>
        <span>Acquisition cost</span>
        <span>Primary sources</span>
      </section>

      <section className="landing-section">
        <div className="section-heading">
          <p className="eyebrow">Built for consequential choices</p>
          <h2>Shopping search should finish the job.</h2>
        </div>
        <div className="feature-grid">
          <Feature number="01" title="Understands the brief">
            It turns constraints and preferences into an explicit checklist before comparing
            products.
          </Feature>
          <Feature number="02" title="Researches what matters">
            It searches live sources for the details that determine whether you can actually buy and
            use the product.
          </Feature>
          <Feature number="03" title="Makes a defensible call">
            It gives agents a recommendation, alternatives, tradeoffs, and citations—not a pile of
            links.
          </Feature>
        </div>
      </section>

      <footer className="landing-footer">
        <p>Your Shopper</p>
        <span>Templar Labs · Private beta</span>
      </footer>
    </main>
  );
}

function SignInButton({ compact = false }: { readonly compact?: boolean }) {
  return (
    <form action="/api/auth/sign-in" method="get">
      <input name="returnTo" type="hidden" value="/" />
      <button className={compact ? "nav-button" : "primary-button hero-button"} type="submit">
        Admin sign in
      </button>
    </form>
  );
}

function ResearchSignal({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="constraint-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Feature({
  children,
  number,
  title,
}: {
  readonly children: React.ReactNode;
  readonly number: string;
  readonly title: string;
}) {
  return (
    <article className="feature-card">
      <span>{number}</span>
      <h3>{title}</h3>
      <p>{children}</p>
    </article>
  );
}

function PrivateAccess({ email }: { readonly email: string }) {
  return (
    <main className="page-shell centered-shell">
      <section className="hero-card auth-card">
        <p className="eyebrow">Private beta</p>
        <h1>Access is admin-only for now.</h1>
        <p className="lede">
          <strong>{email}</strong> is signed in, but this beta currently issues API keys only to
          administrators. Public access and billing will come later.
        </p>
        <form action="/api/auth/sign-out?returnTo=/" method="post">
          <button className="secondary-button access-signout" type="submit">
            Sign out
          </button>
        </form>
      </section>
    </main>
  );
}

function KeyDashboard({
  initial,
}: {
  readonly initial: DashboardData & { readonly user: NonNullable<DashboardData["user"]> };
}) {
  const createKeyFn = useServerFn(createKey);
  const revokeKeyFn = useServerFn(revokeKey);
  const [keys, setKeys] = useState(initial.keys);
  const [name, setName] = useState("Hermes agents");
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const keyNameId = useId();
  const endpoint = `${initial.baseUrl}/api/v1/runs`;

  const handleCreate = () => {
    setError(null);
    startTransition(async () => {
      try {
        const created = await createKeyFn({ data: { name } });
        setKeys((current) => [created.apiKey, ...current]);
        setRevealedKey(created.key);
        setCopied(false);
      } catch {
        setError("The API key could not be created.");
      }
    });
  };

  const handleRevoke = (id: string) => {
    setError(null);
    startTransition(async () => {
      try {
        const result = await revokeKeyFn({ data: { id } });
        setKeys((current) =>
          current.map((key) =>
            key.id === result.id ? { ...key, revokedAt: result.revokedAt } : key,
          ),
        );
      } catch {
        setError("The API key could not be revoked.");
      }
    });
  };

  const handleCopy = () => {
    if (revealedKey === null) {
      return;
    }
    void navigator.clipboard
      .writeText(revealedKey)
      .then(() => setCopied(true))
      .catch(() => setError("Copy failed. Select the key and copy it manually."));
  };

  return (
    <main className="page-shell">
      <header className="topbar">
        <a className="wordmark" href="/">
          <span className="wordmark-mark">YS</span>
          Your Shopper
        </a>
        <div className="session-actions">
          <p className="session-label">
            Admin · <strong>{initial.user.email}</strong>
          </p>
          <form action="/api/auth/sign-out?returnTo=/" method="post">
            <button className="text-button" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </header>

      <section className="hero-copy dashboard-hero">
        <p className="eyebrow">Admin dashboard</p>
        <h1>Connect an agent.</h1>
        <p className="lede">
          Create a credential for the shopping research API. Each run uses the evaluated Your
          Shopper harness and carries a hard model-and-search cost ceiling.
        </p>
      </section>

      <div className="dashboard-grid">
        <section className="panel create-panel">
          <p className="panel-kicker">Credential</p>
          <h2>Create an API key</h2>
          <label htmlFor={keyNameId}>Key name</label>
          <input
            id={keyNameId}
            maxLength={80}
            onChange={(event) => setName(event.currentTarget.value)}
            value={name}
          />
          <div className="permission-row">
            <span>Permission</span>
            <code>runs:create</code>
          </div>
          <button
            className="primary-button"
            disabled={isPending || name.trim() === ""}
            onClick={handleCreate}
            type="button"
          >
            {isPending ? "Working…" : "Create key"}
          </button>
        </section>

        <section className="panel test-panel">
          <p className="panel-kicker">Integration</p>
          <h2>Call the shopping API</h2>
          <p className="supporting-copy">
            The full secret appears once. Store it as <code>YOUR_SHOPPER_API_KEY</code> in your
            agent’s secret store.
          </p>
          {revealedKey === null ? (
            <div className="empty-secret">Create a key to reveal the credential.</div>
          ) : (
            <>
              <div className="secret-box">
                <code>{revealedKey}</code>
              </div>
              <button className="secondary-button" onClick={handleCopy} type="button">
                {copied ? "Copied" : "Copy key"}
              </button>
            </>
          )}
          <div className="endpoint-box">
            <span>POST</span>
            <code>{endpoint}</code>
          </div>
          <pre className="request-example">{`{
  "intent": "Find a quiet dishwasher under $900",
  "context": "Must ship to Stockholm and fit IKEA Metod"
}`}</pre>
        </section>
      </div>

      {error === null ? null : <p className="error-banner">{error}</p>}

      <section className="panel keys-panel">
        <div className="panel-heading">
          <div>
            <p className="panel-kicker">Credentials</p>
            <h2>API keys</h2>
          </div>
          <span className="count-pill">{keys.length}</span>
        </div>
        {keys.length === 0 ? (
          <p className="empty-list">No keys yet.</p>
        ) : (
          <div className="key-list">
            {keys.map((key) => {
              const revoked = key.revokedAt !== null;
              return (
                <article className="key-row" data-revoked={revoked} key={key.id}>
                  <div>
                    <div className="key-title-row">
                      <strong>{key.name}</strong>
                      <span className="status-pill">{revoked ? "Revoked" : "Active"}</span>
                    </div>
                    <code>{key.start}…</code>
                    <p>
                      Created {formatDate(key.createdAt)} · Expires {formatDate(key.expiresAt)} ·
                      Last used {formatDate(key.lastUsedAt)}
                    </p>
                  </div>
                  <button
                    className="text-button danger-button"
                    disabled={revoked || isPending}
                    onClick={() => handleRevoke(key.id)}
                    type="button"
                  >
                    Revoke
                  </button>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}

function requestFromContext(context: unknown): Request {
  const request = (context as { readonly request?: Request }).request;
  if (request === undefined) {
    throw new Error("Request context unavailable.");
  }
  return request;
}

function toDashboardKey(key: {
  readonly id: string;
  readonly name: string;
  readonly start: string;
  readonly permissions: Readonly<Record<string, readonly string[]>>;
  readonly createdAt: Date;
  readonly expiresAt: Date | null;
  readonly lastUsedAt: Date | null;
  readonly revokedAt: Date | null;
}): DashboardKey {
  return {
    id: key.id,
    name: key.name,
    start: key.start,
    permissions: Object.entries(key.permissions).flatMap(([resource, actions]) =>
      actions.map((action) => `${resource}:${action}`),
    ),
    createdAt: key.createdAt.toISOString(),
    expiresAt: key.expiresAt?.toISOString() ?? null,
    lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
    revokedAt: key.revokedAt?.toISOString() ?? null,
  };
}

function formatDate(value: string | null): string {
  if (value === null) {
    return "never";
  }
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(value));
}
