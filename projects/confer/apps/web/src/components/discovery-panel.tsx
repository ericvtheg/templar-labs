import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCheck,
  ChevronRight,
  Circle,
  FilePenLine,
  FileSearch,
  FileText,
  Info,
  ListFilter,
  Scale,
  Search,
  ShieldCheck,
} from "lucide-react";
import { useState } from "react";
import type { DiscoveryResponse, DraftKind, Matter, RequestKind } from "../lib/model.ts";
import { flaggedResponses, kindLabels, priority, requestTitle } from "../lib/model.ts";
import { Button, EmptyState, PriorityBadge, TextAction } from "./ui.tsx";

type Filter = "all" | "flagged" | "reviewed";
const PAGE_SIZE = 6;

export function DiscoveryPanel({
  searchId,
  matter,
  onReview,
  onDraft,
  onUpload,
}: {
  searchId: string;
  matter: Matter;
  onReview: (id: string) => void;
  onDraft: (kind: DraftKind, ids: string[]) => void;
  onUpload: () => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [kind, setKind] = useState<RequestKind | "all">("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const flagged = flaggedResponses(matter);
  const reviewed = matter.responses.filter((response) => response.status === "reviewed");
  const visible = matter.responses.filter((response) => {
    if (filter === "flagged" && (!response.issues.length || response.status === "dismissed")) {
      return false;
    }
    if (filter === "reviewed" && response.status !== "reviewed") {
      return false;
    }
    if (kind !== "all" && response.kind !== kind) {
      return false;
    }
    return `${response.kind} ${response.number} ${response.request} ${response.response} ${response.issues.map((issue) => issue.title).join(" ")}`
      .toLowerCase()
      .includes(search.toLowerCase());
  });
  const pages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages - 1);
  const pageResponses = visible.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const allSelected =
    pageResponses.length > 0 && pageResponses.every((response) => selected.includes(response.id));
  const selectedFlagged = flagged
    .filter((response) => selected.includes(response.id))
    .map((response) => response.id);
  const severityCounts = {
    high: flagged.filter((response) => priority(response) === "high").length,
    medium: flagged.filter((response) => priority(response) === "medium").length,
    low: flagged.filter((response) => priority(response) === "low").length,
  };

  return (
    <div className="review-layout">
      <section className="response-panel" aria-label="Discovery response analysis">
        <div className="panel-heading">
          <div>
            <h2>Response analysis</h2>
            <p>A clear view of what needs a closer look.</p>
          </div>
          <span className="local-engine">
            <span />
            Local analysis
          </span>
        </div>
        <fieldset className="response-filters" aria-label="Response view">
          {(
            [
              { id: "all", label: "All responses", count: matter.responses.length },
              { id: "flagged", label: "Flagged", count: flagged.length },
              { id: "reviewed", label: "Reviewed", count: reviewed.length },
            ] as const
          ).map((item) => (
            <button
              type="button"
              key={item.id}
              className={filter === item.id ? "active" : ""}
              aria-pressed={filter === item.id}
              onClick={() => {
                setFilter(item.id);
                setPage(0);
              }}
            >
              {item.label}
              <span>{item.count}</span>
            </button>
          ))}
        </fieldset>
        <div className="table-toolbar">
          <div className="search-input">
            <Search />
            <input
              id={searchId}
              aria-label="Search requests and responses"
              placeholder="Search requests or responses…"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(0);
              }}
            />
          </div>
          <label className="type-filter">
            <ListFilter />
            <select
              aria-label="Filter by discovery type"
              value={kind}
              onChange={(event) => {
                setKind(event.target.value as RequestKind | "all");
                setPage(0);
              }}
            >
              <option value="all">All types</option>
              <option value="RFP">Production</option>
              <option value="ROG">Interrogatories</option>
              <option value="RFA">Admissions</option>
            </select>
          </label>
        </div>
        {selected.length > 0 && (
          <div className="selection-bar">
            <span>
              {selected.length} selected · {selectedFlagged.length} flagged
            </span>
            <button type="button" className="text-link" onClick={() => setSelected([])}>
              Clear
            </button>
            <Button
              variant="primary"
              disabled={!selectedFlagged.length}
              onClick={() => onDraft("letter", selectedFlagged)}
            >
              <FilePenLine />
              Draft selected
            </Button>
          </div>
        )}
        {pageResponses.length > 0 ? (
          <div className="table-scroll">
            <table className="response-table">
              <thead>
                <tr>
                  <th className="checkbox-cell">
                    <input
                      type="checkbox"
                      aria-label="Select all responses on this page"
                      checked={allSelected}
                      onChange={(event) =>
                        setSelected((current) =>
                          event.target.checked
                            ? [
                                ...new Set([
                                  ...current,
                                  ...pageResponses.map((response) => response.id),
                                ]),
                              ]
                            : current.filter(
                                (id) => !pageResponses.some((response) => response.id === id),
                              ),
                        )
                      }
                    />
                  </th>
                  <th>REQUEST</th>
                  <th>FINDING</th>
                  <th>REVIEW</th>
                  <th className="chevron-cell">
                    <span className="sr-only">Open review</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {pageResponses.map((response) => (
                  <ResponseRow
                    key={response.id}
                    response={response}
                    selected={selected.includes(response.id)}
                    onSelect={(checked) =>
                      setSelected((current) =>
                        checked
                          ? [...current, response.id]
                          : current.filter((id) => id !== response.id),
                      )
                    }
                    onReview={() => onReview(response.id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={<FileSearch />}
            title={matter.responses.length ? "No responses in this view" : "Start with the source"}
            description={
              matter.responses.length
                ? "Try a different filter or search term."
                : "Import opposing counsel’s numbered discovery responses to begin your review."
            }
            action={
              matter.responses.length ? (
                <Button
                  onClick={() => {
                    setFilter("all");
                    setKind("all");
                    setSearch("");
                    setPage(0);
                  }}
                >
                  Clear filters
                </Button>
              ) : (
                <Button variant="primary" onClick={onUpload}>
                  Import responses
                  <ArrowRight />
                </Button>
              )
            }
          />
        )}
        <div className="table-pagination">
          <span>
            {visible.length
              ? `Showing ${currentPage * PAGE_SIZE + 1}–${Math.min((currentPage + 1) * PAGE_SIZE, visible.length)} of ${visible.length} responses`
              : "0 responses"}
          </span>
          <div>
            <button
              type="button"
              className="icon-button"
              aria-label="Previous response page"
              disabled={currentPage === 0}
              onClick={() => setPage(currentPage - 1)}
            >
              <ArrowLeft />
            </button>
            <span>
              {currentPage + 1} / {pages}
            </span>
            <button
              type="button"
              className="icon-button"
              aria-label="Next response page"
              disabled={currentPage >= pages - 1}
              onClick={() => setPage(currentPage + 1)}
            >
              <ArrowRight />
            </button>
          </div>
        </div>
        <div className="analysis-footnote">
          <Info />
          <span>
            Potential issues, not legal conclusions. “No flags” does not establish sufficiency.
          </span>
        </div>
      </section>
      <aside className="review-rail" aria-label="Review summary">
        <section className="summary-card">
          <div className="summary-heading">
            <h2>Review at a glance</h2>
            <FileSearch />
          </div>
          <p>Know where to focus first.</p>
          <div className="summary-total">
            <strong>{flagged.length}</strong>
            <span>
              responses with
              <br />
              potential deficiencies
            </span>
          </div>
          <div className="severity-bar" aria-hidden="true">
            <span className="high" style={{ flex: severityCounts.high }} />
            <span className="medium" style={{ flex: severityCounts.medium }} />
            <span className="low" style={{ flex: severityCounts.low }} />
            {flagged.length === 0 && <span className="none" style={{ flex: 1 }} />}
          </div>
          <dl className="severity-legend">
            <div>
              <dt>
                <span className="legend-dot high" />
                High priority
              </dt>
              <dd>{severityCounts.high}</dd>
            </div>
            <div>
              <dt>
                <span className="legend-dot medium" />
                Medium priority
              </dt>
              <dd>{severityCounts.medium}</dd>
            </div>
            <div>
              <dt>
                <span className="legend-dot low" />
                Clarification
              </dt>
              <dd>{severityCounts.low}</dd>
            </div>
          </dl>
          <div className="review-progress">
            <div>
              <span>Flagged responses reviewed</span>
              <strong>
                {flagged.filter((response) => response.status === "reviewed").length} /{" "}
                {flagged.length}
              </strong>
            </div>
            <progress
              aria-label="Flagged responses reviewed"
              max={Math.max(1, flagged.length)}
              value={flagged.filter((response) => response.status === "reviewed").length}
            />
          </div>
        </section>
        <section className="next-step-card">
          <span className="next-step-eyebrow">
            <MessageIcon />
            YOUR NEXT STEP
          </span>
          <h2>
            Start with a<br />
            <em>conversation.</em>
          </h2>
          <p>
            Turn the findings into a focused meet-and-confer letter. Keep the conversation moving
            forward.
          </p>
          <Button
            variant="primary"
            disabled={!flagged.length}
            onClick={() => onDraft("letter", selectedFlagged)}
          >
            Draft a letter
            <ArrowRight />
          </Button>
          <div className="motion-link">
            <Scale />
            <TextAction small onClick={() => onDraft("motion", selectedFlagged)}>
              Build a motion outline
            </TextAction>
          </div>
        </section>
        <div className="rail-privacy">
          <ShieldCheck />
          <div>
            <strong>Your documents stay yours.</strong>
            <p>Processed locally. Never uploaded to an AI provider.</p>
          </div>
        </div>
      </aside>
    </div>
  );
}

function MessageIcon() {
  return <FilePenLine />;
}

function ResponseRow({
  response,
  selected,
  onSelect,
  onReview,
}: {
  response: DiscoveryResponse;
  selected: boolean;
  onSelect: (checked: boolean) => void;
  onReview: () => void;
}) {
  const level = priority(response);
  const mainIssue = response.issues.find((issue) => issue.severity === level);
  return (
    <tr className={selected ? "row-selected" : ""}>
      <td className="checkbox-cell">
        <input
          type="checkbox"
          aria-label={`Select ${response.kind} No. ${response.number}`}
          checked={selected}
          onChange={(event) => onSelect(event.target.checked)}
        />
      </td>
      <td>
        <button
          type="button"
          className="request-button"
          onClick={onReview}
          aria-label={`Review ${kindLabels[response.kind]} No. ${response.number}`}
        >
          <span className={`request-file kind-${response.kind}`}>
            <FileText />
          </span>
          <span>
            <strong>{requestTitle(response)}</strong>
            <small>
              {kindLabels[response.kind]} <span>·</span> No. {response.number}
            </small>
          </span>
        </button>
      </td>
      <td className="finding-cell">
        <PriorityBadge response={response} />
        <span className="finding-name">{mainIssue?.title ?? "No rule matches"}</span>
      </td>
      <td className="review-cell">
        <button
          type="button"
          className={`review-status status-${response.status}`}
          onClick={onReview}
        >
          {response.status === "reviewed" ? (
            <CheckCheck />
          ) : response.status === "dismissed" ? (
            <Check />
          ) : (
            <Circle />
          )}
          <span>
            {response.status === "reviewed"
              ? "Reviewed"
              : response.status === "dismissed"
                ? "Dismissed"
                : "Needs review"}
          </span>
        </button>
      </td>
      <td className="chevron-cell">
        <button
          type="button"
          className="icon-button"
          aria-label={`Open ${response.kind} ${response.number} details`}
          onClick={onReview}
        >
          <ChevronRight />
        </button>
      </td>
    </tr>
  );
}
