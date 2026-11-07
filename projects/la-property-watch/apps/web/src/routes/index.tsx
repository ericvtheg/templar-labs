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
import { useEffect, useState } from "react";
import { authFailure } from "../lib/auth-errors.ts";
import { loadApp } from "../lib/functions.ts";
import {
  type DashboardData,
  formatParcelId,
  type PropertyDetail as PropertyDetailData,
  type RankedProperty,
  type ResearchRecord,
  type SignalType,
} from "../lib/model.ts";

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>) => {
    const failure = authFailure(search);
    return failure ? { error: "auth", auth_reason: failure.reason } : {};
  },
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
  const failure = authFailure(Route.useSearch());
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
        {failure ? (
          <div className="notice" role="alert">
            <TriangleAlert size={20} aria-hidden="true" />
            <div>
              <strong>Sign-in did not finish</strong>
              <p>{failure.message}</p>
              <small>
                Diagnostic: {failure.reason}. Share this diagnostic, not cookies or sign-in codes.
              </small>
            </div>
          </div>
        ) : null}
        <a className="button primary wide" href="/api/auth/sign-in?returnTo=/">
          {failure ? "Switch Google account" : "Continue with Google"}{" "}
          <ArrowUpRight size={17} aria-hidden="true" />
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
      <a className="button primary" href="/api/auth/sign-in?returnTo=/">
        Switch Google account
      </a>
    </main>
  );
}

type ReadyData = Extract<Awaited<ReturnType<typeof loadApp>>, { mode: "ready" }>;

function Dashboard({ initial, viewerName }: { initial: ReadyData; viewerName: string }) {
  const [data, setData] = useState<DashboardData>(initial);
  const [query, setQuery] = useState("");
  const [signalType, setSignalType] = useState<"all" | SignalType>("all");
  const [jurisdiction, setJurisdiction] = useState("all");
  const [selected, setSelected] = useState<PropertyDetailData | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [refreshState, setRefreshState] = useState<"idle" | "queueing" | "running">("idle");
  const [notice, setNotice] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  const pageEvidence = data.properties.reduce((sum, property) => sum + property.evidenceCount, 0);
  const healthySources = data.sources.filter((source) => source.status === "success").length;

  async function loadPage(
    page = 1,
    overrides: Partial<{ signal: SignalType | "all"; jurisdiction: string }> = {},
  ) {
    setListLoading(true);
    try {
      const selectedSignal = overrides.signal ?? signalType;
      const selectedJurisdiction = overrides.jurisdiction ?? jurisdiction;
      const params = new URLSearchParams({
        page: String(page),
        pageSize: "50",
        query: query.trim(),
        signal: selectedSignal,
        jurisdiction: selectedJurisdiction,
      });
      const response = await fetch(`/api/research/data?${params}`, { credentials: "same-origin" });
      if (!response.ok) {
        throw new Error("Could not load the ranked property list.");
      }
      setData((await response.json()) as DashboardData);
    } catch (cause) {
      setNotice(
        cause instanceof Error ? cause.message : "Could not load the ranked property list.",
      );
    } finally {
      setListLoading(false);
    }
  }

  async function loadEvidencePage(propertyKey: string, page = 1) {
    setDetailLoading(true);
    setNotice(null);
    try {
      const params = new URLSearchParams({ evidencePage: String(page), evidencePageSize: "50" });
      const response = await fetch(
        `/api/research/properties/${encodeURIComponent(propertyKey)}?${params}`,
        { credentials: "same-origin" },
      );
      if (!response.ok) {
        throw new Error("Could not load property evidence.");
      }
      setSelected((await response.json()) as PropertyDetailData);
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "Could not load property evidence.");
    } finally {
      setDetailLoading(false);
    }
  }

  async function openProperty(property: RankedProperty) {
    await loadEvidencePage(property.propertyKey, 1);
  }

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
      setNotice("Refresh queued. The protected runner checks queued work throughout the day.");
      setRefreshState("running");
      const completed = await pollRefresh(body.job.id, setData);
      setNotice(
        completed
          ? "Refresh finished. Rankings now use the latest complete source snapshots."
          : "Refresh remains queued or running. Reload later for its result.",
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
            <p className="eyebrow">Current official signals · Property ranked</p>
            <h1>
              Find distress earlier,
              <br />
              <em>with exact evidence.</em>
            </h1>
            <p className="hero-copy">
              Current tax delinquencies, open municipal violations, recorded association liens, and
              mortgage foreclosure initiations are grouped conservatively by jurisdiction-scoped
              property identity. Scores explain prioritization; they are not foreclosure
              probabilities.
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
              <Download size={17} /> Export evidence CSV
            </a>
            <p>
              Only complete successful snapshots remove records from the current view. Disappearance
              never means paid or resolved.
            </p>
          </div>
        </section>
        {notice ? (
          <div className="notice" role="status">
            <Clock3 size={17} />
            {notice}
          </div>
        ) : null}
        <section className="metric-grid" aria-label="Watchlist summary">
          <Metric
            label="Ranked current properties"
            value={data.page.total}
            icon={<Building2 size={18} />}
          />
          <Metric label="Evidence on this page" value={pageEvidence} icon={<Layers3 size={18} />} />
          <Metric
            label="Healthy latest source runs"
            value={healthySources}
            icon={<CheckCircle2 size={18} />}
          />
          <Metric
            label="Secondary archive records"
            value={data.archiveTotal}
            icon={<CalendarDays size={18} />}
          />
        </section>
        <section className="coverage-strip" aria-label="Source coverage">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Current coverage</p>
              <h2>What is ranked</h2>
            </div>
            <span>Coverage is source-specific, not nationwide</span>
          </div>
          <div className="coverage-grid">
            <article>
              <strong>Travis County + Norfolk · tax</strong>
              <p>
                Daily official delinquency snapshots. Norfolk installments roll up once per property
                while every component remains evidence.
              </p>
            </article>
            <article>
              <strong>Norfolk · municipal code</strong>
              <p>
                Open workflow records join only on the exact tax-account key. Unmatched violations
                remain separate, never fuzzy-merged.
              </p>
            </article>
            <article>
              <strong>Denver + NYC · filings</strong>
              <p>
                Denver NED foreclosure initiations and monthly NYC common-charge lien recordings.
                Denver registry use requires permission under its Terms of Use before
                commercialization.
              </p>
            </article>
          </div>
        </section>
        <section className="source-strip" aria-label="Source status">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Operations</p>
              <h2>Source freshness and failures</h2>
            </div>
            <span>Fetched and source-updated timestamps are distinct</span>
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
                      {source.recordsUpserted.toLocaleString()} evidence rows · {source.status}
                    </p>
                    <small>
                      Fetched{" "}
                      {source.finishedAt ? formatTimestamp(source.finishedAt) : "in progress"}
                    </small>
                    <small>
                      Source updated{" "}
                      {source.sourceUpdatedAt
                        ? formatTimestamp(source.sourceUpdatedAt)
                        : "not published"}
                    </small>
                    <small>
                      {source.snapshotComplete
                        ? `${source.recordsNoLongerPresent} no longer present after complete snapshot`
                        : "Snapshot not reconciled as complete"}
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
              <p className="eyebrow">Ranked watchlist</p>
              <h2>Current property signals</h2>
            </div>
            <span>
              {data.page.total.toLocaleString()} properties · page {data.page.page} of{" "}
              {data.page.totalPages}
            </span>
          </div>
          <form
            className="filters current-filters"
            onSubmit={(event) => {
              event.preventDefault();
              void loadPage(1);
            }}
          >
            <label className="search-field">
              <Search size={17} />
              <span className="sr-only">Search properties</span>
              <input
                aria-label="Search properties"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search situs address, parcel ID, market…"
              />
            </label>
            <label>
              <span className="sr-only">Signal type</span>
              <select
                aria-label="Signal type"
                value={signalType}
                onChange={(event) => {
                  const value = event.target.value as SignalType | "all";
                  setSignalType(value);
                  void loadPage(1, { signal: value });
                }}
              >
                <option value="all">All current signals</option>
                <option value="tax_delinquency">Tax delinquency</option>
                <option value="code_violation">Open code workflow</option>
                <option value="recorded_lien">Recorded lien</option>
                <option value="mortgage_foreclosure_initiated">
                  Mortgage foreclosure initiated
                </option>
              </select>
            </label>
            <label>
              <span className="sr-only">Market jurisdiction</span>
              <select
                aria-label="Market jurisdiction"
                value={jurisdiction}
                onChange={(event) => {
                  const value = event.target.value;
                  setJurisdiction(value);
                  void loadPage(1, { jurisdiction: value });
                }}
              >
                <option value="all">All current markets</option>
                <option value="travis-county-tx">Travis County, TX</option>
                <option value="norfolk-va">Norfolk, VA</option>
                <option value="denver-co">Denver, CO</option>
                <option value="nyc-ny">New York City, NY</option>
              </select>
            </label>
            <button className="button secondary" type="submit" disabled={listLoading}>
              {listLoading ? "Loading…" : "Search"}
            </button>
          </form>
          {data.properties.length === 0 ? (
            <div className="empty-state">
              <FileSearch2 size={30} />
              <h3>
                {data.page.total === 0
                  ? "No current ranked properties yet"
                  : "No properties on this page"}
              </h3>
              <p>
                Run a protected refresh or broaden the server-side filters. Production starts empty
                and never seeds fictional customer data.
              </p>
            </div>
          ) : (
            <div className="property-list">
              {data.properties.map((property) => (
                <PropertyRow
                  key={property.propertyKey}
                  property={property}
                  onOpen={() => void openProperty(property)}
                  loading={detailLoading}
                />
              ))}
            </div>
          )}
          <nav className="pagination" aria-label="Property pages">
            <button
              className="button secondary"
              type="button"
              disabled={listLoading || data.page.page <= 1}
              onClick={() => void loadPage(data.page.page - 1)}
            >
              Previous
            </button>
            <span>
              Page {data.page.page} of {data.page.totalPages}
            </span>
            <button
              className="button secondary"
              type="button"
              disabled={listLoading || data.page.page >= data.page.totalPages}
              onClick={() => void loadPage(data.page.page + 1)}
            >
              Next
            </button>
          </nav>
        </section>
        <details className="archive-section">
          <summary>
            Secondary historical auction and notice archive · {data.archiveTotal.toLocaleString()}{" "}
            records
          </summary>
          <p>
            These records remain accessible for context but do not drive the default current
            watchlist ranking.
          </p>
          <div className="archive-list">
            {data.archiveRecords.map((record) => (
              <a key={record.id} href={record.sourceUrl} target="_blank" rel="noreferrer">
                <span>
                  {signalLabel(record.signalType)} · {record.jurisdictionName}
                </span>
                <strong>{record.address ?? record.assessorAddress ?? record.sourceRecordId}</strong>
                <small>
                  {formatRecordDate(record)} · {record.sourceName}
                </small>
              </a>
            ))}
          </div>
        </details>
        <section className="disclaimer">
          <TriangleAlert size={20} />
          <div>
            <strong>Prioritization, not foreclosure prediction.</strong>
            <p>
              A delinquency, violation, lien recording, or NED does not prove foreclosure is
              imminent. Scores are deterministic workflow triage. Confirm exact linked evidence,
              current status, releases, cure, and legal meaning before relying on a record.
            </p>
          </div>
        </section>
      </main>
      <footer>
        <span>Templar Labs · Property Watch</span>
        <span>Private research workspace · No contact lookup or outreach</span>
      </footer>
      {selected ? (
        <PropertyDetailPanel
          detail={selected}
          loading={detailLoading}
          onClose={() => setSelected(null)}
          onEvidencePage={(page) => void loadEvidencePage(selected.property.propertyKey, page)}
        />
      ) : null}
    </div>
  );
}

function PropertyRow({
  property,
  onOpen,
  loading,
}: {
  property: RankedProperty;
  onOpen: () => void;
  loading: boolean;
}) {
  return (
    <button className="property-row" type="button" onClick={onOpen} disabled={loading}>
      <div className="score-box">
        <strong>{property.score}</strong>
        <span>priority</span>
      </div>
      <div className="property-address">
        <strong>{property.address ?? "Address not published"}</strong>
        <span>
          {[property.city, property.state, property.zip].filter(Boolean).join(" ") ||
            property.jurisdictionName}
        </span>
        <small>
          {property.parcelId
            ? `Parcel ${formatParcelId(property.parcelId, property.jurisdictionId)}`
            : "No authoritative parcel key · kept unmatched"}
        </small>
      </div>
      <div className="property-signals">
        {property.signalTypes.map((signal) => (
          <span key={signal}>{signalLabel(signal)}</span>
        ))}
      </div>
      <div className="property-totals">
        <strong>{formatMoney(property.totalDelinquentCents)}</strong>
        <span>{property.evidenceCount} evidence rows</span>
        <small>
          {property.independentSignalCount} independent signal type
          {property.independentSignalCount === 1 ? "" : "s"}
        </small>
      </div>
      <div className="property-reasons">
        {property.scoreReasons.slice(0, 2).map((reason) => (
          <span key={reason}>{reason}</span>
        ))}
      </div>
      <ArrowUpRight size={18} />
    </button>
  );
}

function PropertyDetailPanel({
  detail,
  loading,
  onClose,
  onEvidencePage,
}: {
  detail: PropertyDetailData;
  loading: boolean;
  onClose: () => void;
  onEvidencePage: (page: number) => void;
}) {
  const property = detail.property;
  const start = (detail.evidencePage.page - 1) * detail.evidencePage.pageSize + 1;
  const end = start + detail.evidence.length - 1;
  return (
    <div className="detail-backdrop">
      <aside
        className="detail-panel property-detail"
        role="dialog"
        aria-modal="true"
        aria-label="Ranked property evidence"
      >
        <button className="close-button" type="button" onClick={onClose} aria-label="Close details">
          <X size={20} />
        </button>
        <p className="eyebrow">
          Rank {property.score} · {property.jurisdictionName}
        </p>
        <h2>{property.address ?? "Address not published"}</h2>
        <p className="detail-intro">
          This score is deterministic prioritization, not a probability. Every contributing point
          and source row remains inspectable.
        </p>
        <dl className="detail-grid">
          <Detail label="Property key" value={property.propertyKey} wide />
          <Detail
            label="Parcel ID"
            value={
              property.parcelId
                ? formatParcelId(property.parcelId, property.jurisdictionId)
                : "Unmatched · no parcel invented"
            }
          />
          <Detail label="Reported tax total" value={formatMoney(property.totalDelinquentCents)} />
          <Detail label="Evidence rows" value={String(detail.evidenceTotal)} />
          <Detail label="Independent signals" value={String(property.independentSignalCount)} />
          <Detail label="First seen" value={formatTimestamp(property.firstSeenAt)} />
          <Detail label="Last seen" value={formatTimestamp(property.lastSeenAt)} />
        </dl>
        <section className="score-explanation">
          <p className="eyebrow">Why this score</p>
          {property.scoreReasons.map((reason) => (
            <div key={reason}>{reason}</div>
          ))}
        </section>
        <section className="evidence-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Exact evidence · current first</p>
              <h3>{detail.evidenceTotal} source rows</h3>
            </div>
            <span>
              Showing {start}–{end} · page {detail.evidencePage.page} of{" "}
              {detail.evidencePage.totalPages}
            </span>
          </div>
          {detail.evidence.map((record) => (
            <EvidenceCard key={record.id} record={record} />
          ))}
          <nav className="pagination" aria-label="Evidence pages">
            <button
              className="button secondary"
              type="button"
              disabled={loading || detail.evidencePage.page <= 1}
              onClick={() => onEvidencePage(detail.evidencePage.page - 1)}
            >
              Previous evidence
            </button>
            <span>
              {loading
                ? "Loading evidence…"
                : `Page ${detail.evidencePage.page} of ${detail.evidencePage.totalPages}`}
            </span>
            <button
              className="button secondary"
              type="button"
              disabled={loading || detail.evidencePage.page >= detail.evidencePage.totalPages}
              onClick={() => onEvidencePage(detail.evidencePage.page + 1)}
            >
              Next evidence
            </button>
          </nav>
        </section>
      </aside>
    </div>
  );
}

function EvidenceCard({ record }: { record: ResearchRecord }) {
  const componentTotal =
    (record.taxDueCents ?? 0) + (record.penaltyDueCents ?? 0) + (record.interestDueCents ?? 0);
  return (
    <article className={`evidence-card ${record.snapshotPresence}`}>
      <div className="evidence-head">
        <div>
          <span className="signal-tag">{signalLabel(record.signalType)}</span>
          <strong>{record.evidenceStatus ?? "Source status not published"}</strong>
        </div>
        <span>
          {record.snapshotPresence === "present"
            ? "Present in latest source observation"
            : "No longer present · not proof of resolution"}
        </span>
      </div>
      <dl>
        <Detail label="Source record ID" value={record.sourceRecordId} />
        <Detail label="Event date" value={formatCalendarDate(record.eventDate)} />
        <Detail
          label="Tax year / installment"
          value={
            record.taxYear
              ? `${record.taxYear}${record.taxInstallment ? ` · ${record.taxInstallment}` : ""}`
              : "Not applicable"
          }
        />
        <Detail label="Evidence total" value={formatMoney(record.delinquentAmountCents)} />
        <Detail
          label="Tax + penalty + interest"
          value={
            record.taxYear
              ? `${formatMoney(record.taxDueCents)} + ${formatMoney(record.penaltyDueCents)} + ${formatMoney(record.interestDueCents)} = ${formatMoney(componentTotal)}`
              : "Not applicable"
          }
          wide
        />
        <Detail
          label="Published principal"
          value={
            record.principalBalanceCents === null
              ? "Not published"
              : `${formatMoney(record.principalBalanceCents)} · not arrears or payoff`
          }
          wide
        />
        <Detail
          label="Source updated"
          value={
            record.sourceUpdatedAt
              ? formatTimestamp(record.sourceUpdatedAt)
              : "Source does not publish an update timestamp"
          }
        />
        <Detail
          label="Source good through"
          value={
            record.sourceGoodThrough
              ? formatCalendarDate(record.sourceGoodThrough)
              : "Not published"
          }
        />
        <Detail
          label="Evidence modified"
          value={
            record.evidenceUpdatedAt ? formatTimestamp(record.evidenceUpdatedAt) : "Not published"
          }
        />
        <Detail
          label="First / last seen"
          value={`${formatTimestamp(record.firstSeenAt)} / ${formatTimestamp(record.lastSeenAt)}`}
          wide
        />
      </dl>
      {record.evidenceDetail ? <p className="evidence-detail">{record.evidenceDetail}</p> : null}
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
            Source documentation
          </a>
        ) : null}
      </div>
    </article>
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

function Detail({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? "wide" : ""}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
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
    tax_delinquency: "Tax delinquency",
    code_violation: "Active code violation",
    power_to_sell: "Impending power to sell",
    recorded_lien: "Recorded lien",
    lien_release: "Recorded lien release",
    notice_of_default: "Notice of default",
    mortgage_foreclosure_initiated: "Mortgage foreclosure initiated",
    scheduled_trustee_sale: "Scheduled trustee sale",
    scheduled_tax_sale: "Scheduled tax sale",
  }[signalType];
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
