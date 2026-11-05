import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowUpRight,
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Database,
  Download,
  ExternalLink,
  FileSearch2,
  LoaderCircle,
  MapPin,
  RefreshCw,
  Search,
  ShieldCheck,
  TriangleAlert,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { loadApp } from "../lib/functions.ts";
import { type DashboardData, formatApn, type ResearchRecord } from "../lib/model.ts";

export const Route = createFileRoute("/")({
  loader: () => loadApp(),
  component: App,
});

function App() {
  const loaded = Route.useLoaderData();
  if (loaded.mode === "signed_out") {
    return <SignIn />;
  }
  if (loaded.mode === "forbidden") {
    return <Forbidden email={loaded.email} />;
  }
  return <Dashboard initial={loaded} viewerName={loaded.viewerName} />;
}

function SignIn() {
  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="brand-mark">
          <MapPin size={24} aria-hidden="true" />
        </div>
        <p className="eyebrow">Templar Labs · Private workspace</p>
        <h1>LA Property Watch</h1>
        <p className="auth-lede">
          A source-first research desk for Los Angeles County tax-default and mortgage trustee
          sales.
        </p>
        <div className="auth-rule" />
        <div className="security-note">
          <ShieldCheck size={20} aria-hidden="true" />
          <div>
            <strong>Restricted access</strong>
            <span>
              Verified Google account required. Every data request and export is checked on the
              server.
            </span>
          </div>
        </div>
        <a className="button primary wide" href="/api/auth/sign-in?returnTo=/">
          Continue with Google <ArrowUpRight size={17} aria-hidden="true" />
        </a>
        <p className="fine-print">No public records endpoint is exposed by this application.</p>
      </section>
      <aside className="auth-context" aria-label="Workspace scope">
        <span className="context-number">01</span>
        <p>Official LA County tax auction lists</p>
        <span className="context-number">02</span>
        <p>Published trustee-sale notices</p>
        <span className="context-number">03</span>
        <p>Provenance and honest source status</p>
      </aside>
    </main>
  );
}

function Forbidden({ email }: { email: string }) {
  return (
    <main className="center-page">
      <div className="error-mark">
        <ShieldCheck size={26} />
      </div>
      <p className="eyebrow">Access denied</p>
      <h1>This workspace has a one-account allowlist.</h1>
      <p className="muted">The verified account {email} is not authorized for LA Property Watch.</p>
      <form action="/api/auth/sign-out?returnTo=/" method="post">
        <button className="button primary" type="submit">
          Sign out and use another account
        </button>
      </form>
    </main>
  );
}

type ReadyData = Extract<Awaited<ReturnType<typeof loadApp>>, { mode: "ready" }>;

function Dashboard({ initial, viewerName }: { initial: ReadyData; viewerName: string }) {
  const [data, setData] = useState<DashboardData>(initial);
  const [query, setQuery] = useState("");
  const [saleType, setSaleType] = useState<"all" | ResearchRecord["saleType"]>("all");
  const [status, setStatus] = useState<"all" | ResearchRecord["status"]>("all");
  const [selected, setSelected] = useState<ResearchRecord | null>(null);
  const [refreshState, setRefreshState] = useState<"idle" | "queueing" | "running">("idle");
  const [notice, setNotice] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return data.records.filter((record) => {
      if (saleType !== "all" && record.saleType !== saleType) {
        return false;
      }
      if (status !== "all" && record.status !== status) {
        return false;
      }
      if (!needle) {
        return true;
      }
      return [
        record.address,
        record.city,
        record.zip,
        record.apn,
        formatApn(record.apn),
        record.trusteeSaleNumber,
        record.itemNumber,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    });
  }, [data.records, query, saleType, status]);

  const counts = useMemo(
    () => ({
      total: data.records.length,
      tax: data.records.filter((record) => record.saleType === "tax_default").length,
      trustee: data.records.filter((record) => record.saleType === "trustee").length,
      upcoming: data.records.filter((record) => record.status === "scheduled_as_published").length,
    }),
    [data.records],
  );

  async function refresh() {
    setNotice(null);
    setRefreshState("queueing");
    try {
      const response = await fetch("/api/research/refresh", {
        method: "POST",
        credentials: "same-origin",
      });
      const body = (await response.json()) as { job?: { id: string }; error?: string };
      if (!response.ok || !body.job) {
        throw new Error(body.error ?? "Refresh could not be queued.");
      }
      setNotice(
        "Refresh queued. The import runner checks about every 15 minutes; scheduling delays are possible.",
      );
      setRefreshState("running");
      const completed = await pollRefresh(body.job.id, setData);
      setNotice(
        completed
          ? "Source refresh finished. The workspace now reflects the latest successful observations."
          : "Refresh is queued or running in the background. The import runner checks about every 15 minutes; reload to see its progress.",
      );
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "Refresh could not be queued.");
    } finally {
      setRefreshState("idle");
    }
  }

  return (
    <div className="app-shell" data-hydrated={hydrated ? "true" : "false"}>
      <header className="topbar">
        <a className="wordmark" href="/" aria-label="LA Property Watch home">
          <span className="wordmark-icon">
            <MapPin size={19} />
          </span>
          <span>LA Property Watch</span>
        </a>
        <div className="top-actions">
          <span className="private-pill">
            <ShieldCheck size={14} /> Private
          </span>
          <span className="viewer">{viewerName}</span>
          <form action="/api/auth/sign-out?returnTo=/" method="post">
            <button className="text-button" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </header>

      <main>
        <section className="hero">
          <div>
            <p className="eyebrow">Los Angeles County · Source intelligence</p>
            <h1>
              Foreclosure research,
              <br />
              <em>with the paper trail.</em>
            </h1>
            <p className="hero-copy">
              Published sale leads from official tax lists and legal notices, separated by sale type
              and labeled by observation—not assumed availability.
            </p>
          </div>
          <div className="hero-actions">
            <button
              className="button primary"
              type="button"
              onClick={refresh}
              disabled={refreshState !== "idle"}
            >
              {refreshState === "idle" ? (
                <RefreshCw size={17} />
              ) : (
                <LoaderCircle className="spin" size={17} />
              )}
              {refreshState === "queueing"
                ? "Queueing…"
                : refreshState === "running"
                  ? "Refreshing…"
                  : "Refresh sources"}
            </button>
            <a className="button secondary" href="/api/research/export.csv">
              <Download size={17} /> Export CSV
            </a>
            <p>Refresh runs asynchronously and independently tracks each source.</p>
          </div>
        </section>

        {notice ? (
          <div className="notice" role="status">
            <Clock3 size={17} />
            {notice}
          </div>
        ) : null}

        <section className="metric-grid" aria-label="Record summary">
          <Metric label="Total observations" value={counts.total} icon={<Database size={18} />} />
          <Metric label="Tax-default list" value={counts.tax} icon={<Building2 size={18} />} />
          <Metric label="Trustee notices" value={counts.trustee} icon={<FileSearch2 size={18} />} />
          <Metric
            label="Future published dates"
            value={counts.upcoming}
            icon={<CalendarDays size={18} />}
          />
        </section>

        <section className="source-strip" aria-label="Source status">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Operations</p>
              <h2>Source status</h2>
            </div>
            <span>Generated {formatTimestamp(data.generatedAt)}</span>
          </div>
          <div className="source-grid">
            {data.sources.length === 0 ? (
              <div className="empty-source">
                <Clock3 size={20} />
                <span>No ingestion run yet. Start the first protected refresh.</span>
              </div>
            ) : (
              data.sources.map((source) => (
                <article className="source-card" key={source.sourceId}>
                  <div className={`status-dot ${source.status}`} />
                  <div>
                    <h3>{source.sourceName}</h3>
                    <p>
                      {source.recordsUpserted.toLocaleString()} records · {source.status}
                    </p>
                    <small>
                      {source.finishedAt
                        ? `Finished ${formatTimestamp(source.finishedAt)}`
                        : "Run in progress"}
                    </small>
                    {source.error ? <small className="source-warning">{source.error}</small> : null}
                  </div>
                  <a
                    href={source.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Open ${source.sourceName}`}
                  >
                    <ExternalLink size={16} />
                  </a>
                </article>
              ))
            )}
          </div>
        </section>

        <section className="records-section">
          <div className="section-heading records-heading">
            <div>
              <p className="eyebrow">Research file</p>
              <h2>Property observations</h2>
            </div>
            <span>{filtered.length.toLocaleString()} shown</span>
          </div>
          <div className="filters">
            <label className="search-field">
              <Search size={17} />
              <span className="sr-only">Search records</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search address, APN, sale number…"
              />
            </label>
            <label>
              <span className="sr-only">Sale type</span>
              <select
                value={saleType}
                onChange={(event) => setSaleType(event.target.value as typeof saleType)}
              >
                <option value="all">All sale types</option>
                <option value="tax_default">Tax-default</option>
                <option value="trustee">Mortgage trustee</option>
              </select>
            </label>
            <label>
              <span className="sr-only">Published status</span>
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value as typeof status)}
              >
                <option value="all">All statuses</option>
                <option value="scheduled_as_published">Future date published</option>
                <option value="past_outcome_unverified">Past · outcome unverified</option>
                <option value="date_not_found">Date not found</option>
              </select>
            </label>
          </div>

          {filtered.length === 0 ? (
            <div className="empty-state">
              <FileSearch2 size={30} />
              <h3>
                {data.records.length === 0
                  ? "No live observations yet"
                  : "No records match these filters"}
              </h3>
              <p>
                {data.records.length === 0
                  ? "Run a protected source refresh to import current public-source observations. Production never starts with fictional records."
                  : "Try a broader address, APN, sale type, or status."}
              </p>
            </div>
          ) : (
            <div className="record-list">
              {filtered.map((record) => (
                <RecordRow key={record.id} record={record} onOpen={() => setSelected(record)} />
              ))}
            </div>
          )}
        </section>

        <section className="disclaimer">
          <TriangleAlert size={20} />
          <div>
            <strong>Research leads, not sale confirmation.</strong>
            <p>
              Published dates may be postponed, cancelled, redeemed, or completed after observation.
              “Past” always means the outcome has not been verified here. Confirm against the linked
              source and official sale-status channel before relying on any record.
            </p>
          </div>
        </section>
      </main>
      <footer>
        <span>Templar Labs · LA Property Watch</span>
        <span>Private research workspace · No outreach features</span>
      </footer>
      {selected ? <RecordDetail record={selected} onClose={() => setSelected(null)} /> : null}
    </div>
  );
}

function Metric({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <article className="metric">
      <div>
        {icon}
        <span>{label}</span>
      </div>
      <strong>{value.toLocaleString()}</strong>
    </article>
  );
}

function RecordRow({ record, onOpen }: { record: ResearchRecord; onOpen: () => void }) {
  const address = record.address ?? record.assessorAddress ?? "Address not published";
  return (
    <button className="record-row" type="button" onClick={onOpen}>
      <div className={`sale-badge ${record.saleType}`}>
        {record.saleType === "tax_default" ? "TAX" : "TRUST"}
      </div>
      <div className="record-address">
        <strong>{address}</strong>
        <span>
          {[
            record.city ?? record.assessorCity,
            record.state ?? record.assessorState,
            record.zip ?? record.assessorZip,
          ]
            .filter(Boolean)
            .join(" ") || "Los Angeles County"}
        </span>
      </div>
      <div className="record-apn">
        <span>APN</span>
        <strong>{formatApn(record.apn)}</strong>
      </div>
      <div className="record-date">
        <span>Published sale date</span>
        <strong>{formatSaleDate(record)}</strong>
      </div>
      <StatusPill status={record.status} />
      <ArrowUpRight className="row-arrow" size={18} />
    </button>
  );
}

function RecordDetail({ record, onClose }: { record: ResearchRecord; onClose: () => void }) {
  return (
    <div className="detail-backdrop">
      <aside
        className="detail-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Property observation details"
      >
        <button className="close-button" type="button" onClick={onClose} aria-label="Close details">
          <X size={20} />
        </button>
        <p className="eyebrow">
          {record.saleType === "tax_default"
            ? "Tax-default auction list"
            : "Mortgage trustee notice"}
        </p>
        <h2>{record.address ?? record.assessorAddress ?? "Address not published"}</h2>
        <div className="detail-status">
          <StatusPill status={record.status} />
          <span>Observed {formatTimestamp(record.observedAt)}</span>
        </div>
        <dl className="detail-grid">
          <Detail label="APN" value={formatApn(record.apn)} />
          <Detail label="Published sale date" value={formatSaleDate(record)} />
          <Detail
            label={record.saleType === "tax_default" ? "Minimum bid" : "Published unpaid balance"}
            value={formatMoney(record.minimumBidCents ?? record.unpaidBalanceCents)}
          />
          <Detail
            label={record.saleType === "tax_default" ? "Auction item" : "Trustee sale no."}
            value={record.itemNumber ?? record.trusteeSaleNumber ?? "Not published"}
          />
          {record.trusteeName ? (
            <Detail label="Appointed trustee" value={record.trusteeName} />
          ) : null}
          {record.saleVerificationPhone ? (
            <Detail label="Sale-status line (not homeowner)" value={record.saleVerificationPhone} />
          ) : null}
          {record.salePlace ? (
            <Detail label="Published sale place" value={record.salePlace} wide />
          ) : null}
        </dl>
        {record.assessorAddress ? (
          <section className="provenance-box">
            <p className="eyebrow">Assessor enrichment</p>
            <strong>{record.assessorAddress}</strong>
            <span>
              {[record.assessorCity, record.assessorState, record.assessorZip]
                .filter(Boolean)
                .join(" ")}
            </span>
            <small>
              Kept separate from the published notice address. Observed{" "}
              {record.assessorObservedAt ? formatTimestamp(record.assessorObservedAt) : "—"}.
            </small>
          </section>
        ) : null}
        <section className="excerpt">
          <p className="eyebrow">Published excerpt</p>
          <p>{record.rawExcerpt}</p>
        </section>
        <div className="source-links">
          <a className="button primary" href={record.sourceUrl} target="_blank" rel="noreferrer">
            Open source <ExternalLink size={16} />
          </a>
          {record.sourceDocumentUrl ? (
            <a
              className="button secondary"
              href={record.sourceDocumentUrl}
              target="_blank"
              rel="noreferrer"
            >
              Open source document
            </a>
          ) : null}
        </div>
      </aside>
    </div>
  );
}

function Detail({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? "wide" : ""}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function StatusPill({ status }: { status: ResearchRecord["status"] }) {
  const labels = {
    scheduled_as_published: "Scheduled as published",
    past_outcome_unverified: "Past · outcome unverified",
    date_not_found: "Date not found",
  } as const;
  return (
    <span className={`status-pill ${status}`}>
      {status === "scheduled_as_published" ? <CheckCircle2 size={13} /> : <Clock3 size={13} />}
      {labels[status]}
    </span>
  );
}

async function pollRefresh(jobId: string, update: (data: DashboardData) => void): Promise<boolean> {
  for (let attempt = 0; attempt < 48; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2_500));
    const response = await fetch("/api/research/data", { credentials: "same-origin" });
    if (!response.ok) {
      throw new Error("Could not read refresh status.");
    }
    const dashboard = (await response.json()) as DashboardData;
    update(dashboard);
    const job = dashboard.refreshJobs.find((entry) => entry.id === jobId);
    if (job && !["queued", "running"].includes(job.status)) {
      return true;
    }
  }
  return false;
}

function formatSaleDate(record: ResearchRecord): string {
  if (!record.scheduledDate) {
    return "Not found";
  }
  const date = new Date(`${record.scheduledDate}T12:00:00Z`);
  const formatted = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
  return record.scheduledTime ? `${formatted} · ${formatTime(record.scheduledTime)} PT` : formatted;
}

function formatTime(value: string): string {
  const [hour, minute] = value.split(":").map(Number);
  const suffix = (hour ?? 0) >= 12 ? "PM" : "AM";
  const displayHour = (hour ?? 0) % 12 || 12;
  return `${displayHour}:${String(minute ?? 0).padStart(2, "0")} ${suffix}`;
}

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Los_Angeles",
    timeZoneName: "short",
  }).format(new Date(value));
}

function formatMoney(cents: number | null): string {
  return cents === null
    ? "Not published"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      }).format(cents / 100);
}
