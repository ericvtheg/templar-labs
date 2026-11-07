import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowUpRight,
  Bell,
  Bookmark,
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Download,
  ExternalLink,
  FileSearch2,
  Inbox,
  Layers3,
  LoaderCircle,
  MapPin,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  TriangleAlert,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
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
type PartnerWorkspaceData = ReadyData["partner"];
type BuyBoxData = PartnerWorkspaceData["buyBoxes"][number];
type DealBriefData = NonNullable<
  Awaited<ReturnType<typeof import("../lib/partner.server.ts").loadDealBrief>>
>;
type ScenarioData = Awaited<
  ReturnType<typeof import("../lib/scenario-benchmark.server.ts").loadPropertyScenarios>
>[number];
type BenchmarkData = Awaited<
  ReturnType<typeof import("../lib/scenario-benchmark.server.ts").loadBlindBenchmark>
>;
type WorkspaceView = "shortlist" | "activity" | "pipeline" | "buyboxes" | "alerts" | "benchmarks";

function Dashboard({ initial, viewerName }: { initial: ReadyData; viewerName: string }) {
  const [data, setData] = useState<DashboardData>(initial);
  const [workspace, setWorkspace] = useState<PartnerWorkspaceData>(initial.partner);
  const [query, setQuery] = useState("");
  const [signalType, setSignalType] = useState<"all" | SignalType>("all");
  const [jurisdiction, setJurisdiction] = useState("all");
  const [selected, setSelected] = useState<PropertyDetailData | null>(null);
  const [brief, setBrief] = useState<DealBriefData | null>(null);
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>("shortlist");
  const [benchmarks, setBenchmarks] = useState<BenchmarkData[]>([]);
  const [benchmarksLoaded, setBenchmarksLoaded] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set());
  const [buyBoxId, setBuyBoxId] = useState(initial.partner.buyBoxes[0]?.id ?? "");
  const [fit, setFit] = useState<"all" | "match" | "unknown" | "no_match">("all");
  const [qualification, setQualification] = useState<
    "all" | "qualified" | "needs_research" | "deprioritized"
  >("all");
  const [sort, setSort] = useState<"distress" | "confidence" | "fit" | "recent" | "adjusted">(
    "distress",
  );
  const [detailLoading, setDetailLoading] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [refreshState, setRefreshState] = useState<"idle" | "queueing" | "running">("idle");
  const [notice, setNotice] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const detailRequest = useRef<{
    generation: number;
    propertyKey: string | null;
    controller: AbortController | null;
  }>({ generation: 0, propertyKey: null, controller: null });
  useEffect(() => setHydrated(true), []);

  const pageEvidence = data.properties.reduce((sum, property) => sum + property.evidenceCount, 0);
  const healthySources = data.sources.filter((source) => source.status === "success").length;

  async function loadPage(
    page = 1,
    overrides: Partial<{
      signal: SignalType | "all";
      jurisdiction: string;
      buyBoxId: string;
      fit: "all" | "match" | "unknown" | "no_match";
      qualification: "all" | "qualified" | "needs_research" | "deprioritized";
      sort: "distress" | "confidence" | "fit" | "recent" | "adjusted";
    }> = {},
  ) {
    setListLoading(true);
    try {
      const selectedSignal = overrides.signal ?? signalType;
      const selectedJurisdiction = overrides.jurisdiction ?? jurisdiction;
      const selectedBuyBox = overrides.buyBoxId ?? buyBoxId;
      const selectedFit = overrides.fit ?? fit;
      const selectedQualification = overrides.qualification ?? qualification;
      const selectedSort = overrides.sort ?? sort;
      const params = new URLSearchParams({
        page: String(page),
        pageSize: "50",
        query: query.trim(),
        signal: selectedSignal,
        jurisdiction: selectedJurisdiction,
        fit: selectedFit,
        qualification: selectedQualification,
        sort: selectedSort,
      });
      if (selectedBuyBox) {
        params.set("buyBoxId", selectedBuyBox);
      }
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

  function currentDetailRequest(propertyKey: string) {
    const request = detailRequest.current;
    return request.propertyKey === propertyKey ? request : null;
  }

  function isCurrentDetailRequest(propertyKey: string, generation: number) {
    const request = detailRequest.current;
    return request.propertyKey === propertyKey && request.generation === generation;
  }

  async function loadEvidencePage(
    propertyKey: string,
    page = 1,
    request = currentDetailRequest(propertyKey),
  ) {
    if (!request) {
      return;
    }
    setDetailLoading(true);
    setNotice(null);
    try {
      const params = new URLSearchParams({ evidencePage: String(page), evidencePageSize: "50" });
      const response = await fetch(
        `/api/research/properties/${encodeURIComponent(propertyKey)}?${params}`,
        { credentials: "same-origin", signal: request.controller?.signal ?? null },
      );
      if (!response.ok) {
        throw new Error("Could not load property evidence.");
      }
      const payload = (await response.json()) as PropertyDetailData;
      if (
        payload.property.propertyKey === propertyKey &&
        isCurrentDetailRequest(propertyKey, request.generation)
      ) {
        setSelected(payload);
      }
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === "AbortError")) {
        setNotice(cause instanceof Error ? cause.message : "Could not load property evidence.");
      }
    } finally {
      if (isCurrentDetailRequest(propertyKey, request.generation)) {
        setDetailLoading(false);
      }
    }
  }

  async function openProperty(property: RankedProperty) {
    await openPropertyKey(property.propertyKey);
  }

  async function openPropertyKey(propertyKey: string) {
    detailRequest.current.controller?.abort();
    const request = {
      generation: detailRequest.current.generation + 1,
      propertyKey,
      controller: new AbortController(),
    };
    detailRequest.current = request;
    setSelected(null);
    setBrief(null);
    await Promise.allSettled([
      loadEvidencePage(propertyKey, 1, request),
      loadBrief(propertyKey, request),
    ]);
  }

  async function loadBrief(propertyKey: string, request = currentDetailRequest(propertyKey)) {
    if (!request) {
      return;
    }
    const params = new URLSearchParams();
    if (buyBoxId) {
      params.set("buyBoxId", buyBoxId);
    }
    let response: Response;
    try {
      response = await fetch(
        `/api/research/deal-briefs/${encodeURIComponent(propertyKey)}?${params}`,
        { credentials: "same-origin", signal: request.controller?.signal ?? null },
      );
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") {
        return;
      }
      throw cause;
    }
    if (!response.ok) {
      throw new Error("Could not load the source-backed deal brief.");
    }
    const payload = (await response.json()) as DealBriefData;
    if (
      payload.property.propertyKey === propertyKey &&
      isCurrentDetailRequest(propertyKey, request.generation)
    ) {
      setBrief(payload);
    }
  }

  async function reloadWorkspace() {
    const response = await fetch("/api/research/workspace", { credentials: "same-origin" });
    if (!response.ok) {
      throw new Error("Could not reload the partner workspace.");
    }
    setWorkspace((await response.json()) as PartnerWorkspaceData);
  }

  async function loadBenchmarks() {
    const response = await fetch("/api/research/benchmarks", { credentials: "same-origin" });
    if (!response.ok) {
      throw new Error("Could not load blind comparisons.");
    }
    const payload = (await response.json()) as { benchmarks: BenchmarkData[] };
    setBenchmarks(payload.benchmarks);
    setBenchmarksLoaded(true);
  }

  async function mutate(path: string, body: unknown) {
    const mutationPropertyKey = detailRequest.current.propertyKey;
    setNotice(null);
    const response = await fetch(path, {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      const message = payload.error ?? "The update could not be saved.";
      setNotice(message);
      throw new Error(message);
    }
    await reloadWorkspace();
    if (mutationPropertyKey && detailRequest.current.propertyKey === mutationPropertyKey) {
      await loadBrief(mutationPropertyKey);
    }
    return payload;
  }

  async function exportSelected() {
    if (selectedKeys.size === 0) {
      setNotice("Select at least one property before exporting.");
      return;
    }
    const response = await fetch("/api/research/export-selected.csv", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ propertyKeys: [...selectedKeys] }),
    });
    if (!response.ok) {
      const payload = (await response.json()) as { error?: string };
      setNotice(payload.error ?? "Selected export failed.");
      return;
    }
    const url = URL.createObjectURL(await response.blob());
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `property-watch-selected-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
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
    <div
      className="app-shell"
      data-hydrated={hydrated ? "true" : "false"}
      data-workspace-view={workspaceView}
    >
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
              Rank current official tax, code, lien, and foreclosure-initiation evidence by exact
              property identity. Scores explain workflow triage, never foreclosure probability.
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
            <button
              className="button secondary"
              type="button"
              onClick={() => void exportSelected()}
            >
              <Download size={17} /> Export selected ({selectedKeys.size})
            </button>
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
        <nav className="workspace-nav" aria-label="Partner workflow">
          {(
            [
              ["shortlist", "Shortlist", <Layers3 size={16} key="shortlist" />],
              ["activity", "Changes", <Clock3 size={16} key="activity" />],
              ["pipeline", "Pipeline", <Bookmark size={16} key="pipeline" />],
              ["buyboxes", "Buy boxes", <SlidersHorizontal size={16} key="buyboxes" />],
              ["benchmarks", "Blind benchmarks", <FileSearch2 size={16} key="benchmarks" />],
              [
                "alerts",
                `Alerts (${workspace.alerts.filter((alert) => !alert.readAt).length})`,
                <Bell size={16} key="alerts" />,
              ],
            ] as const
          ).map(([value, label, icon]) => (
            <button
              key={value}
              className={workspaceView === value ? "active" : ""}
              type="button"
              onClick={() => {
                setWorkspaceView(value);
                if (value === "benchmarks" && !benchmarksLoaded) {
                  void loadBenchmarks().catch((cause) =>
                    setNotice(
                      cause instanceof Error ? cause.message : "Could not load blind comparisons.",
                    ),
                  );
                }
              }}
            >
              {icon}
              {label}
            </button>
          ))}
        </nav>
        {workspaceView === "benchmarks" ? (
          <BenchmarkWorkspace
            benchmarks={benchmarks}
            selectedKeys={[...selectedKeys]}
            buyBoxes={workspace.buyBoxes}
            viewerEmail={initial.viewerEmail}
            onReload={loadBenchmarks}
            onNotice={setNotice}
          />
        ) : workspaceView !== "shortlist" ? (
          <PartnerWorkspacePanel
            view={workspaceView}
            workspace={workspace}
            viewerEmail={initial.viewerEmail}
            onOpen={(key) => void openPropertyKey(key)}
            onMutate={(path, body) => mutate(path, body)}
            onBuyBoxSelected={setBuyBoxId}
          />
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
        <details className="diagnostics-disclosure">
          <summary>
            Source coverage and freshness · {healthySources} healthy latest runs
            {data.sources.some((source) => source.status !== "success")
              ? " · attention needed"
              : ""}
          </summary>
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
                  Daily official delinquency snapshots. Norfolk installments roll up once per
                  property while every component remains evidence.
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
                      {source.error ? (
                        <small className="source-warning">{source.error}</small>
                      ) : null}
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
        </details>
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
            <label>
              <span className="sr-only">Shared buy box</span>
              <select
                aria-label="Shared buy box"
                value={buyBoxId}
                onChange={(event) => {
                  const value = event.target.value;
                  setBuyBoxId(value);
                  setFit("all");
                  void loadPage(1, { buyBoxId: value, fit: "all" });
                }}
              >
                <option value="">No buy box · show all</option>
                {workspace.buyBoxes.map((buyBox) => (
                  <option key={buyBox.id} value={buyBox.id}>
                    {buyBox.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="sr-only">Buying fit</span>
              <select
                aria-label="Buying fit"
                value={fit}
                disabled={!buyBoxId}
                onChange={(event) => {
                  const value = event.target.value as typeof fit;
                  setFit(value);
                  void loadPage(1, { fit: value });
                }}
              >
                <option value="all">All fit results</option>
                <option value="match">Buy-box match</option>
                <option value="unknown">Unknown fit</option>
                <option value="no_match">Not a match</option>
              </select>
            </label>
            <label>
              <span className="sr-only">Lead qualification</span>
              <select
                aria-label="Lead qualification"
                value={qualification}
                onChange={(event) => {
                  const value = event.target.value as typeof qualification;
                  setQualification(value);
                  void loadPage(1, { qualification: value });
                }}
              >
                <option value="all">All lead states</option>
                <option value="qualified">Qualified</option>
                <option value="needs_research">Needs research</option>
                <option value="deprioritized">Deprioritized</option>
              </select>
            </label>
            <label>
              <span className="sr-only">Shortlist sort</span>
              <select
                aria-label="Shortlist sort"
                value={sort}
                onChange={(event) => {
                  const value = event.target.value as typeof sort;
                  setSort(value);
                  void loadPage(1, { sort: value });
                }}
              >
                <option value="distress">Distress strength</option>
                <option value="confidence">Evidence confidence</option>
                <option value="fit">Buying fit</option>
                <option value="recent">Recently observed</option>
                <option value="adjusted">Optional feedback-adjusted priority</option>
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
                  loading={listLoading}
                  selected={selectedKeys.has(property.propertyKey)}
                  onSelect={(checked) =>
                    setSelectedKeys((current) => {
                      const next = new Set(current);
                      if (checked) {
                        next.add(property.propertyKey);
                      } else {
                        next.delete(property.propertyKey);
                      }
                      return next;
                    })
                  }
                  buyBox={workspace.buyBoxes.find((entry) => entry.id === buyBoxId) ?? null}
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
          brief={brief}
          viewerEmail={initial.viewerEmail}
          loading={detailLoading}
          onClose={() => {
            detailRequest.current.controller?.abort();
            detailRequest.current = {
              generation: detailRequest.current.generation + 1,
              propertyKey: null,
              controller: null,
            };
            setSelected(null);
            setBrief(null);
          }}
          onEvidencePage={(page) => void loadEvidencePage(selected.property.propertyKey, page)}
          onMutate={(path, body) => mutate(path, body)}
        />
      ) : null}
    </div>
  );
}

function PropertyRow({
  property,
  onOpen,
  loading,
  selected,
  onSelect,
  buyBox,
}: {
  property: RankedProperty;
  onOpen: () => void;
  loading: boolean;
  selected: boolean;
  onSelect: (checked: boolean) => void;
  buyBox: BuyBoxData | null;
}) {
  const dimensions = shortlistDimensions(property, buyBox);
  return (
    <div className="property-row-wrap" data-property-key={property.propertyKey}>
      <label className="property-select">
        <input
          type="checkbox"
          aria-label={`Select ${property.address ?? property.propertyKey}`}
          checked={selected}
          onChange={(event) => onSelect(event.target.checked)}
        />
        <span>Select</span>
      </label>
      <button className="property-row" type="button" onClick={onOpen} disabled={loading}>
        <div className="score-box">
          <strong>{dimensions.distress.value}</strong>
          <span>distress</span>
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
          <span>Evidence: {dimensions.confidence.value}</span>
          <span>Buy box: {dimensions.fit.value}</span>
          <span>Lead: {property.qualificationStatus.replaceAll("_", " ")}</span>
          {property.priorityAdjustment !== 0 ? (
            <small>
              Optional review adjustment {property.priorityAdjustment > 0 ? "+" : ""}
              {property.priorityAdjustment} · adjusted {property.adjustedPriorityScore}
            </small>
          ) : null}
          <small>{dimensions.fit.reason}</small>
        </div>
        <ArrowUpRight size={18} />
      </button>
    </div>
  );
}

function PropertyDetailPanel({
  detail,
  brief,
  viewerEmail,
  loading,
  onClose,
  onEvidencePage,
  onMutate,
}: {
  detail: PropertyDetailData;
  brief: DealBriefData | null;
  viewerEmail: string;
  loading: boolean;
  onClose: () => void;
  onEvidencePage: (page: number) => void;
  onMutate: (path: string, body: unknown) => Promise<unknown>;
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
        {brief ? (
          <DealBriefSections brief={brief} viewerEmail={viewerEmail} onMutate={onMutate} />
        ) : (
          <div className="notice" role="status">
            <LoaderCircle className="spin" size={17} /> Loading source-backed brief…
          </div>
        )}
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

function PartnerWorkspacePanel({
  view,
  workspace,
  viewerEmail,
  onOpen,
  onMutate,
  onBuyBoxSelected,
}: {
  view: Exclude<WorkspaceView, "shortlist">;
  workspace: PartnerWorkspaceData;
  viewerEmail: string;
  onOpen: (propertyKey: string) => void;
  onMutate: (path: string, body: unknown) => Promise<unknown>;
  onBuyBoxSelected: (id: string) => void;
}) {
  return (
    <section className="partner-workspace-panel" aria-label={`${view} workspace`}>
      {view === "activity" ? (
        <>
          <div className="section-heading">
            <div>
              <p className="eyebrow">Successful publications only</p>
              <h2>Property change feed</h2>
            </div>
            <span>
              Showing {workspace.activity.length} of {workspace.activityPage.total} · detected and
              publisher dates remain distinct
            </span>
          </div>
          {workspace.activity.length === 0 ? (
            <EmptyPanel
              title="Baseline established; no later changes yet"
              body="The first successful publication never becomes fabricated new distress. Incomplete and failed imports emit no events."
            />
          ) : (
            <div className="workspace-card-list">
              {workspace.activity.map((event) => (
                <article className="workspace-card" key={event.id}>
                  <span className={`signal-tag ${event.severity}`}>
                    {event.eventType.replaceAll("_", " ")}
                  </span>
                  <h3>{event.propertyKey}</h3>
                  <p>{changeContext(event.before, event.after)}</p>
                  <small>
                    Detected {formatTimestamp(event.detectedAt)} · published{" "}
                    {event.publishedAt
                      ? formatCalendarDate(event.publishedAt)
                      : "date not published"}
                  </small>
                  <div className="source-links">
                    <button
                      className="button primary"
                      type="button"
                      onClick={() => onOpen(event.propertyKey)}
                    >
                      Open property
                    </button>
                    <a
                      className="button secondary"
                      href={event.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Official source <ExternalLink size={15} />
                    </a>
                  </div>
                </article>
              ))}
            </div>
          )}
        </>
      ) : null}
      {view === "pipeline" ? (
        <>
          <div className="section-heading">
            <div>
              <p className="eyebrow">Shared partner state</p>
              <h2>Review pipeline</h2>
            </div>
            <span>
              {workspace.dueFollowUps.length} due follow-up
              {workspace.dueFollowUps.length === 1 ? "" : "s"}
            </span>
          </div>
          {workspace.pipeline.length === 0 ? (
            <EmptyPanel
              title="No shared reviews yet"
              body="Save a property from its deal brief to start durable review state. Source refreshes never delete this pipeline."
            />
          ) : (
            <div className="workspace-card-list">
              {workspace.pipeline.map((property) => (
                <article className="workspace-card" key={property.propertyKey}>
                  <h3>{property.address ?? property.propertyKey}</h3>
                  <p>
                    {property.jurisdictionName} · {property.stage} ·{" "}
                    {property.saved ? "Saved" : "Not saved"}
                    {property.dismissed ? " · Dismissed" : ""}
                  </p>
                  <small>
                    Assigned {property.assignedTo ?? "Nobody"} · follow-up{" "}
                    {property.followUpAt ? formatTimestamp(property.followUpAt) : "not set"}
                  </small>
                  {property.passReason ? <p>Pass reason: {property.passReason}</p> : null}
                  <div className="source-links">
                    <button
                      className="button primary"
                      type="button"
                      onClick={() => onOpen(property.propertyKey)}
                    >
                      Open review
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </>
      ) : null}
      {view === "buyboxes" ? (
        <BuyBoxEditor workspace={workspace} onMutate={onMutate} onSelected={onBuyBoxSelected} />
      ) : null}
      {view === "alerts" ? (
        <>
          <div className="section-heading">
            <div>
              <p className="eyebrow">Personal state · in app only</p>
              <h2>Saved-property alerts</h2>
            </div>
            <span>
              Showing {workspace.alerts.length} of {workspace.alertPage.total} · no external
              delivery
            </span>
          </div>
          <form
            className="preferences-row"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              void onMutate("/api/research/alert-preferences", {
                expectedVersion: workspace.alertPreferences.version,
                newActivity: form.has("newActivity"),
                worseningActivity: form.has("worseningActivity"),
                dueFollowUps: form.has("dueFollowUps"),
              });
            }}
          >
            <label>
              <input
                name="newActivity"
                type="checkbox"
                defaultChecked={workspace.alertPreferences.newActivity}
              />{" "}
              New activity
            </label>
            <label>
              <input
                name="worseningActivity"
                type="checkbox"
                defaultChecked={workspace.alertPreferences.worseningActivity}
              />{" "}
              Worsening activity
            </label>
            <label>
              <input
                name="dueFollowUps"
                type="checkbox"
                defaultChecked={workspace.alertPreferences.dueFollowUps}
              />{" "}
              Due follow-ups
            </label>
            <button className="button secondary" type="submit">
              Save my preferences
            </button>
          </form>
          {workspace.alerts.length === 0 ? (
            <EmptyPanel
              title="No saved-property alerts"
              body="Alerts appear only after a saved property's later successful publication or when a follow-up becomes due."
            />
          ) : (
            <div className="workspace-card-list">
              {workspace.alerts.map((alert) => (
                <article
                  className={`workspace-card ${alert.readAt ? "read" : "unread"}`}
                  key={alert.id}
                >
                  <span className="signal-tag">{alert.kind.replaceAll("_", " ")}</span>
                  <h3>{alert.title}</h3>
                  <p>{alert.propertyKey}</p>
                  <small>
                    {formatTimestamp(alert.availableAt)} · {alert.readAt ? "Read" : "Unread"}
                  </small>
                  <div className="source-links">
                    <button
                      className="button primary"
                      type="button"
                      onClick={() => onOpen(alert.propertyKey)}
                    >
                      Open property
                    </button>
                    {!alert.readAt ? (
                      <button
                        className="button secondary"
                        type="button"
                        onClick={() =>
                          void onMutate("/api/research/alerts/read", { ids: [alert.id] })
                        }
                      >
                        Mark read
                      </button>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          )}
          <p className="fine-print">
            Preferences belong to {viewerEmail}; saved properties and pipeline state are shared.
          </p>
        </>
      ) : null}
    </section>
  );
}

function BuyBoxEditor({
  workspace,
  onMutate,
  onSelected,
}: {
  workspace: PartnerWorkspaceData;
  onMutate: (path: string, body: unknown) => Promise<unknown>;
  onSelected: (id: string) => void;
}) {
  const [editingId, setEditingId] = useState(workspace.buyBoxes[0]?.id ?? "new");
  const current = workspace.buyBoxes.find((entry) => entry.id === editingId) ?? null;
  return (
    <>
      <div className="section-heading">
        <div>
          <p className="eyebrow">Shared and persistent</p>
          <h2>Buying criteria</h2>
        </div>
        <select
          aria-label="Edit buy box"
          value={editingId}
          onChange={(event) => {
            setEditingId(event.target.value);
            if (event.target.value !== "new") {
              onSelected(event.target.value);
            }
          }}
        >
          <option value="new">Create a buy box</option>
          {workspace.buyBoxes.map((buyBox) => (
            <option key={buyBox.id} value={buyBox.id}>
              {buyBox.name}
            </option>
          ))}
        </select>
      </div>
      <form
        className="buy-box-form"
        key={current?.id ?? "new"}
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const nullableNumber = (name: string) => {
            const value = String(form.get(name) ?? "").trim();
            return value ? Number(value) : null;
          };
          void onMutate("/api/research/buy-boxes", {
            id: current?.id ?? null,
            expectedVersion: current?.version ?? 0,
            name: String(form.get("name") ?? ""),
            propertyTypes: form.getAll("propertyTypes"),
            jurisdictions: splitList(form.get("jurisdictions")),
            neighborhoods: splitList(form.get("neighborhoods")),
            zips: splitList(form.get("zips")),
            sizeBasis: form.get("sizeBasis"),
            minSizeValue: nullableNumber("minSizeValue"),
            maxSizeValue: nullableNumber("maxSizeValue"),
            minValueCents: dollarsToCents(nullableNumber("minValueDollars")),
            maxValueCents: dollarsToCents(nullableNumber("maxValueDollars")),
            valueBasis: form.get("valueBasis"),
            valueAssumptionLabel: String(form.get("valueAssumptionLabel") ?? "").trim() || null,
            distressPhases: form.getAll("distressPhases"),
          });
        }}
      >
        <label className="wide">
          <span>Name</span>
          <input name="name" required maxLength={100} defaultValue={current?.name ?? ""} />
        </label>
        <fieldset>
          <legend>Property types</legend>
          {["sfh", "small_multifamily", "commercial", "land"].map((value) => (
            <label key={value}>
              <input
                name="propertyTypes"
                type="checkbox"
                value={value}
                defaultChecked={current?.propertyTypes.includes(value as never)}
              />{" "}
              {value.replaceAll("_", " ")}
            </label>
          ))}
        </fieldset>
        <label>
          <span>Markets (jurisdiction IDs)</span>
          <input
            name="jurisdictions"
            defaultValue={current?.jurisdictions.join(", ") ?? ""}
            placeholder="norfolk-va"
          />
        </label>
        <label>
          <span>Neighborhoods</span>
          <input name="neighborhoods" defaultValue={current?.neighborhoods.join(", ") ?? ""} />
        </label>
        <label>
          <span>ZIPs</span>
          <input name="zips" defaultValue={current?.zips.join(", ") ?? ""} />
        </label>
        <label>
          <span>Size basis</span>
          <select name="sizeBasis" defaultValue={current?.sizeBasis ?? "none"}>
            <option value="none">No size criterion</option>
            <option value="lot_square_feet">Official lot square feet</option>
            <option value="residential_finished_area_source_units">
              Residential finished-area source units
            </option>
            <option value="commercial_building_area_source_units">
              Commercial building-area source units (unverified)
            </option>
          </select>
        </label>
        <label>
          <span>Minimum size</span>
          <input
            name="minSizeValue"
            inputMode="numeric"
            defaultValue={current?.minSizeValue ?? ""}
          />
        </label>
        <label>
          <span>Maximum size</span>
          <input
            name="maxSizeValue"
            inputMode="numeric"
            defaultValue={current?.maxSizeValue ?? ""}
          />
        </label>
        <label>
          <span>Value basis</span>
          <select name="valueBasis" defaultValue={current?.valueBasis ?? "assessed_value"}>
            <option value="assessed_value">Official assessed value (not market)</option>
            <option value="last_reported_consideration">Last reported consideration</option>
            <option value="user_assumption">Dated user assumption</option>
          </select>
        </label>
        <label>
          <span>Named assumption label</span>
          <input
            name="valueAssumptionLabel"
            maxLength={120}
            defaultValue={current?.valueAssumptionLabel ?? ""}
            placeholder="Required only for assumption basis"
          />
        </label>
        <label>
          <span>Minimum value ($)</span>
          <input
            name="minValueDollars"
            inputMode="decimal"
            defaultValue={
              current?.minValueCents === null || current?.minValueCents === undefined
                ? ""
                : current.minValueCents / 100
            }
          />
        </label>
        <label>
          <span>Maximum value ($)</span>
          <input
            name="maxValueDollars"
            inputMode="decimal"
            defaultValue={
              current?.maxValueCents === null || current?.maxValueCents === undefined
                ? ""
                : current.maxValueCents / 100
            }
          />
        </label>
        <fieldset>
          <legend>Distress phase</legend>
          {["early_distress", "filed_foreclosure"].map((value) => (
            <label key={value}>
              <input
                name="distressPhases"
                type="checkbox"
                value={value}
                defaultChecked={current?.distressPhases.includes(value as never)}
              />{" "}
              {value.replaceAll("_", " ")}
            </label>
          ))}
        </fieldset>
        <p className="fine-print wide">
          Commercial building-area units are not verified in Norfolk metadata, so strict matching
          stays unknown. Assessed value is not market value or an asking price.
        </p>
        <button className="button primary" type="submit">
          {current ? "Save buy box" : "Create buy box"}
        </button>
      </form>
    </>
  );
}

function DealBriefSections({
  brief,
  viewerEmail,
  onMutate,
}: {
  brief: DealBriefData;
  viewerEmail: string;
  onMutate: (path: string, body: unknown) => Promise<unknown>;
}) {
  const propertyKey = brief.property.propertyKey;
  const support = brief.decisionSupport;
  const viewerFeedback = support.feedback.find(
    (entry) => entry.reviewerEmail.toLowerCase() === viewerEmail.toLowerCase(),
  );
  const [researchAction, setResearchAction] = useState<
    "idle" | "assessing" | "rechecking" | "success" | "failed"
  >("idle");
  const [researchResult, setResearchResult] = useState<string | null>(null);

  async function runResearchAction(kind: "assessment" | "recheck") {
    setResearchAction(kind === "assessment" ? "assessing" : "rechecking");
    setResearchResult(null);
    try {
      const result = (await onMutate(
        `/api/research/${kind === "assessment" ? "assessments" : "rechecks"}/${encodeURIComponent(propertyKey)}`,
        {},
      )) as { status?: string; error?: string; summary?: string };
      if (result.status === "failed") {
        setResearchAction("failed");
        setResearchResult(
          result.error ?? "The public source recheck failed without advancing verification.",
        );
      } else {
        setResearchAction("success");
        setResearchResult(
          result.summary ??
            (kind === "recheck"
              ? "Source-scoped tax, code, and assessor findings were persisted with their own clocks and boundaries."
              : "Attributed assessment persisted."),
        );
      }
    } catch (cause) {
      setResearchAction("failed");
      setResearchResult(cause instanceof Error ? cause.message : "The research action failed.");
    }
  }
  return (
    <>
      <section className="qualification-grid" aria-label="Qualification dimensions">
        <article>
          <span>Distress strength</span>
          <strong>
            {brief.distressStrength.level} · {brief.distressStrength.score}
          </strong>
          <p>
            {brief.distressStrength.reasons.join("; ") || "No active signal strength established"}
          </p>
          <small>{brief.distressStrength.limitations.join(" · ")}</small>
        </article>
        <article>
          <span>Evidence confidence</span>
          <strong>
            {brief.evidenceConfidence.level}
            {brief.evidenceConfidence.score === null ? "" : ` · ${brief.evidenceConfidence.score}`}
          </strong>
          <p>{brief.evidenceConfidence.reasons.join("; ")}</p>
          <small>
            {brief.evidenceConfidence.missingInputs.join(" · ") ||
              "No additional provenance gap recorded"}
          </small>
        </article>
        <article>
          <span>Buying fit</span>
          <strong>{brief.buyingFit.status.replaceAll("_", " ")}</strong>
          <p>{brief.buyingFit.reasons.join("; ") || "No buy box selected"}</p>
          <small>
            {brief.buyingFit.missingInputs.join(" · ") ||
              "All configured criteria have sourced inputs"}
          </small>
        </article>
      </section>
      <section className="brief-section decision-section" aria-label="Active lead qualification">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Active bad-lead filtering</p>
            <h3>Qualification: {support.qualification.status.replaceAll("_", " ")}</h3>
          </div>
          <span>
            Override version {support.qualification.override?.version ?? 0} · source truth retained
          </span>
        </div>
        <div className="reason-ledger">
          {support.qualification.reasons.map((reason) => (
            <article
              className={`reason-row ${reason.effect}`}
              key={`${reason.code}:${reason.sourceRecordId ?? reason.sourceUrl ?? reason.label}`}
            >
              <strong>{reason.code.replaceAll("_", " ")}</strong>
              <p>{reason.label}</p>
              <small>
                Effect: {reason.effect.replaceAll("_", " ")}
                {reason.sourceDate ? ` · source date ${formatCalendarDate(reason.sourceDate)}` : ""}
              </small>
              {reason.sourceUrl ? (
                <a href={reason.sourceUrl} target="_blank" rel="noreferrer">
                  Source evidence <ExternalLink size={13} />
                </a>
              ) : null}
            </article>
          ))}
        </div>
        <form
          className="inline-form qualification-override-form"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            void onMutate(
              `/api/research/qualification-overrides/${encodeURIComponent(propertyKey)}`,
              {
                expectedVersion: support.qualification.override?.version ?? 0,
                action: form.get("action"),
                reason: form.get("reason"),
              },
            );
          }}
        >
          <label>
            <span>Partner qualification override</span>
            <select
              name="action"
              defaultValue={support.qualification.override?.action ?? "source_only"}
            >
              <option value="source_only">Use sourced reasons only</option>
              <option value="qualify">Keep qualified for review</option>
              <option value="deprioritize">Deprioritize lead</option>
            </select>
          </label>
          <label className="wide">
            <span>Attributed reason</span>
            <input
              name="reason"
              required
              minLength={3}
              maxLength={1000}
              defaultValue={
                support.qualification.override?.reason ?? "Return to sourced qualification"
              }
            />
          </label>
          <button className="button secondary" type="submit">
            Save reversible override
          </button>
        </form>
        {support.qualification.overrideHistory.length > 0 ? (
          <details>
            <summary>{support.qualification.overrideHistory.length} override audit entries</summary>
            {support.qualification.overrideHistory.map((entry) => (
              <p key={entry.id}>
                {entry.action.replaceAll("_", " ")} · {entry.reason} · {entry.actorEmail} ·{" "}
                {formatTimestamp(entry.createdAt)}
              </p>
            ))}
          </details>
        ) : null}
      </section>
      <section
        className="brief-section investigation-section"
        aria-label="Investigation assessment"
      >
        <div className="section-heading">
          <div>
            <p className="eyebrow">Evidence-backed investigation</p>
            <h3>Reusable attributed brief</h3>
          </div>
          <span>
            Latest verified{" "}
            {support.latestVerifiedAt ? formatTimestamp(support.latestVerifiedAt) : "never"}
          </span>
        </div>
        <div className="source-links">
          <button
            className="button primary"
            type="button"
            disabled={researchAction === "assessing" || researchAction === "rechecking"}
            onClick={() => void runResearchAction("assessment")}
          >
            {researchAction === "assessing" ? <LoaderCircle className="spin" size={15} /> : null}
            Create attributed assessment
          </button>
          <button
            className="button secondary"
            type="button"
            disabled={
              !/^norfolk-va:\d{8}$/.test(propertyKey) ||
              researchAction === "assessing" ||
              researchAction === "rechecking"
            }
            onClick={() => void runResearchAction("recheck")}
          >
            {researchAction === "rechecking" ? <LoaderCircle className="spin" size={15} /> : null}
            Recheck official tax, code, and parcel sources
          </button>
        </div>
        {researchResult ? (
          <div
            className={`notice ${researchAction === "failed" ? "source-warning" : ""}`}
            role="status"
          >
            {researchAction === "failed" ? <TriangleAlert size={17} /> : <CheckCircle2 size={17} />}
            {researchResult}
          </div>
        ) : null}
        <p className="fine-print">
          Dataset publication, record event, network fetch, and partner review clocks remain
          separate. Source presence is not independent payoff verification, and a failed fetch never
          advances that source's clock.
        </p>
        {support.rechecks.slice(0, 5).map((entry) => (
          <article className="recheck-row" key={entry.id}>
            <strong>
              {entry.status === "success"
                ? "Exact tax/code recheck succeeded"
                : entry.status === "partial"
                  ? "Recheck completed with source boundaries"
                  : "Recheck failed"}
            </strong>
            <span>Attempted {formatTimestamp(entry.attemptedAt)}</span>
            <small>
              Dataset as-of{" "}
              {entry.datasetAsOf ? formatTimestamp(entry.datasetAsOf) : "not obtained"} · fetched{" "}
              {entry.fetchedAt ? formatTimestamp(entry.fetchedAt) : "not advanced"} · independent
              current payoff verification not established
            </small>
            {entry.findings
              ? Object.values(entry.findings.sources).map((finding) => (
                  <p key={finding.sourceId}>
                    {finding.sourceName}: {finding.status} · {finding.presence} ·{" "}
                    {finding.recordCount} record(s) · source as-of{" "}
                    {finding.sourceAsOf ? formatTimestamp(finding.sourceAsOf) : "not advanced"}.{" "}
                    {finding.boundary}
                  </p>
                ))
              : null}
            {entry.error ? <p>{entry.error}</p> : null}
          </article>
        ))}
        {support.assessments.length === 0 ? (
          <p>No persisted assessment yet. Source evidence remains available below.</p>
        ) : (
          support.assessments.map((assessment) => (
            <details
              className="assessment"
              key={assessment.id}
              open={assessment.version === support.assessments[0]?.version}
            >
              <summary>
                Assessment v{assessment.version} · reviewed {formatTimestamp(assessment.reviewedAt)}
              </summary>
              <p>{assessment.summary}</p>
              <dl className="detail-grid">
                <Detail
                  label="Dataset as-of"
                  value={
                    assessment.datasetAsOf
                      ? formatTimestamp(assessment.datasetAsOf)
                      : "Not published"
                  }
                />
                <Detail
                  label="Fetched"
                  value={
                    assessment.fetchedAt ? formatTimestamp(assessment.fetchedAt) : "Not available"
                  }
                />
                <Detail label="Reviewed" value={formatTimestamp(assessment.reviewedAt)} />
                <Detail
                  label="Independent current verification"
                  value="Not established; review source-scoped findings"
                />
                <Detail
                  label="Evidence ledger"
                  value={`${assessment.evidenceIncluded} of ${assessment.evidenceTotal} included · ${assessment.evidenceOmitted} omitted`}
                />
              </dl>
              <h4>What happened and publication status</h4>
              {assessment.assertions.map((assertion) => (
                <article className="assertion" key={String(assertion["id"])}>
                  <p>{String(assertion["statement"])}</p>
                  <small>
                    Record date {formatCalendarDate(String(assertion["recordDate"]))} · fetched{" "}
                    {formatTimestamp(String(assertion["fetchedAt"]))} ·{" "}
                    {String(assertion["currentVerification"])}
                  </small>
                  <a href={String(assertion["sourceUrl"])} target="_blank" rel="noreferrer">
                    {String(assertion["sourceLinkKind"]) === "exact_record"
                      ? "Exact record"
                      : String(assertion["sourceLinkKind"]) === "dataset"
                        ? "Dataset metadata/documentation"
                        : "Publisher source"}
                    : {String(assertion["sourceName"])} · record{" "}
                    {String(assertion["sourceRecordId"])} <ExternalLink size={13} />
                  </a>
                </article>
              ))}
              <h4>Contradictions retained</h4>
              {assessment.contradictions.length === 0 ? (
                <p>No explicit cross-source contradiction was detected in this snapshot.</p>
              ) : (
                assessment.contradictions.map((entry) => (
                  <p key={`${String(entry["code"])}:${String(entry["description"])}`}>
                    {String(entry["description"])}
                  </p>
                ))
              )}
              <h4>Outstanding questions</h4>
              <ul>
                {assessment.outstandingQuestions.map((question) => (
                  <li key={question}>{question}</li>
                ))}
              </ul>
            </details>
          ))
        )}
      </section>
      <PipelineEditor propertyKey={propertyKey} pipeline={brief.pipeline} onMutate={onMutate} />
      <section className="brief-section">
        <p className="eyebrow">Official characteristics and ownership</p>
        {brief.enrichment ? (
          <dl className="detail-grid">
            <Detail
              label="Assessor owner"
              value={brief.enrichment.ownerName ?? "Not published"}
              wide
            />
            <Detail
              label="Assessor situs"
              value={
                [
                  brief.enrichment.assessorAddress,
                  brief.enrichment.assessorCity,
                  brief.enrichment.assessorZip,
                ]
                  .filter(Boolean)
                  .join(", ") || "Not published"
              }
              wide
            />
            <Detail
              label="Official class / use"
              value={
                [brief.enrichment.landUseDescription, brief.enrichment.propertyUse]
                  .filter(Boolean)
                  .join(" · ") || "Unknown"
              }
              wide
            />
            <Detail
              label="Lot area"
              value={
                brief.enrichment.lotAreaSqft === null
                  ? "Not published"
                  : `${brief.enrichment.lotAreaSqft.toLocaleString()} approximate sq ft`
              }
            />
            <Detail
              label="Building area"
              value={
                brief.enrichment.commercialBuildingAreaValue === null &&
                brief.enrichment.residentialFinishedAreaValue === null
                  ? "Not published"
                  : `${brief.enrichment.commercialBuildingAreaValue ?? brief.enrichment.residentialFinishedAreaValue} source units · units unverified`
              }
            />
            <Detail
              label="Assessment"
              value={`${formatMoney(brief.enrichment.assessedTotalCents)} effective ${formatCalendarDate(brief.enrichment.assessmentEffectiveDate)} · not market value`}
              wide
            />
            <Detail
              label="Last reported transfer"
              value={`${formatCalendarDate(brief.enrichment.lastTransferDate)} · ${formatMoney(brief.enrichment.lastTransferConsiderationCents)} · document ${brief.enrichment.lastTransferDocumentNumber ?? "not published"}`}
              wide
            />
            <Detail
              label="Exact join"
              value={`${brief.enrichment.joinMethod.replaceAll("_", " ")} · source literal ${brief.enrichment.sourceParcelId}`}
              wide
            />
          </dl>
        ) : (
          <p>
            Official characteristics have not been retrieved for this exact parcel. Unknown fields
            remain unknown.
          </p>
        )}
        {brief.situsAliases.length > 1 ? (
          <p className="evidence-detail">
            Source-specific situs aliases under this parcel: {brief.situsAliases.join(" · ")}
          </p>
        ) : null}
      </section>
      <section className="brief-section">
        <p className="eyebrow">Recent same-type assessor-reported transfer candidates</p>
        {brief.saleCandidates.length === 0 ? (
          <p>No bounded official transfer candidates are stored for this property.</p>
        ) : (
          brief.saleCandidates.map((sale) => (
            <article className="sale-candidate" key={sale.id}>
              <strong>
                {sale.candidateAddress ?? sale.candidateParcelId} ·{" "}
                {formatMoney(sale.salePriceCents)}
              </strong>
              <span>
                {formatCalendarDate(sale.saleDate)} ·{" "}
                {sale.qualificationStatus.replaceAll("_", " ")}
              </span>
              <small>
                Identity: {sale.identityStatus.replaceAll("_", " ")}
                {sale.candidatePropertyKey
                  ? ` · ${sale.candidatePropertyKey}`
                  : " · no canonical join"}
              </small>
              <p>{sale.selectionReason}</p>
              <small>{sale.exclusionReason}</small>
              <a href={sale.sourceUrl} target="_blank" rel="noreferrer">
                Official query <ExternalLink size={14} />
              </a>
            </article>
          ))
        )}
        <p className="fine-print">
          Candidates are not qualified comparables or an appraisal. Package allocations, arms-length
          status, condition, exact units, rent and NOI remain unverified.
        </p>
      </section>
      <ScenarioWorkspace
        propertyKey={propertyKey}
        saleCandidates={brief.saleCandidates}
        viewerEmail={viewerEmail}
      />
      <section
        className="brief-section feedback-section"
        aria-label="Partner feedback and outcomes"
      >
        <div className="section-heading">
          <div>
            <p className="eyebrow">Real partner feedback only</p>
            <h3>Review judgment and known outcome</h3>
          </div>
          <span>Current label version {viewerFeedback?.version ?? 0}</span>
        </div>
        <form
          className="feedback-form"
          key={`${propertyKey}:${viewerFeedback?.version ?? 0}`}
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const minutes = String(form.get("researchMinutes") ?? "");
            void onMutate(`/api/research/feedback/${encodeURIComponent(propertyKey)}`, {
              expectedVersion: viewerFeedback?.version ?? 0,
              usefulness: form.get("usefulness"),
              verification: form.get("verification"),
              interest: form.get("interest"),
              outcome: form.get("outcome"),
              researchMinutes: minutes ? Number(minutes) : null,
              reason: form.get("reason"),
            });
          }}
        >
          <label>
            <span>Lead usefulness</span>
            <select name="usefulness" defaultValue={viewerFeedback?.usefulness ?? "unknown"}>
              <option value="unknown">Unknown / not reviewed</option>
              <option value="useful">Useful lead</option>
              <option value="not_useful">Not useful</option>
            </select>
          </label>
          <label>
            <span>Verified state</span>
            <select name="verification" defaultValue={viewerFeedback?.verification ?? "unknown"}>
              <option value="unknown">Unknown</option>
              <option value="unresolved">Verified unresolved</option>
              <option value="resolved">Verified resolved</option>
              <option value="wrong_match">Wrong identity match</option>
              <option value="stale">Stale source</option>
            </select>
          </label>
          <label>
            <span>Interest</span>
            <select name="interest" defaultValue={viewerFeedback?.interest ?? "unknown"}>
              <option value="unknown">Unknown</option>
              <option value="investigate">Worth investigating</option>
              <option value="not_interested">Not interested</option>
            </select>
          </label>
          <label>
            <span>Known result</span>
            <select name="outcome" defaultValue={viewerFeedback?.outcome ?? "none"}>
              <option value="none">No offer or close known</option>
              <option value="unknown">Outcome unknown</option>
              <option value="offer_made">Offer made</option>
              <option value="closed">Closed</option>
            </select>
          </label>
          <label>
            <span>Research minutes</span>
            <input
              name="researchMinutes"
              type="number"
              min={0}
              max={1440}
              defaultValue={viewerFeedback?.researchMinutes ?? ""}
            />
          </label>
          <label className="wide">
            <span>Reason / evidence reviewed</span>
            <textarea
              name="reason"
              required
              minLength={3}
              maxLength={1000}
              defaultValue={
                viewerFeedback?.reason ?? "Review pending; current state remains unknown"
              }
            />
          </label>
          <button className="button primary" type="submit">
            Save my current review label
          </button>
        </form>
        <p className="fine-print">
          {support.performance.dataBoundary} Revisions update one reviewer/property sample and
          remain in audit; they never become extra independent samples.
        </p>
        <div className="performance-summary">
          <strong>{support.performance.judgmentCount} reviewer judgments</strong>
          <span>{support.performance.uniquePropertyCount} unique properties</span>
        </div>
        {support.performance.groups.length === 0 ? (
          <p>No real review labels yet. Sparse feedback does not produce an adjustment.</p>
        ) : (
          support.performance.groups.map((group) => (
            <article className="performance-row" key={`${group.market}:${group.signalCombination}`}>
              <strong>
                {group.market} · {group.signalCombination.replaceAll(",", " + ")}
              </strong>
              <span>
                {group.sampleCount} judgments / {group.uniquePropertyCount} properties ·{" "}
                {group.usefulCount} useful · {group.notUsefulCount} not useful ·{" "}
                {group.unknownCount} unknown
              </span>
              <small>
                Offers {group.offerCount} · closes {group.closedCount} · {group.researchMinutes}{" "}
                minutes across {group.timedReviewCount} timed reviews
              </small>
              <p>
                {group.adjustmentStatus.replaceAll("_", " ")} · adjustment{" "}
                {group.priorityAdjustment >= 0 ? "+" : ""}
                {group.priorityAdjustment} · {group.rationale}
              </p>
            </article>
          ))
        )}
        <form
          className="inline-form ranking-profile-form"
          key={`ranking:${support.rankingProfile.version}`}
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            void onMutate("/api/research/ranking-profile", {
              expectedVersion: support.rankingProfile.version,
              enabled: form.has("enabled"),
              minimumSamples: Number(form.get("minimumSamples")),
              maximumAdjustment: Number(form.get("maximumAdjustment")),
              reason: form.get("reason"),
            });
          }}
        >
          <label>
            <input name="enabled" type="checkbox" defaultChecked={support.rankingProfile.enabled} />{" "}
            Enable optional bounded adjustment
          </label>
          <label>
            <span>Minimum labeled samples</span>
            <input
              name="minimumSamples"
              type="number"
              min={3}
              max={100}
              defaultValue={support.rankingProfile.minimumSamples}
            />
          </label>
          <label>
            <span>Maximum points</span>
            <input
              name="maximumAdjustment"
              type="number"
              min={1}
              max={20}
              defaultValue={support.rankingProfile.maximumAdjustment}
            />
          </label>
          <label className="wide">
            <span>Versioned rationale / reset reason</span>
            <input
              name="reason"
              required
              minLength={3}
              maxLength={1000}
              defaultValue={support.rankingProfile.reason}
            />
          </label>
          <button className="button secondary" type="submit">
            Save toggle / reset to baseline
          </button>
        </form>
      </section>
      <section className="brief-two-column">
        <div>
          <p className="eyebrow">Missing facts</p>
          <ul>
            {brief.missingFacts.map((fact) => (
              <li key={fact}>{fact}</li>
            ))}
          </ul>
        </div>
        <div>
          <p className="eyebrow">Next verification steps</p>
          <ol>
            {brief.nextChecks.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>
      </section>
      <section className="brief-section">
        <p className="eyebrow">Append-only partner notes</p>
        {brief.notes.length === 0 ? (
          <p>No partner notes yet.</p>
        ) : (
          brief.notes.map((note) => (
            <article className="note" key={note.id}>
              <p>{note.body}</p>
              <small>
                {note.authorEmail} · {formatTimestamp(note.createdAt)}
              </small>
            </article>
          ))
        )}
        <form
          className="inline-form"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const body = String(form.get("body") ?? "");
            event.currentTarget.reset();
            void onMutate(`/api/research/notes/${encodeURIComponent(propertyKey)}`, { body });
          }}
        >
          <label>
            <span className="sr-only">New note</span>
            <textarea
              name="body"
              required
              maxLength={4000}
              placeholder="Add a sourced research note…"
            />
          </label>
          <button className="button primary" type="submit">
            Add note as {viewerEmail}
          </button>
        </form>
      </section>
    </>
  );
}

const flipScenarioFields = [
  ["purchasePrice", "Proposed purchase price", "money"],
  ["acquisitionFixed", "Fixed acquisition costs", "money"],
  ["acquisitionRate", "Acquisition cost rate (decimal)", "rate"],
  ["rehab", "Rehab assumption", "money"],
  ["contingencyRate", "Rehab contingency rate (decimal)", "rate"],
  ["holdingMonths", "Holding months", "months"],
  ["holdingMonthly", "Monthly holding costs", "money"],
  ["loanToPurchase", "New-loan share of purchase (decimal)", "rate"],
  ["annualInterestRate", "Annual interest rate (decimal)", "rate"],
  ["originationRate", "Origination rate (decimal)", "rate"],
  ["financingFixed", "Fixed financing fees", "money"],
  ["salePrice", "Explicit exit-price assumption", "money"],
  ["sellingRate", "Selling cost rate (decimal)", "rate"],
  ["sellingFixed", "Fixed selling costs", "money"],
  ["targetProfit", "Target dollar profit", "money"],
] as const;
const rentalScenarioFields = [
  ["purchasePrice", "Proposed purchase price", "money"],
  ["acquisitionFixed", "Fixed acquisition costs", "money"],
  ["acquisitionRate", "Acquisition cost rate (decimal)", "rate"],
  ["rehab", "Rehab assumption", "money"],
  ["contingencyRate", "Rehab contingency rate (decimal)", "rate"],
  ["stabilizationMonths", "Stabilization months", "months"],
  ["stabilizationMonthly", "Monthly stabilization costs", "money"],
  ["loanToPurchase", "New-loan share of purchase (decimal)", "rate"],
  ["annualInterestRate", "Annual interest rate (decimal)", "rate"],
  ["originationRate", "Origination rate (decimal)", "rate"],
  ["financingFixed", "Fixed financing fees", "money"],
  ["loanTermMonths", "Modeled new-loan term months", "months"],
  ["elapsedLoanMonths", "Separate loan-balance snapshot month", "months"],
  ["monthlyRent", "Monthly rent assumption", "money"],
  ["otherMonthlyIncome", "Other monthly income", "money"],
  ["vacancyRate", "Vacancy rate (decimal)", "rate"],
  ["monthlyTaxes", "Recurring monthly property taxes", "money"],
  ["monthlyInsurance", "Monthly insurance", "money"],
  ["monthlyHoa", "Monthly HOA", "money"],
  ["otherMonthlyOperating", "Other monthly operating costs", "money"],
  ["maintenanceRate", "Maintenance rate (decimal)", "rate"],
  ["managementRate", "Management rate (decimal)", "rate"],
  ["monthlyCapex", "Monthly capex reserve below NOI", "money"],
  ["targetAllInYield", "Target unlevered NOI/all-in yield", "rate"],
] as const;

function scenarioStoredValue(scenario: ScenarioData | null, field: string, unit: string) {
  if (!scenario) {
    return "";
  }
  const cell = (
    scenario.inputs as Record<string, { value?: number | null; valueCents?: number | null }>
  )[field];
  if (!cell) {
    return "";
  }
  const value =
    unit === "money"
      ? cell.valueCents === null
        ? null
        : (cell.valueCents ?? 0) / 100
      : cell.value;
  return value === null || value === undefined ? "" : String(value);
}

function scenarioStoredDate(scenario: ScenarioData | null, field: string) {
  const cell = (scenario?.inputs as Record<string, { asOf?: string | null }> | null | undefined)?.[
    field
  ];
  return cell?.asOf ?? "";
}

type StoredSensitivityCase = {
  name: string;
  overrides: Record<
    string,
    { value?: number | null; valueCents?: number | null; asOf?: string | null }
  >;
};

function storedSensitivityValue(cell: StoredSensitivityCase["overrides"][string], unit: string) {
  const value =
    unit === "money"
      ? cell.valueCents === null || cell.valueCents === undefined
        ? null
        : cell.valueCents / 100
      : cell.value;
  return value === null || value === undefined ? "" : String(value);
}

function ScenarioWorkspace({
  propertyKey,
  saleCandidates,
  viewerEmail,
}: {
  propertyKey: string;
  saleCandidates: DealBriefData["saleCandidates"];
  viewerEmail: string;
}) {
  const [scenarios, setScenarios] = useState<ScenarioData[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [kind, setKind] = useState<"flip" | "rental">("flip");
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const editing = scenarios.find((entry) => entry.id === editingId) ?? null;
  const fields = kind === "flip" ? flipScenarioFields : rentalScenarioFields;
  const editingSensitivity = (editing?.sensitivity ?? []) as StoredSensitivityCase[];
  const currentCandidateIds = new Set(saleCandidates.map((sale) => sale.id));
  const candidateEditorEntries = [
    ...saleCandidates.map((sale) => ({
      saleId: sale.id,
      candidateAddress: sale.candidateAddress,
      candidateParcelId: sale.candidateParcelId,
      salePriceCents: sale.salePriceCents,
    })),
    ...(editing?.saleCandidateReferences ?? [])
      .filter((reference) => !currentCandidateIds.has(reference.saleId))
      .map((reference) => ({
        saleId: reference.saleId,
        candidateAddress: reference.candidateAddress,
        candidateParcelId: reference.candidateParcelId,
        salePriceCents: reference.salePriceCents,
      })),
  ];

  const reload = useCallback(async () => {
    const response = await fetch(`/api/research/scenarios/${encodeURIComponent(propertyKey)}`, {
      credentials: "same-origin",
    });
    if (!response.ok) {
      throw new Error("Could not load deal scenarios.");
    }
    setScenarios(((await response.json()) as { scenarios: ScenarioData[] }).scenarios);
    setBusy(false);
  }, [propertyKey]);

  useEffect(() => {
    setBusy(true);
    void reload().catch((cause) => {
      setMessage(cause instanceof Error ? cause.message : "Could not load deal scenarios.");
      setBusy(false);
    });
  }, [reload]);

  return (
    <section className="brief-section scenario-workspace" aria-label="Deal economics scenarios">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Named deal economics</p>
          <h3>Flip and rental assumptions</h3>
        </div>
        <span>{scenarios.length} persisted</span>
      </div>
      <p className="fine-print">
        Amounts are USD and persist as integer cents. Blank means unknown, never zero. Inputs are
        dated partner assumptions: assessments, arrears, and other-parcel sales cannot become
        purchase, rehab, exit, recurring-tax, payoff, equity, title, or valuation facts.
      </p>
      {message ? (
        <div className="notice" role="status">
          {message}
        </div>
      ) : null}
      {busy ? <p>Loading persisted scenarios…</p> : null}
      <div className="scenario-list">
        {scenarios.map((scenario) => {
          const result = scenario.result as {
            evaluation?: {
              status: string;
              value?: Record<string, unknown>;
              issues?: Array<{ path: string; message: string }>;
            };
            sensitivity?: {
              value?: Array<{
                name: string;
                result: {
                  status: string;
                  value?: Record<string, unknown>;
                  issues?: Array<{ path: string }>;
                };
              }>;
            };
          };
          const values = result.evaluation?.value;
          return (
            <article className="workspace-card scenario-card" key={scenario.id}>
              <strong>{scenario.name}</strong>
              <span>
                {scenario.kind} · version {scenario.version} · {scenario.updatedBy}
              </span>
              {result.evaluation?.status === "ok" && values ? (
                <dl className="scenario-results">
                  <Detail
                    label="Cash invested"
                    value={formatScenarioMoney(values["cashInvested"])}
                  />
                  <Detail
                    label="Modeled loan principal"
                    value={formatScenarioMoney(values["loanPrincipal"])}
                  />
                  <Detail
                    label="Acquisition costs"
                    value={formatScenarioMoney(values["acquisitionCosts"])}
                  />
                  <Detail label="Rehab" value={formatScenarioMoney(values["rehab"])} />
                  <Detail
                    label="Rehab contingency"
                    value={formatScenarioMoney(values["contingency"])}
                  />
                  {scenario.kind === "flip" ? (
                    <>
                      <Detail
                        label="Holding costs"
                        value={formatScenarioMoney(values["holding"])}
                      />
                      <Detail
                        label="Financing interest"
                        value={formatScenarioMoney(values["interest"])}
                      />
                      <Detail
                        label="Loan origination"
                        value={formatScenarioMoney(values["origination"])}
                      />
                      <Detail
                        label="Fixed financing fees"
                        value={formatScenarioMoney(values["financingFixed"])}
                      />
                      <Detail
                        label="Selling costs"
                        value={formatScenarioMoney(values["sellingCosts"])}
                      />
                      <Detail
                        label="Total modeled costs"
                        value={formatScenarioMoney(values["totalCosts"])}
                      />
                      <Detail label="Profit" value={formatScenarioMoney(values["profit"])} />
                      <Detail label="Cash ROI" value={formatScenarioRatio(values["cashROI"])} />
                      <Detail
                        label="Break-even sale"
                        value={formatScenarioMoney(values["breakEvenSale"])}
                      />
                      <Detail
                        label="Maximum purchase for target profit"
                        value={formatScenarioSolution(values["maxPurchaseForTargetProfit"])}
                        wide
                      />
                    </>
                  ) : (
                    <>
                      <Detail
                        label="Stabilization costs"
                        value={formatScenarioMoney(values["stabilizationCosts"])}
                      />
                      <Detail
                        label="Loan origination"
                        value={formatScenarioMoney(values["origination"])}
                      />
                      <Detail
                        label="Fixed financing fees"
                        value={formatScenarioMoney(values["financingFixed"])}
                      />
                      <Detail
                        label="Stabilization debt payments"
                        value={formatScenarioMoney(values["stabilizationDebtPayments"])}
                      />
                      <Detail
                        label="All-in unlevered basis"
                        value={formatScenarioMoney(values["allInUnleveredBasis"])}
                      />
                      <Detail
                        label="First stabilized-year effective income"
                        value={formatScenarioMoney(values["annualEffectiveIncome"])}
                      />
                      <Detail
                        label="First stabilized-year operating costs"
                        value={formatScenarioMoney(values["annualOperatingCosts"])}
                      />
                      <Detail
                        label="First stabilized-year NOI"
                        value={formatScenarioMoney(values["annualNOI"])}
                      />
                      <Detail
                        label="First stabilized-year cash flow"
                        value={formatScenarioMoney(values["annualCashFlow"])}
                      />
                      <Detail
                        label="Cash-on-cash"
                        value={formatScenarioRatio(values["cashOnCash"])}
                      />
                      <Detail
                        label="Elapsed-loan balance snapshot"
                        value={formatScenarioMoney(values["remainingLoanBalance"])}
                      />
                      <Detail
                        label="First stabilized-year capex reserve"
                        value={formatScenarioMoney(values["annualCapexReserve"])}
                      />
                      <Detail
                        label="Monthly debt payment"
                        value={formatScenarioMoney(values["monthlyDebtPayment"])}
                      />
                      <Detail
                        label="First stabilized-year debt service"
                        value={formatScenarioMoney(values["annualDebtService"])}
                      />
                      <Detail
                        label="Break-even monthly rent"
                        value={formatScenarioSolution(values["breakEvenMonthlyRent"])}
                        wide
                      />
                      <Detail
                        label="Max purchase · unlevered NOI/all-in before capex"
                        value={formatScenarioSolution(values["maxPurchaseForTargetYield"])}
                        wide
                      />
                    </>
                  )}
                </dl>
              ) : (
                <div className="missing-inputs">
                  <strong>Calculation needs explicit inputs</strong>
                  <ul>
                    {(result.evaluation?.issues ?? []).map((issue) => (
                      <li key={`${issue.path}:${issue.message}`}>
                        {issue.path.replace("inputs.", "")} · {issue.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {(result.sensitivity?.value ?? []).map((entry) => (
                <small key={entry.name}>
                  Sensitivity {entry.name}:{" "}
                  {entry.result.status === "ok"
                    ? scenario.kind === "flip"
                      ? `profit ${formatScenarioMoney(entry.result.value?.["profit"])}`
                      : `cash flow ${formatScenarioMoney(entry.result.value?.["annualCashFlow"])}`
                    : `needs ${(entry.result.issues ?? []).map((issue) => issue.path.replace("inputs.", "")).join(", ")}`}
                </small>
              ))}
              {scenario.saleCandidateReferences.map((candidate) => (
                <small key={candidate.saleId}>
                  {candidate.disposition.replaceAll("_", " ")}:{" "}
                  {candidate.candidateAddress ?? candidate.candidateParcelId} · {candidate.reason}.
                  Saved evidence {candidate.savedEvidenceStatus.replaceAll("_", " ")} · current
                  source {candidate.currentSourceStatus.replaceAll("_", " ")}. Supporting transfer
                  only; not a verified exit.
                </small>
              ))}
              <button
                className="button secondary"
                type="button"
                onClick={() => {
                  setEditingId(scenario.id);
                  setKind(scenario.kind);
                }}
              >
                Edit scenario
              </button>
            </article>
          );
        })}
      </div>
      <details className="scenario-editor" open={scenarios.length === 0 || editing !== null}>
        <summary>{editing ? `Edit ${editing.name}` : "Create a named scenario"}</summary>
        <form
          className="scenario-form"
          key={`${editing?.id ?? "new"}:${kind}`}
          onSubmit={(event) => {
            event.preventDefault();
            setBusy(true);
            setMessage(null);
            const form = new FormData(event.currentTarget);
            const sharedAsOf = String(form.get("asOf") ?? "");
            const redateAll = form.get("redateAll") === "on";
            const inputs = Object.fromEntries(
              fields.map(([field]) => {
                const raw = String(form.get(field) ?? "");
                const fieldAsOf = editing ? String(form.get(`${field}:asOf`) ?? "") : sharedAsOf;
                return [
                  field,
                  raw === ""
                    ? null
                    : { value: Number(raw), asOf: redateAll ? sharedAsOf : fieldAsOf },
                ];
              }),
            );
            const sensitivityName = String(form.get("sensitivityName") ?? "");
            const sensitivityField = String(form.get("sensitivityField") ?? "");
            const sensitivityValue = String(form.get("sensitivityValue") ?? "");
            const preservedSensitivity = editingSensitivity.flatMap((entry, caseIndex) => {
              if (form.get(`sensitivity:${caseIndex}:remove`) === "on") {
                return [];
              }
              const overrides = Object.fromEntries(
                Object.entries(entry.overrides).flatMap(([field]) => {
                  if (form.get(`sensitivity:${caseIndex}:${field}:remove`) === "on") {
                    return [];
                  }
                  const raw = String(form.get(`sensitivity:${caseIndex}:${field}:value`) ?? "");
                  const date = String(form.get(`sensitivity:${caseIndex}:${field}:asOf`) ?? "");
                  return raw === "" ? [] : [[field, { value: Number(raw), asOf: date }]];
                }),
              );
              return Object.keys(overrides).length
                ? [
                    {
                      name: String(form.get(`sensitivity:${caseIndex}:name`) ?? ""),
                      overrides,
                    },
                  ]
                : [];
            });
            const candidateSelections = candidateEditorEntries.flatMap((candidate) => {
              const disposition = String(
                form.get(`candidate:${candidate.saleId}:disposition`) ?? "",
              );
              return disposition
                ? [
                    {
                      saleId: candidate.saleId,
                      disposition,
                      reason: String(form.get(`candidate:${candidate.saleId}:reason`) ?? ""),
                    },
                  ]
                : [];
            });
            const candidateRemovals = candidateEditorEntries.flatMap((candidate) => {
              const existing = editing?.saleCandidateReferences.some(
                (reference) => reference.saleId === candidate.saleId,
              );
              const disposition = String(
                form.get(`candidate:${candidate.saleId}:disposition`) ?? "",
              );
              return existing && !disposition ? [candidate.saleId] : [];
            });
            void fetch(`/api/research/scenarios/${encodeURIComponent(propertyKey)}`, {
              method: "POST",
              credentials: "same-origin",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                id: editing?.id ?? null,
                expectedVersion: editing?.version ?? 0,
                name: form.get("name"),
                kind,
                financing: kind === "rental" ? form.get("financing") : null,
                inputs,
                sensitivity: [
                  ...preservedSensitivity,
                  ...(sensitivityName && sensitivityField && sensitivityValue !== ""
                    ? [
                        {
                          name: sensitivityName,
                          overrides: {
                            [sensitivityField]: {
                              value: Number(sensitivityValue),
                              asOf: String(form.get("sensitivityAsOf") ?? "") || sharedAsOf,
                            },
                          },
                        },
                      ]
                    : []),
                ],
                candidateSelections,
                candidateRemovals,
              }),
            })
              .then(async (response) => {
                const payload = (await response.json()) as { error?: string };
                if (!response.ok) {
                  throw new Error(payload.error ?? "Scenario could not be saved.");
                }
                setEditingId(null);
                setMessage("Scenario and calculated results persisted.");
                return reload();
              })
              .catch((cause) => {
                setMessage(cause instanceof Error ? cause.message : "Scenario could not be saved.");
                setBusy(false);
              });
          }}
        >
          <label>
            <span>Scenario name</span>
            <input name="name" required maxLength={160} defaultValue={editing?.name ?? ""} />
          </label>
          <label>
            <span>Strategy</span>
            <select
              value={kind}
              onChange={(event) => {
                setEditingId(null);
                setKind(event.target.value as "flip" | "rental");
              }}
            >
              <option value="flip">Flip · interest-only acquisition model</option>
              <option value="rental">Rental / hold · first stabilized year</option>
            </select>
          </label>
          {kind === "rental" ? (
            <label>
              <span>Financing choice</span>
              <select name="financing" defaultValue={editing?.financing ?? "cash"}>
                <option value="cash">Cash · loan inputs must be zero</option>
                <option value="amortizing">Amortizing modeled new loan</option>
              </select>
            </label>
          ) : null}
          <label>
            <span>{editing ? "New date for explicit re-date action" : "Assumptions as of"}</span>
            <input name="asOf" type="date" />
          </label>
          {editing ? (
            <label className="check-row">
              <input name="redateAll" type="checkbox" />
              <span>Explicitly apply that new date to every populated assumption</span>
            </label>
          ) : null}
          <div className="scenario-input-grid">
            {fields.map(([field, label, unit]) => (
              <div className="scenario-input-cell" key={field}>
                <label>
                  <span>
                    {label}
                    {unit === "money" ? " · USD" : ""}
                  </span>
                  <input
                    name={field}
                    type="number"
                    min={0}
                    step={unit === "money" ? "0.01" : unit === "months" ? "1" : "0.0001"}
                    defaultValue={scenarioStoredValue(editing, field, unit)}
                    placeholder="Unknown"
                  />
                </label>
                {editing ? (
                  <label>
                    <span>{label} as of</span>
                    <input
                      name={`${field}:asOf`}
                      type="date"
                      defaultValue={scenarioStoredDate(editing, field)}
                    />
                  </label>
                ) : null}
              </div>
            ))}
          </div>
          {editingSensitivity.map((entry, caseIndex) => (
            <fieldset className="saved-sensitivity" key={entry.name}>
              <legend>Saved sensitivity case {caseIndex + 1}</legend>
              <label>
                <span>Case name</span>
                <input
                  name={`sensitivity:${caseIndex}:name`}
                  maxLength={160}
                  defaultValue={entry.name}
                />
              </label>
              {Object.entries(entry.overrides).map(([field, cell]) => {
                const fieldDefinition = fields.find(([candidate]) => candidate === field);
                if (!fieldDefinition) {
                  return null;
                }
                const [, label, unit] = fieldDefinition;
                return (
                  <div className="saved-sensitivity-override" key={field}>
                    <label>
                      <span>{label}</span>
                      <input
                        name={`sensitivity:${caseIndex}:${field}:value`}
                        type="number"
                        min={0}
                        step={unit === "money" ? "0.01" : unit === "months" ? "1" : "0.0001"}
                        defaultValue={storedSensitivityValue(cell, unit)}
                      />
                    </label>
                    <label>
                      <span>{label} as of</span>
                      <input
                        name={`sensitivity:${caseIndex}:${field}:asOf`}
                        type="date"
                        defaultValue={cell.asOf ?? ""}
                      />
                    </label>
                    <label className="check-row">
                      <input name={`sensitivity:${caseIndex}:${field}:remove`} type="checkbox" />
                      <span>Explicitly remove this override</span>
                    </label>
                  </div>
                );
              })}
              <label className="check-row">
                <input name={`sensitivity:${caseIndex}:remove`} type="checkbox" />
                <span>Explicitly remove this saved sensitivity case</span>
              </label>
            </fieldset>
          ))}
          <fieldset>
            <legend>Add another named sensitivity calculation</legend>
            <label>
              <span>Case name</span>
              <input name="sensitivityName" maxLength={160} />
            </label>
            <label>
              <span>Field</span>
              <select name="sensitivityField" defaultValue="">
                <option value="">No case</option>
                {fields.map(([field, label]) => (
                  <option key={field} value={field}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Absolute alternate value · same units</span>
              <input name="sensitivityValue" type="number" min={0} step="0.0001" />
            </label>
            <label>
              <span>New sensitivity as of</span>
              <input name="sensitivityAsOf" type="date" />
            </label>
          </fieldset>
          {candidateEditorEntries.length ? (
            <fieldset className="scenario-candidates">
              <legend>Official transfer candidates · support only, never verified exit</legend>
              {candidateEditorEntries.map((sale) => {
                const existing = editing?.saleCandidateReferences.find(
                  (entry) => entry.saleId === sale.saleId,
                );
                return (
                  <div key={sale.saleId}>
                    <strong>
                      {sale.candidateAddress ?? sale.candidateParcelId} ·{" "}
                      {formatMoney(sale.salePriceCents)}
                    </strong>
                    {existing ? (
                      <small>
                        Saved evidence {existing.savedEvidenceStatus.replaceAll("_", " ")} · current
                        source {existing.currentSourceStatus.replaceAll("_", " ")}
                      </small>
                    ) : null}
                    <select
                      name={`candidate:${sale.saleId}:disposition`}
                      defaultValue={existing?.disposition ?? ""}
                    >
                      <option value="">Not referenced</option>
                      <option value="selected_support">Selected support</option>
                      <option value="excluded">Excluded</option>
                    </select>
                    <input
                      name={`candidate:${sale.saleId}:reason`}
                      maxLength={1000}
                      defaultValue={existing?.reason ?? ""}
                      placeholder="Required reason"
                    />
                  </div>
                );
              })}
            </fieldset>
          ) : null}
          <div className="button-row">
            <button className="button primary" type="submit" disabled={busy}>
              {busy ? "Calculating…" : editing ? "Save scenario revision" : "Create scenario"}
            </button>
            {editing ? (
              <button className="button secondary" type="button" onClick={() => setEditingId(null)}>
                Cancel edit
              </button>
            ) : null}
          </div>
        </form>
      </details>
      <p className="fine-print">
        Signed in as {viewerEmail}. Rental annual metrics cover the first 12 stabilized months.
        Elapsed loan months is a separate balance snapshot. Rental max offer is unlevered NOI/all-in
        basis before capex, never cash-on-cash.
      </p>
    </section>
  );
}

function formatScenarioMoney(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 2,
      }).format(value)
    : "Not calculable";
}
function formatScenarioRatio(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? `${(value * 100).toFixed(2)}%`
    : "Not calculable";
}
function formatScenarioSolution(value: unknown) {
  if (!value || typeof value !== "object") {
    return "Not calculable";
  }
  const result = value as { status?: string; amount?: number | null };
  return result.status === "feasible"
    ? formatScenarioMoney(result.amount)
    : (result.status ?? "Not calculable");
}

function BenchmarkWorkspace({
  benchmarks,
  selectedKeys,
  buyBoxes,
  viewerEmail,
  onReload,
  onNotice,
}: {
  benchmarks: BenchmarkData[];
  selectedKeys: string[];
  buyBoxes: BuyBoxData[];
  viewerEmail: string;
  onReload: () => Promise<void>;
  onNotice: (message: string | null) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const selected = benchmarks.find((entry) => entry.id === selectedId) ?? benchmarks[0] ?? null;

  async function post(path: string, body: unknown) {
    setSaving(true);
    onNotice(null);
    try {
      const response = await fetch(path, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as { id?: string; error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Blind comparison update failed.");
      }
      if (payload.id) {
        setSelectedId(payload.id);
      }
      await onReload();
      onNotice("Blind comparison state persisted.");
    } catch (cause) {
      onNotice(cause instanceof Error ? cause.message : "Blind comparison update failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section
      className="partner-workspace-panel benchmark-workspace"
      aria-label="Blind benchmark workspace"
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">Held-out blind comparison</p>
          <h2>Licensed shortlist benchmark</h2>
        </div>
        <span>Descriptive only · excluded from ranking feedback</span>
      </div>
      <p>
        Compare the exact selected Property Watch shortlist with a user-owned licensed CSV under one
        market, date, and immutable buy-box fingerprint. No competitor result exists until that
        export is supplied and independently reviewed.
      </p>
      <details className="benchmark-create" open={benchmarks.length === 0}>
        <summary>
          Create comparison from {selectedKeys.length} selected shortlist key
          {selectedKeys.length === 1 ? "" : "s"}
        </summary>
        <form
          className="benchmark-form"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            void post("/api/research/benchmarks", {
              privateName: form.get("privateName"),
              market: "norfolk-va",
              asOfDate: form.get("asOfDate"),
              buyBoxId: form.get("buyBoxId"),
              propertyKeys: selectedKeys,
              competitorCsv: form.get("competitorCsv"),
              tokenHeader: form.get("tokenHeader"),
              competitorLabel: form.get("competitorLabel"),
              fileName: form.get("fileName"),
              mode: form.get("mode"),
              licenseAcknowledged: form.get("licensed") === "on",
            });
          }}
        >
          <label>
            <span>Private setup name</span>
            <input name="privateName" required maxLength={160} />
          </label>
          <label>
            <span>Market / neutral scheme</span>
            <input value="Norfolk · exact tax-account" readOnly />
          </label>
          <label>
            <span>Comparison as of</span>
            <input name="asOfDate" type="date" required />
          </label>
          <label>
            <span>Persisted buy-box version/content</span>
            <select name="buyBoxId" required defaultValue="">
              <option value="" disabled>
                Select a buy box
              </option>
              {buyBoxes.map((buyBox) => (
                <option key={buyBox.id} value={buyBox.id}>
                  {buyBox.name} · v{buyBox.version}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Private licensed source label</span>
            <input name="competitorLabel" required maxLength={200} />
          </label>
          <label>
            <span>Private export file name</span>
            <input name="fileName" required maxLength={200} />
          </label>
          <label>
            <span>Exact identifier column header</span>
            <input name="tokenHeader" required maxLength={200} />
          </label>
          <label>
            <span>Comparison data mode</span>
            <select name="mode" defaultValue="live">
              <option value="live">Live licensed comparison</option>
              <option value="test-only">Clearly labeled internal test only</option>
            </select>
          </label>
          <label className="wide">
            <span>Licensed CSV · max 60,000 UTF-8 bytes / 1,000 rows</span>
            <textarea name="competitorCsv" required placeholder={"parcel_id\n15834200\n00000218"} />
          </label>
          <label className="wide checkbox-label">
            <input name="licensed" type="checkbox" required />I confirm this is a user-owned
            licensed export; no paywall or private login was scraped.
          </label>
          <button
            className="button primary"
            type="submit"
            disabled={saving || selectedKeys.length === 0 || buyBoxes.length === 0}
          >
            Persist randomized blind order
          </button>
        </form>
      </details>
      {benchmarks.length === 0 ? (
        <div className="empty-state">
          <FileSearch2 size={28} />
          <h3>Awaiting a licensed export</h3>
          <p>No source performance or comparison is seeded or claimed.</p>
        </div>
      ) : (
        <>
          <label className="benchmark-picker">
            <span>Comparison</span>
            <select
              value={selected?.id ?? ""}
              onChange={(event) => setSelectedId(event.target.value)}
            >
              {benchmarks.map((benchmark) => (
                <option key={benchmark.id} value={benchmark.id}>
                  {benchmark.displayName} · {benchmark.status}
                </option>
              ))}
            </select>
          </label>
          {selected ? (
            <div className="benchmark-detail">
              <article className="workspace-card benchmark-summary">
                <strong>{selected.displayName}</strong>
                <span>
                  {selected.market} · {selected.asOfDate} · buy box v{selected.buyBoxVersion} ·{" "}
                  {selected.metrics.mode}
                </span>
                <small>{selected.buyBoxFingerprint}</small>
                {selected.frozenCriteria ? (
                  <details className="frozen-criteria">
                    <summary>Frozen source-neutral review criteria</summary>
                    <dl>
                      <Detail
                        label="Property types"
                        value={selected.frozenCriteria.propertyTypes.join(", ") || "Any"}
                      />
                      <Detail
                        label="Jurisdictions"
                        value={selected.frozenCriteria.jurisdictions.join(", ") || "Any"}
                      />
                      <Detail
                        label="Neighborhoods"
                        value={selected.frozenCriteria.neighborhoods.join(", ") || "Any"}
                      />
                      <Detail
                        label="ZIP codes"
                        value={selected.frozenCriteria.zips.join(", ") || "Any"}
                      />
                      <Detail
                        label="Size range"
                        value={`${selected.frozenCriteria.minSizeValue ?? "No minimum"} – ${selected.frozenCriteria.maxSizeValue ?? "No maximum"} · ${selected.frozenCriteria.sizeBasis}`}
                      />
                      <Detail
                        label="Value range · cents"
                        value={`${selected.frozenCriteria.minValueCents ?? "No minimum"} – ${selected.frozenCriteria.maxValueCents ?? "No maximum"} · ${selected.frozenCriteria.valueBasis}`}
                      />
                      <Detail
                        label="Distress phases"
                        value={selected.frozenCriteria.distressPhases.join(", ") || "Any"}
                      />
                    </dl>
                  </details>
                ) : (
                  <small>
                    Frozen criteria unavailable for this legacy benchmark; no criteria were
                    reconstructed or fabricated.
                  </small>
                )}
                <small>
                  {selected.cards.length} neutral cards · {selected.metrics.union.reviewJudgments}{" "}
                  reviewed · {selected.metrics.union.missingJudgments} missing judgments
                </small>
                <small>
                  Role {selected.role.replaceAll("_", " ")} · {viewerEmail}
                </small>
              </article>
              <div className="blind-card-list">
                {selected.cards.map((card, index) => {
                  const review = selected.ownReviews.find((entry) => entry.cardId === card.cardId);
                  return (
                    <article className="workspace-card blind-card" key={card.cardId}>
                      <strong>Blind card {index + 1}</strong>
                      <span>
                        {card.identifier.market} · {card.identifier.scheme} ·{" "}
                        {card.identifier.token}
                      </span>
                      {selected.canReview ? (
                        <form
                          key={`${card.cardId}:${review?.version ?? 0}`}
                          onSubmit={(event) => {
                            event.preventDefault();
                            const form = new FormData(event.currentTarget);
                            const seconds = String(form.get("researchSeconds") ?? "");
                            void post(
                              `/api/research/benchmarks/${encodeURIComponent(selected.id)}/reviews`,
                              {
                                cardId: card.cardId,
                                expectedVersion: review?.version ?? 0,
                                useful: form.get("useful"),
                                correctness: form.get("correctness"),
                                researchSeconds: seconds === "" ? null : Number(seconds),
                                reason: form.get("reason"),
                              },
                            );
                          }}
                        >
                          <label>
                            <span>Worth investigating?</span>
                            <select name="useful" defaultValue={review?.useful ?? "unknown"}>
                              <option value="unknown">Unknown</option>
                              <option value="yes">Yes</option>
                              <option value="no">No</option>
                            </select>
                          </label>
                          <label>
                            <span>Qualifying unresolved-status claim correct?</span>
                            <select
                              name="correctness"
                              defaultValue={review?.correctness ?? "unknown"}
                            >
                              <option value="unknown">Unknown</option>
                              <option value="yes">Yes</option>
                              <option value="no">No</option>
                            </select>
                          </label>
                          <label>
                            <span>Research seconds · blank is missing</span>
                            <input
                              name="researchSeconds"
                              type="number"
                              min={0}
                              max={604800}
                              defaultValue={review?.researchSeconds ?? ""}
                            />
                          </label>
                          <label>
                            <span>Independent reason</span>
                            <textarea
                              name="reason"
                              required
                              maxLength={2000}
                              defaultValue={
                                review?.reason ?? "Evidence check pending; judgment remains unknown"
                              }
                            />
                          </label>
                          <button className="button secondary" type="submit" disabled={saving}>
                            Save blind review v{review?.version ?? 0}
                          </button>
                        </form>
                      ) : (
                        <small>
                          {selected.role === "setup_creator"
                            ? "Setup creator cannot review; the assigned independent partner reviews every card."
                            : "No review assignment."}
                        </small>
                      )}
                    </article>
                  );
                })}
              </div>
              {selected.status === "reviewing" && selected.canReveal ? (
                <form
                  className="reveal-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const form = new FormData(event.currentTarget);
                    void post(
                      `/api/research/benchmarks/${encodeURIComponent(selected.id)}/reveal`,
                      {
                        expectedVersion: selected.version,
                        confirmation: form.get("confirmation"),
                      },
                    );
                  }}
                >
                  <label>
                    <span>Irreversible confirmation</span>
                    <input name="confirmation" required placeholder="REVEAL SOURCES" />
                  </label>
                  <button className="button primary" type="submit" disabled={saving}>
                    Irreversibly reveal sources
                  </button>
                </form>
              ) : null}
              {selected.status === "reviewing" &&
              selected.role === "setup_creator" &&
              !selected.canReveal ? (
                <p className="fine-print">
                  Reveal locked: every assigned reviewer must save a judgment, including unknown,
                  for every blind card.
                </p>
              ) : null}
              {selected.status === "revealed" && selected.metrics.sources ? (
                <section className="revealed-metrics">
                  <div className="section-heading">
                    <div>
                      <p className="eyebrow">Post-reveal only</p>
                      <h3>Source-specific descriptive metrics</h3>
                    </div>
                    <a
                      className="button secondary"
                      href={`/api/research/benchmarks/${encodeURIComponent(selected.id)}/export.csv`}
                    >
                      <Download size={16} /> Export actual reviews CSV
                    </a>
                  </div>
                  <p>
                    Union: {selected.metrics.datasetCounts?.uniqueProperties} unique ·{" "}
                    {selected.metrics.datasetCounts?.overlapProperties} overlap ·{" "}
                    {selected.metrics.datasetCounts?.uncertainRows} quarantined. Missing reviews are
                    not failures.
                  </p>
                  {selected.metrics.sources.map((source) => (
                    <article className="workspace-card" key={source.id}>
                      <strong>{source.label}</strong>
                      <span>
                        {source.counts.uniqueProperties} unique ·{" "}
                        {source.counts.exclusiveProperties} source-exclusive ·{" "}
                        {source.counts.duplicateRows} duplicates · {source.counts.uncertainRows}{" "}
                        uncertain
                      </span>
                      <span>
                        Useful yes/no/unknown/missing: {source.metrics.useful.yes}/
                        {source.metrics.useful.no}/{source.metrics.useful.unknown}/
                        {source.metrics.useful.missing}
                      </span>
                      <span>
                        Correct yes/no/unknown/missing: {source.metrics.correctness.yes}/
                        {source.metrics.correctness.no}/{source.metrics.correctness.unknown}/
                        {source.metrics.correctness.missing}
                      </span>
                      <small>
                        Useful known ratio {formatMetricRatio(source.metrics.useful.yesKnownRatio)}{" "}
                        · correctness known ratio{" "}
                        {formatMetricRatio(source.metrics.correctness.yesKnownRatio)} · time per
                        timed useful property{" "}
                        {source.metrics.time.secondsPerTimedUsefulProperty ?? "no denominator"}{" "}
                        seconds · time coverage{" "}
                        {formatMetricRatio(source.metrics.time.timeCoverage)}
                      </small>
                    </article>
                  ))}
                  <p className="fine-print">
                    Descriptive only. No significance, superiority, accuracy, or
                    competitor-performance claim is inferred.
                  </p>
                </section>
              ) : null}
              <ul className="fine-print">
                {selected.blindingLimitations.map((limit) => (
                  <li key={limit}>{limit}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

function formatMetricRatio(value: number | null) {
  return value === null ? "no denominator" : `${(value * 100).toFixed(1)}%`;
}

function PipelineEditor({
  propertyKey,
  pipeline,
  onMutate,
}: {
  propertyKey: string;
  pipeline: DealBriefData["pipeline"];
  onMutate: (path: string, body: unknown) => Promise<unknown>;
}) {
  return (
    <form
      className="pipeline-editor"
      key={`${propertyKey}:${pipeline?.version ?? 0}`}
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const followUp = String(form.get("followUpAt") ?? "");
        void onMutate(`/api/research/pipeline/${encodeURIComponent(propertyKey)}`, {
          expectedVersion: pipeline?.version ?? 0,
          patch: {
            saved: form.has("saved"),
            dismissed: form.has("dismissed"),
            stage: form.get("stage"),
            assignedTo: form.get("assignedTo") || null,
            followUpAt: followUp ? new Date(followUp).toISOString() : null,
            passReason: String(form.get("passReason") ?? "").trim() || null,
          },
        });
      }}
    >
      <p className="eyebrow">Shared review controls · version {pipeline?.version ?? 0}</p>
      <label>
        <input name="saved" type="checkbox" defaultChecked={pipeline?.saved ?? false} /> Saved /
        followed
      </label>
      <label>
        <input name="dismissed" type="checkbox" defaultChecked={pipeline?.dismissed ?? false} />{" "}
        Dismissed (reversible)
      </label>
      <label>
        <span>Stage</span>
        <select name="stage" defaultValue={pipeline?.stage ?? "New"}>
          {["New", "Researching", "Qualified", "Passed"].map((stage) => (
            <option key={stage}>{stage}</option>
          ))}
        </select>
      </label>
      <label>
        <span>Assign</span>
        <select name="assignedTo" defaultValue={pipeline?.assignedTo ?? ""}>
          <option value="">Unassigned</option>
          <option value="ericventor97@gmail.com">ericventor97@gmail.com</option>
          <option value="Rhwcreative@gmail.com">Rhwcreative@gmail.com</option>
        </select>
      </label>
      <label>
        <span>Follow-up</span>
        <input
          name="followUpAt"
          type="datetime-local"
          defaultValue={pipeline?.followUpAt ? pipeline.followUpAt.slice(0, 16) : ""}
        />
      </label>
      <label className="wide">
        <span>Pass reason (required for Passed)</span>
        <input name="passReason" maxLength={500} defaultValue={pipeline?.passReason ?? ""} />
      </label>
      <button className="button primary" type="submit">
        Save review state
      </button>
    </form>
  );
}

function EmptyPanel({ title, body }: { title: string; body: string }) {
  return (
    <div className="empty-state">
      <Inbox size={28} />
      <h3>{title}</h3>
      <p>{body}</p>
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
          Open source evidence <ExternalLink size={16} />
        </a>
        {record.sourceDocumentUrl ? (
          <a
            className="button secondary"
            href={record.sourceDocumentUrl}
            target="_blank"
            rel="noreferrer"
          >
            Dataset metadata / documentation
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

function shortlistDimensions(property: RankedProperty, buyBox: BuyBoxData | null) {
  const filedSignals = new Set<SignalType>([
    "notice_of_default",
    "mortgage_foreclosure_initiated",
    "scheduled_trustee_sale",
    "scheduled_tax_sale",
  ]);
  const distress = property.signalTypes.some((signal) => filedSignals.has(signal))
    ? "Strong"
    : property.independentSignalCount >= 2
      ? "Moderate"
      : property.signalTypes.length > 0
        ? "Early"
        : "Unknown";
  const confidence = property.parcelId
    ? property.freshestSourceUpdatedAt
      ? "Source-backed"
      : "Exact ID · date unknown"
    : "Unknown identity";
  if (!buyBox) {
    return {
      distress: { value: distress },
      confidence: { value: confidence },
      fit: { value: "Unknown", reason: "No buy box selected" },
    };
  }
  let mismatch = false;
  const missing: string[] = [];
  const outside = <T,>(values: readonly T[], actual: T | null | undefined, label: string) => {
    if (values.length === 0) {
      return;
    }
    if (actual === null || actual === undefined || actual === "") {
      missing.push(label);
    } else if (!values.includes(actual)) {
      mismatch = true;
    }
  };
  outside(buyBox.jurisdictions, property.jurisdictionId, "market");
  outside(buyBox.zips, property.zip, "ZIP");
  outside(buyBox.neighborhoods, property.neighborhood, "neighborhood");
  outside(buyBox.propertyTypes, property.normalizedPropertyType, "property type");
  if (buyBox.minSizeValue !== null || buyBox.maxSizeValue !== null) {
    if (buyBox.sizeBasis !== "lot_square_feet" || property.lotAreaSqft === null) {
      missing.push("reliable size");
    } else if (
      (buyBox.minSizeValue !== null && property.lotAreaSqft < buyBox.minSizeValue) ||
      (buyBox.maxSizeValue !== null && property.lotAreaSqft > buyBox.maxSizeValue)
    ) {
      mismatch = true;
    }
  }
  if (buyBox.minValueCents !== null || buyBox.maxValueCents !== null) {
    const value =
      buyBox.valueBasis === "assessed_value"
        ? property.assessedValueCents
        : buyBox.valueBasis === "last_reported_consideration"
          ? property.lastReportedConsiderationCents
          : property.userAssumptionCents;
    if (value === null) {
      missing.push(buyBox.valueBasis.replaceAll("_", " "));
    } else if (
      (buyBox.minValueCents !== null && value < buyBox.minValueCents) ||
      (buyBox.maxValueCents !== null && value > buyBox.maxValueCents)
    ) {
      mismatch = true;
    }
  }
  if (buyBox.distressPhases.length > 0) {
    const phase = property.signalTypes.some((signal) => filedSignals.has(signal))
      ? "filed_foreclosure"
      : "early_distress";
    if (!buyBox.distressPhases.includes(phase)) {
      mismatch = true;
    }
  }
  const status = mismatch ? "Not a match" : missing.length ? "Unknown" : "Match";
  return {
    distress: { value: distress },
    confidence: { value: confidence },
    fit: {
      value: status,
      reason: mismatch
        ? "At least one known criterion is outside the buy box"
        : missing.length
          ? `Missing ${missing.join(", ")}`
          : "All configured criteria match",
    },
  };
}

function changeContext(before: unknown, after: unknown): string {
  const beforeText = before ? JSON.stringify(before) : "not previously published";
  const afterText = after ? JSON.stringify(after) : "not published";
  return `Before: ${beforeText}. After: ${afterText}.`;
}

function splitList(value: FormDataEntryValue | null): string[] {
  return String(value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function dollarsToCents(value: number | null): number | null {
  return value === null ? null : Math.round(value * 100);
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
