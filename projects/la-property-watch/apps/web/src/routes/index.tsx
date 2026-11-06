import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowUpRight,
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Download,
  ExternalLink,
  FileSearch2,
  Layers3,
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
import {
  type DashboardData,
  formatParcelId,
  type ResearchRecord,
  type SignalType,
} from "../lib/model.ts";

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
        <h1>Property Watch</h1>
        <p className="auth-lede">
          A source-first research desk for early property-distress signals and published sale
          events.
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
        <p>Early county tax-delinquency signals</p>
        <span className="context-number">02</span>
        <p>Later-stage notices and published sale events</p>
        <span className="context-number">03</span>
        <p>Jurisdiction-scoped identity and source provenance</p>
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
      <h1>This workspace has a restricted account allowlist.</h1>
      <p className="muted">The verified account {email} is not authorized for Property Watch.</p>
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
  const [signalType, setSignalType] = useState<"all" | SignalType>("all");
  const [jurisdiction, setJurisdiction] = useState("all");
  const [status, setStatus] = useState<"all" | ResearchRecord["status"]>("all");
  const [selected, setSelected] = useState<ResearchRecord | null>(null);
  const [refreshState, setRefreshState] = useState<"idle" | "queueing" | "running">("idle");
  const [notice, setNotice] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  const jurisdictions = useMemo(
    () =>
      [...new Map(data.records.map((record) => [record.jurisdictionId, record.jurisdictionName]))]
        .map(([id, name]) => ({ id, name }))
        .toSorted((left, right) => left.name.localeCompare(right.name)),
    [data.records],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return data.records.filter((record) => {
      if (signalType !== "all" && record.signalType !== signalType) {
        return false;
      }
      if (jurisdiction !== "all" && record.jurisdictionId !== jurisdiction) {
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
        record.sourceRecordId,
        formatParcelId(record.apn, record.jurisdictionId),
        record.jurisdictionName,
        record.trusteeSaleNumber,
        record.itemNumber,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    });
  }, [data.records, jurisdiction, query, signalType, status]);

  const counts = useMemo(
    () => ({
      early: data.records.filter((record) => record.signalType === "tax_delinquency").length,
      power: data.records.filter((record) => record.signalType === "power_to_sell").length,
      scheduled: data.records.filter((record) => record.signalType.startsWith("scheduled_")).length,
      markets: new Set(data.records.map((record) => record.jurisdictionId)).size,
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
          : "Refresh is queued or running in the background. Reload to see its progress.",
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
        <a className="wordmark" href="/" aria-label="Property Watch home">
          <span className="wordmark-icon">
            <MapPin size={19} />
          </span>
          <span>Property Watch</span>
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
            <p className="eyebrow">Multi-market · Source intelligence</p>
            <h1>
              Find distress earlier,
              <br />
              <em>with the paper trail.</em>
            </h1>
            <p className="hero-copy">
              Start with tax delinquency and statutory power-to-sell signals, then follow later
              notices and sale events without treating a lien or delinquency as imminent
              foreclosure.
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
            <p>Sources run independently with bounded downloads and explicit observation dates.</p>
          </div>
        </section>

        {notice ? (
          <div className="notice" role="status">
            <Clock3 size={17} />
            {notice}
          </div>
        ) : null}

        <section className="metric-grid" aria-label="Record summary">
          <Metric label="3-year tax delinquency" value={counts.early} icon={<Clock3 size={18} />} />
          <Metric
            label="Power-to-sell notices"
            value={counts.power}
            icon={<Building2 size={18} />}
          />
          <Metric
            label="Published sale events"
            value={counts.scheduled}
            icon={<CalendarDays size={18} />}
          />
          <Metric
            label="Market jurisdictions"
            value={counts.markets}
            icon={<Layers3 size={18} />}
          />
        </section>

        <section className="coverage-strip" aria-label="Source coverage">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Coverage map</p>
              <h2>What this workspace can see</h2>
            </div>
            <span>Coverage is source-specific, not statewide</span>
          </div>
          <div className="coverage-grid">
            <article>
              <strong>Orange County · earlier tax distress</strong>
              <p>
                Three-year delinquency and impending power-to-sell publications. Both are historical
                snapshots; neither is a scheduled auction.
              </p>
            </article>
            <article>
              <strong>Los Angeles County · later stages</strong>
              <p>Official tax-auction lists and published mortgage trustee-sale notices.</p>
            </article>
            <article className="coverage-gap">
              <strong>Known gaps</strong>
              <p>
                No ingestible public mechanic-lien, HOA-lien, or utility-lien source has been
                verified. Missing coverage does not mean no lien exists.
              </p>
            </article>
          </div>
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
                aria-label="Search records"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search address, parcel ID, source record…"
              />
            </label>
            <label>
              <span className="sr-only">Signal stage</span>
              <select
                aria-label="Signal stage"
                value={signalType}
                onChange={(event) => setSignalType(event.target.value as typeof signalType)}
              >
                <option value="all">All signal stages</option>
                <option value="tax_delinquency">Tax delinquency · early</option>
                <option value="power_to_sell">Power to sell · statutory</option>
                <option value="notice_of_default">Notice of default</option>
                <option value="recorded_lien">Recorded lien</option>
                <option value="scheduled_trustee_sale">Scheduled trustee sale</option>
                <option value="scheduled_tax_sale">Scheduled tax sale</option>
              </select>
            </label>
            <label>
              <span className="sr-only">Market jurisdiction</span>
              <select
                aria-label="Market jurisdiction"
                value={jurisdiction}
                onChange={(event) => setJurisdiction(event.target.value)}
              >
                <option value="all">All markets</option>
                {jurisdictions.map((market) => (
                  <option value={market.id} key={market.id}>
                    {market.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="sr-only">Published status</span>
              <select
                aria-label="Published status"
                value={status}
                onChange={(event) => setStatus(event.target.value as typeof status)}
              >
                <option value="all">All statuses</option>
                <option value="signal_status_unverified">Historical signal</option>
                <option value="scheduled_as_published">Future date published</option>
                <option value="past_outcome_unverified">Past · outcome unverified</option>
                <option value="date_not_found">Sale date not found</option>
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
                  ? "Run a protected source refresh to import public-source observations. Production never starts with fictional records."
                  : "Try a broader address, parcel ID, signal stage, market, or status."}
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
            <strong>Distress signal, not foreclosure prediction.</strong>
            <p>
              Delinquency, lien, default, and power-to-sell records do not prove that foreclosure is
              imminent. Published dates and balances may be stale, redeemed, postponed, cancelled,
              or completed after observation. Confirm the linked source before relying on any
              record.
            </p>
          </div>
        </section>
      </main>
      <footer>
        <span>Templar Labs · Property Watch</span>
        <span>Private research workspace · No contact lookup or outreach features</span>
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
      <div className={`sale-badge ${record.signalType}`}>{signalCode(record.signalType)}</div>
      <div className="record-address">
        <strong>{address}</strong>
        <span>
          {[
            record.city ?? record.assessorCity,
            record.state ?? record.assessorState,
            record.zip ?? record.assessorZip,
          ]
            .filter(Boolean)
            .join(" ") || record.jurisdictionName}
        </span>
      </div>
      <div className="record-apn">
        <span>Source record ID</span>
        <strong>{record.sourceRecordId}</strong>
      </div>
      <div className="record-date">
        <span>{eventLabel(record)}</span>
        <strong>{formatRecordDate(record)}</strong>
      </div>
      <StatusPill status={record.status} />
      <ArrowUpRight className="row-arrow" size={18} />
    </button>
  );
}

function RecordDetail({ record, onClose }: { record: ResearchRecord; onClose: () => void }) {
  const amount =
    record.signalType === "tax_delinquency" || record.signalType === "power_to_sell"
      ? record.delinquentAmountCents
      : (record.minimumBidCents ?? record.unpaidBalanceCents);
  const amountLabel =
    record.signalType === "tax_delinquency" || record.signalType === "power_to_sell"
      ? "Amount due as of source date"
      : record.signalType === "scheduled_tax_sale"
        ? "Minimum bid"
        : "Published unpaid balance";
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
          {signalLabel(record.signalType)} · {record.jurisdictionName}
        </p>
        <h2>{record.address ?? record.assessorAddress ?? "Address not published"}</h2>
        <div className="detail-status">
          <StatusPill status={record.status} />
          <span>Observed {formatTimestamp(record.observedAt)}</span>
        </div>
        <dl className="detail-grid">
          <Detail label="Source record ID" value={record.sourceRecordId} />
          <Detail
            label="Normalized parcel ID"
            value={
              record.apn
                ? formatParcelId(record.apn, record.jurisdictionId)
                : "Not normalized · source value preserved"
            }
          />
          <Detail label={eventLabel(record)} value={formatRecordDate(record)} />
          <Detail label={amountLabel} value={formatMoney(amount)} />
          <Detail label="Source as-of date" value={formatCalendarDate(record.sourceAsOfDate)} />
          <Detail label="First publication" value={formatCalendarDate(record.sourcePublishedAt)} />
          <Detail
            label={record.signalType.startsWith("scheduled_") ? "Sale record" : "Source item"}
            value={record.itemNumber ?? record.trusteeSaleNumber ?? record.sourceRecordId}
          />
          <Detail label="Observed at" value={formatTimestamp(record.observedAt)} />
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
        {!record.signalType.startsWith("scheduled_") ? (
          <section className="signal-note">
            <strong>No auction date is represented by this signal.</strong>
            <p>
              It is a historical public-record observation. Current balance, redemption, lien, and
              foreclosure status have not been independently verified.
            </p>
          </section>
        ) : null}
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
    signal_status_unverified: "Historical signal · status unknown",
    scheduled_as_published: "Scheduled as published",
    past_outcome_unverified: "Past · outcome unverified",
    date_not_found: "Sale date not found",
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

function signalLabel(signalType: SignalType): string {
  return {
    tax_delinquency: "Three-year tax delinquency",
    power_to_sell: "Impending power to sell",
    recorded_lien: "Recorded lien",
    notice_of_default: "Notice of default",
    scheduled_trustee_sale: "Scheduled trustee sale",
    scheduled_tax_sale: "Scheduled tax sale",
  }[signalType];
}

function signalCode(signalType: SignalType): string {
  return {
    tax_delinquency: "3YR",
    power_to_sell: "PTS",
    recorded_lien: "LIEN",
    notice_of_default: "NOD",
    scheduled_trustee_sale: "TRUST",
    scheduled_tax_sale: "TAX",
  }[signalType];
}

function eventLabel(record: ResearchRecord): string {
  return {
    tax_delinquency: "Tax-default date",
    power_to_sell: "Power-to-sell date · not auction",
    recorded_lien: "Recorded event date",
    notice_of_default: "Default notice date",
    scheduled_trustee_sale: "Published sale date",
    scheduled_tax_sale: "Published sale date",
  }[record.signalType];
}

function formatRecordDate(record: ResearchRecord): string {
  const value = record.signalType.startsWith("scheduled_")
    ? record.scheduledDate
    : record.eventDate;
  const formatted = formatCalendarDate(value);
  return record.signalType.startsWith("scheduled_") && record.scheduledTime && value
    ? `${formatted} · ${formatTime(record.scheduledTime)} PT`
    : formatted;
}

function formatCalendarDate(value: string | null): string {
  if (!value) {
    return "Not published";
  }
  const day = value.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  const date = new Date(day ? `${day}T12:00:00Z` : value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
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
        maximumFractionDigits: 2,
      }).format(cents / 100);
}
