import { createFileRoute } from "@tanstack/react-router";
import { createServerFn, useServerFn } from "@tanstack/react-start";
import { Effect } from "effect";
import { useId, useState, useTransition } from "react";
import { getApiAuth } from "../lib/api-auth.server.ts";
import { getAuth } from "../lib/auth.server.ts";

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
  } | null;
  readonly keys: readonly DashboardKey[];
};

const loadDashboard = createServerFn({ method: "GET" }).handler(
  async (context): Promise<DashboardData> => {
    const request = requestFromContext(context);
    const auth = await getAuth(request);
    const session = await auth.api.getSession({ headers: request.headers });

    if (session === null) {
      return {
        baseUrl: new URL(request.url).origin,
        user: null,
        keys: [],
      };
    }

    const apiAuth = await getApiAuth();
    const keys = await Effect.runPromise(apiAuth.listKeys({ userId: session.user.id }));
    return {
      baseUrl: new URL(request.url).origin,
      user: {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
      },
      keys: keys.map(toDashboardKey),
    };
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
    const user = await requireUser(request);
    const apiAuth = await getApiAuth();
    const created = await Effect.runPromise(
      apiAuth.createKey({
        userId: user.id,
        name: context.data.name,
        permissions: { hello: ["read"] },
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
    const user = await requireUser(request);
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
    return <SignedOut />;
  }

  return <KeyDashboard initial={{ ...dashboard, user: dashboard.user }} />;
}

function SignedOut() {
  return (
    <main className="page-shell centered-shell">
      <section className="hero-card auth-card">
        <p className="eyebrow">Your Shopper</p>
        <h1>Give your agent a key.</h1>
        <p className="lede">
          This tiny app dogfoods secure, app-local API keys. Sign in to create one and call the
          protected hello endpoint.
        </p>
        <form action="/api/auth/sign-in" method="get">
          <input name="returnTo" type="hidden" value="/" />
          <button className="primary-button" type="submit">
            Continue with Google
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
  const [name, setName] = useState("My agent");
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [apiResult, setApiResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const keyNameId = useId();
  const endpoint = `${initial.baseUrl}/api/v1/hello`;

  const handleCreate = () => {
    setError(null);
    setApiResult(null);
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

  const handleTest = () => {
    if (revealedKey === null) {
      return;
    }
    setError(null);
    setApiResult(null);
    startTransition(async () => {
      try {
        const response = await fetch(endpoint, {
          headers: { authorization: `Bearer ${revealedKey}` },
        });
        setApiResult(`${response.status} ${JSON.stringify(await response.json())}`);
      } catch {
        setError("The protected endpoint could not be reached.");
      }
    });
  };

  return (
    <main className="page-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Your Shopper</p>
          <p className="session-label">
            Signed in as <strong>{initial.user.email}</strong>
          </p>
        </div>
        <form action="/api/auth/sign-out?returnTo=/" method="post">
          <button className="text-button" type="submit">
            Sign out
          </button>
        </form>
      </header>

      <section className="hero-copy">
        <h1>API access, end to end.</h1>
        <p className="lede">
          Create a key from an authenticated session, then use it as a Bearer credential against a
          server route that knows nothing about your browser session.
        </p>
      </section>

      <div className="dashboard-grid">
        <section className="panel create-panel">
          <p className="panel-kicker">Step 1</p>
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
            <code>hello:read</code>
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
          <p className="panel-kicker">Step 2</p>
          <h2>Call the protected API</h2>
          <p className="supporting-copy">
            The full secret appears once. Copy it into an agent secret store or test it here.
          </p>
          {revealedKey === null ? (
            <div className="empty-secret">Create a key to reveal the credential.</div>
          ) : (
            <>
              <div className="secret-box">
                <code>{revealedKey}</code>
              </div>
              <div className="button-row">
                <button className="secondary-button" onClick={handleCopy} type="button">
                  {copied ? "Copied" : "Copy key"}
                </button>
                <button
                  className="primary-button compact-button"
                  disabled={isPending}
                  onClick={handleTest}
                  type="button"
                >
                  Test endpoint
                </button>
              </div>
            </>
          )}
          <div className="endpoint-box">
            <span>GET</span>
            <code>{endpoint}</code>
          </div>
          {apiResult === null ? null : <pre className="result-box">{apiResult}</pre>}
        </section>
      </div>

      {error === null ? null : <p className="error-banner">{error}</p>}

      <section className="panel keys-panel">
        <div className="panel-heading">
          <div>
            <p className="panel-kicker">Credentials</p>
            <h2>Your API keys</h2>
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

async function requireUser(request: Request) {
  const auth = await getAuth(request);
  const session = await auth.api.getSession({ headers: request.headers });
  if (session === null) {
    throw new Error("Unauthorized.");
  }
  return session.user;
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
