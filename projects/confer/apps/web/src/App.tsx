import {
  ArrowRight,
  BriefcaseBusiness,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  FileCheck2,
  FilePenLine,
  FileSearch,
  FileText,
  FolderOpen,
  Info,
  Plus,
  Scale,
  Upload,
} from "lucide-react";
import { useCallback, useEffect, useId, useState } from "react";
import { DiscoveryPanel } from "./components/discovery-panel.tsx";
import { DraftEditor, GenerateDialog } from "./components/draft-dialogs.tsx";
import type { NavId } from "./components/layout.tsx";
import { Sidebar, Topbar } from "./components/layout.tsx";
import { MatterForm } from "./components/matter-form.tsx";
import { ReviewDialog } from "./components/review-dialog.tsx";
import {
  Button,
  EmptyState,
  Modal,
  TextAction,
  ToastContext,
  ToastMessage,
} from "./components/ui.tsx";
import { UploadDialog } from "./components/upload-dialog.tsx";
import { DocumentDialog, HelpDialog, SettingsDialog } from "./components/workspace-dialogs.tsx";
import { createDraft } from "./lib/drafts.ts";
import type {
  DiscoveryResponse,
  DraftKind,
  Matter,
  MatterDetails,
  SourceDocument,
} from "./lib/model.ts";
import { emptyDetails, flaggedResponses, formatDate, MAX_RESPONSES } from "./lib/model.ts";
import { useWorkspace } from "./lib/use-workspace.ts";

type Tab = "responses" | "documents" | "drafts" | "details";
type OpenModal =
  | { type: "upload" | "settings" | "help" | "navigation" }
  | { type: "new"; importAfter?: boolean }
  | { type: "review"; id: string }
  | { type: "document"; id: string; page: number }
  | { type: "generate"; kind: DraftKind; ids: string[] }
  | { type: "editor"; id: string }
  | null;

export function App() {
  const mainContentId = useId();
  const matterSelectId = useId();
  const searchInputId = useId();
  const {
    workspace,
    setWorkspace,
    activeMatter: matter,
    updateMatter,
    persistent,
    setPersistence,
    storageError,
  } = useWorkspace();
  const [nav, setNav] = useState<NavId>("discovery");
  const [tab, setTab] = useState<Tab>("responses");
  const [modal, setModal] = useState<OpenModal>(null);
  const [toast, setToast] = useState("");
  const notify = useCallback((message: string) => setToast(message), []);
  const close = () => setModal(null);
  useEffect(() => {
    if (!toast) {
      return;
    }
    const timeout = window.setTimeout(() => setToast(""), 5_000);
    return () => window.clearTimeout(timeout);
  }, [toast]);
  const navigate = (next: NavId) => {
    setNav(next);
    setTab(next === "drafts" ? "drafts" : "responses");
    setModal(null);
  };
  const selectMatter = (id: string) => {
    setWorkspace((current) => ({ ...current, activeMatterId: id }));
    setNav("discovery");
    setTab("responses");
    setModal(null);
  };
  const search = useCallback(() => {
    setNav("discovery");
    setTab("responses");
    setModal(null);
    window.requestAnimationFrame(() => window.document.getElementById(searchInputId)?.focus());
  }, [searchInputId]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        search();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [search]);

  const startDraft = (kind: DraftKind, ids: string[] = []) => {
    if (!flaggedResponses(matter).length) {
      notify(
        "There are no active flagged responses. Import responses or reopen a dismissed finding first.",
      );
      return;
    }
    setModal({ type: "generate", kind, ids });
  };
  const generate = (kind: DraftKind, ids: string[]) => {
    try {
      if (matter.drafts.length >= 100) {
        throw new Error("This matter has reached its 100-draft limit.");
      }
      const draft = createDraft(matter, kind, ids);
      updateMatter(matter.id, (current) => ({ ...current, drafts: [...current.drafts, draft] }));
      setTab("drafts");
      setModal({ type: "editor", id: draft.id });
      notify("Your draft is ready to edit. Verify every finding before use.");
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "Unable to create this draft.");
    }
  };
  const openImport = () =>
    setModal(matter.isDemo ? { type: "new", importAfter: true } : { type: "upload" });
  const importResponses = (document: SourceDocument, responses: DiscoveryResponse[]) => {
    if (matter.isDemo) {
      return "Create your own matter before importing. Sample responses must not be mixed with actual case material.";
    }
    if (matter.documents.some((source) => source.text === document.text)) {
      return "This source text is already in the matter. Choose a different discovery set.";
    }
    if (
      matter.responses.length + responses.length > MAX_RESPONSES ||
      matter.documents.length >= 100
    ) {
      return `A matter can contain up to ${MAX_RESPONSES} responses and 100 documents. Create another matter for additional sets.`;
    }
    updateMatter(matter.id, (current) => ({
      ...current,
      documents: [...current.documents, document],
      responses: [...current.responses, ...responses],
    }));
    close();
    setTab("responses");
    notify(
      `${responses.length} responses added. Review the extracted source and potential findings.`,
    );
    return undefined;
  };
  const newMatter = (details: MatterDetails) => {
    if (workspace.matters.length >= 50) {
      notify("This workspace has reached its 50-matter limit.");
      return;
    }
    const created: Matter = {
      ...details,
      id: crypto.randomUUID(),
      isDemo: false,
      createdAt: new Date().toISOString(),
      documents: [],
      responses: [],
      drafts: [],
    };
    setWorkspace((current) => ({
      ...current,
      activeMatterId: created.id,
      matters: [...current.matters, created],
    }));
    setModal(modal?.type === "new" && modal.importAfter ? { type: "upload" } : null);
    setNav("discovery");
    setTab("responses");
    notify("Matter created. Bring in your discovery responses to start.");
  };
  const review =
    modal?.type === "review"
      ? matter.responses.find((response) => response.id === modal.id)
      : undefined;
  const document =
    modal?.type === "document"
      ? matter.documents.find((source) => source.id === modal.id)
      : undefined;
  const draft =
    modal?.type === "editor" ? matter.drafts.find((item) => item.id === modal.id) : undefined;
  const sidebarProps = {
    nav,
    matters: workspace.matters,
    activeMatterId: matter.id,
    onNavigate: navigate,
    onMatter: selectMatter,
    onNewMatter: () => setModal({ type: "new" }),
    onHelp: () => setModal({ type: "help" }),
    onSettings: () => setModal({ type: "settings" }),
  };

  return (
    <ToastContext.Provider value={{ message: toast, onDismiss: () => setToast("") }}>
      <div className="app-shell">
        <a href={`#${mainContentId}`} className="skip-link">
          Skip to content
        </a>
        <div className="desktop-sidebar">
          <Sidebar {...sidebarProps} />
        </div>
        <div className="app-main">
          <Topbar
            nav={nav}
            persistent={persistent}
            storageError={storageError}
            onSearch={search}
            onSettings={() => setModal({ type: "settings" })}
            onMobileMenu={() => setModal({ type: "navigation" })}
          />
          <main id={mainContentId} className="main-content" tabIndex={-1}>
            {storageError && (
              <div className="storage-error" role="alert">
                <Info />
                <span>{storageError}</span>
                <button
                  type="button"
                  className="text-link"
                  onClick={() => setModal({ type: "settings" })}
                >
                  Storage settings
                </button>
              </div>
            )}
            {nav === "overview" || nav === "matters" ? (
              <WorkspaceOverview
                matters={workspace.matters}
                nav={nav}
                onNew={() => setModal({ type: "new" })}
                onMatter={selectMatter}
              />
            ) : (
              <>
                <div className="page-heading">
                  <div>
                    <div className="page-eyebrow">
                      <span />
                      YOUR DISCOVERY WORKSPACE
                    </div>
                    <h1>
                      {nav === "drafts" ? "A thoughtful next step." : "Discovery, clarified."}
                    </h1>
                    <p>
                      {nav === "drafts"
                        ? "Move from potential issues to a clear, editable draft."
                        : "From opposing responses to your next best move. All in one place."}
                    </p>
                  </div>
                  <div className="page-heading-actions">
                    <Button
                      disabled={!flaggedResponses(matter).length}
                      onClick={() => startDraft("letter")}
                    >
                      <FilePenLine />
                      Create draft
                    </Button>
                    <Button variant="primary" className="upload-button" onClick={openImport}>
                      <Upload />
                      Import responses
                    </Button>
                  </div>
                </div>
                <div className="matter-bar">
                  <div className="matter-icon">
                    <BriefcaseBusiness />
                  </div>
                  <div className="matter-select-wrap">
                    <label className="sr-only" htmlFor={matterSelectId}>
                      Active matter
                    </label>
                    <select
                      id={matterSelectId}
                      value={matter.id}
                      onChange={(event) => selectMatter(event.target.value)}
                    >
                      {workspace.matters.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.title}
                        </option>
                      ))}
                    </select>
                    <ChevronDown />
                    <span>
                      {matter.caseNumber ? `Case No. ${matter.caseNumber}` : "Case number not set"}
                      <span className="matter-meta-divider">·</span>
                      {matter.client ? `For ${matter.client}` : "Client not set"}
                    </span>
                  </div>
                  {matter.isDemo && <span className="sample-badge">Sample matter</span>}
                  <button
                    type="button"
                    className="matter-details-link"
                    onClick={() => setTab("details")}
                  >
                    Matter details
                    <ChevronRight />
                  </button>
                </div>
                {matter.isDemo && (
                  <div className="demo-hint">
                    <Info />
                    <span>
                      You’re exploring a sample case. All parties and responses are fictional.
                    </span>
                    <button
                      type="button"
                      className="text-link"
                      onClick={() => setModal({ type: "new" })}
                    >
                      Create your own
                      <ArrowRight />
                    </button>
                  </div>
                )}
                <Stats matter={matter} />
                <fieldset className="matter-tabs" aria-label="Matter sections">
                  {(
                    [
                      {
                        id: "responses",
                        label: "Response review",
                        icon: FileSearch,
                        count: matter.responses.length,
                      },
                      {
                        id: "documents",
                        label: "Documents",
                        icon: FolderOpen,
                        count: matter.documents.length,
                      },
                      {
                        id: "drafts",
                        label: "Drafts",
                        icon: FilePenLine,
                        count: matter.drafts.length,
                      },
                    ] as const
                  ).map(({ id, label, icon: Icon, count }) => (
                    <button
                      type="button"
                      key={id}
                      aria-pressed={tab === id}
                      className={tab === id ? "active" : ""}
                      onClick={() => setTab(id)}
                    >
                      <Icon />
                      {label}
                      <span>{count}</span>
                    </button>
                  ))}
                </fieldset>
                {tab === "responses" && (
                  <DiscoveryPanel
                    key={matter.id}
                    searchId={searchInputId}
                    matter={matter}
                    onReview={(id) => setModal({ type: "review", id })}
                    onDraft={startDraft}
                    onUpload={openImport}
                  />
                )}
                {tab === "documents" && (
                  <DocumentsPanel
                    matter={matter}
                    onUpload={openImport}
                    onOpen={(id) => setModal({ type: "document", id, page: 1 })}
                  />
                )}
                {tab === "drafts" && (
                  <DraftsPanel
                    matter={matter}
                    onGenerate={startDraft}
                    onOpen={(id) => setModal({ type: "editor", id })}
                  />
                )}
                {tab === "details" && (
                  <section className="details-panel">
                    <div className="panel-heading">
                      <div>
                        <h2>Matter details</h2>
                        <p>Keep the facts and draft placeholders in sync.</p>
                      </div>
                      <Button variant="ghost" onClick={() => setTab("responses")}>
                        Back to review
                        <ArrowRight />
                      </Button>
                    </div>
                    <MatterForm
                      key={matter.id}
                      initial={matter}
                      onSave={(details) => {
                        updateMatter(matter.id, (current) => ({ ...current, ...details }));
                        notify(
                          "Matter details saved. Existing drafts are not changed; create a new draft to use updated details.",
                        );
                      }}
                    />
                  </section>
                )}
              </>
            )}
            <footer className="page-footer">
              <span>
                CONFER <span>·</span> BUILT FOR THE WORK THAT MATTERS
              </span>
              <button type="button" onClick={() => setModal({ type: "help" })}>
                Counsel in control. Always.
                <Scale />
              </button>
            </footer>
          </main>
        </div>
        {modal?.type === "new" && (
          <Modal
            title={modal.importAfter ? "First, create your matter" : "Make space for a new matter"}
            description={
              modal.importAfter
                ? "Keep actual case material separate from the fictional sample. Add your matter, then import your responses."
                : "Add the details you have. You can fill in the rest as you go."
            }
            onClose={close}
            size="wide"
          >
            <div className="modal-body">
              <MatterForm initial={emptyDetails} onSave={newMatter} isNew />
            </div>
          </Modal>
        )}
        {modal?.type === "upload" && (
          <UploadDialog matterTitle={matter.title} onClose={close} onImport={importResponses} />
        )}
        {modal?.type === "generate" && (
          <GenerateDialog
            matter={matter}
            initialKind={modal.kind}
            initialIds={modal.ids}
            onClose={close}
            onGenerate={generate}
          />
        )}
        {review && (
          <ReviewDialog
            response={review}
            document={matter.documents.find((source) => source.id === review.documentId)}
            onClose={close}
            onSave={(status, note) => {
              updateMatter(matter.id, (current) => ({
                ...current,
                responses: current.responses.map((response) =>
                  response.id === review.id ? { ...response, status, note } : response,
                ),
              }));
              close();
              notify(
                status === "reviewed"
                  ? "Response marked reviewed. Your notes have been saved."
                  : status === "dismissed"
                    ? "Finding dismissed. It will not be included in new drafts."
                    : "Response reopened for review.",
              );
            }}
            onSource={() =>
              setModal({ type: "document", id: review.documentId, page: review.page })
            }
          />
        )}
        {document && modal?.type === "document" && (
          <DocumentDialog document={document} initialPage={modal.page} onClose={close} />
        )}
        {draft && (
          <DraftEditor
            draft={draft}
            persistent={persistent}
            onClose={close}
            notify={notify}
            onUpdate={(content) =>
              updateMatter(matter.id, (current) => ({
                ...current,
                drafts: current.drafts.map((item) =>
                  item.id === draft.id
                    ? { ...item, content, updatedAt: new Date().toISOString() }
                    : item,
                ),
              }))
            }
          />
        )}
        {modal?.type === "settings" && (
          <SettingsDialog
            workspace={workspace}
            persistent={persistent}
            error={storageError}
            onPersistence={setPersistence}
            onRestore={(restored) => {
              setWorkspace(restored);
              setNav("discovery");
              setTab("responses");
            }}
            onClose={close}
            notify={notify}
          />
        )}
        {modal?.type === "help" && <HelpDialog onClose={close} onUpload={openImport} />}
        {modal?.type === "navigation" && (
          <Modal
            title="Counsel workspace"
            description="Your matters and workspace tools"
            onClose={close}
            size="drawer"
          >
            <div className="mobile-sidebar">
              <Sidebar {...sidebarProps} />
            </div>
          </Modal>
        )}
        {!modal && <ToastMessage />}
      </div>
    </ToastContext.Provider>
  );
}

function Stats({ matter }: { matter: Matter }) {
  const flagged = flaggedResponses(matter);
  const reviewed = flagged.filter((response) => response.status === "reviewed").length;
  return (
    <div className="stats-grid">
      <section className="stat-card">
        <div>
          <span className="stat-label">Responses analyzed</span>
          <div className="stat-number">
            {matter.responses.length}
            <span>
              across {matter.documents.length}{" "}
              {matter.documents.length === 1 ? "document" : "documents"}
            </span>
          </div>
        </div>
        <span className="stat-icon">
          <FileCheck2 />
        </span>
      </section>
      <section className="stat-card">
        <div>
          <span className="stat-label">Potential deficiencies</span>
          <div className="stat-number">
            {flagged.length}
            <span>flagged for a closer look</span>
          </div>
        </div>
        <span className="stat-icon stat-icon-amber">
          <FileSearch />
        </span>
      </section>
      <section className="stat-card">
        <div>
          <span className="stat-label">Reviewed & ready</span>
          <div className="stat-number">
            {reviewed}
            <span>of {flagged.length} flagged responses</span>
          </div>
        </div>
        <span className="stat-icon stat-icon-green">
          <CheckCheck />
        </span>
      </section>
    </div>
  );
}

function DocumentsPanel({
  matter,
  onUpload,
  onOpen,
}: {
  matter: Matter;
  onUpload: () => void;
  onOpen: (id: string) => void;
}) {
  return (
    <section className="documents-panel">
      <div className="panel-heading">
        <div>
          <h2>Your source documents</h2>
          <p>Extracted text is retained locally; original files are not stored.</p>
        </div>
        <Button onClick={onUpload}>
          <Plus />
          Add document
        </Button>
      </div>
      {matter.documents.length ? (
        <div className="document-grid">
          {matter.documents.map((document) => (
            <button
              type="button"
              className="document-card"
              key={document.id}
              onClick={() => onOpen(document.id)}
            >
              <div className="document-card-top">
                <span className="file-icon">
                  <FileText />
                </span>
                <ChevronRight />
              </div>
              <h3>{document.name}</h3>
              <p>
                {matter.responses.filter((response) => response.documentId === document.id).length}{" "}
                responses <span>·</span> {document.pages} text{" "}
                {document.pages === 1 ? "page" : "pages"}
              </p>
              <div>
                {matter.isDemo ? "Sample source document" : `Added ${formatDate(document.addedAt)}`}
                <span>
                  View source
                  <ArrowRight />
                </span>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<FolderOpen />}
          title="A home for your source material"
          description="Import a PDF, DOCX, TXT, or pasted discovery set to begin."
          action={
            <Button variant="primary" onClick={onUpload}>
              Import responses
              <ArrowRight />
            </Button>
          }
        />
      )}
    </section>
  );
}

function DraftsPanel({
  matter,
  onGenerate,
  onOpen,
}: {
  matter: Matter;
  onGenerate: (kind: DraftKind) => void;
  onOpen: (id: string) => void;
}) {
  return (
    <section className="drafts-panel">
      <div className="panel-heading">
        <div>
          <h2>From findings to a first draft</h2>
          <p>Your voice. Your judgment. A head start on the paperwork.</p>
        </div>
        <Button
          variant="primary"
          disabled={!flaggedResponses(matter).length}
          onClick={() => onGenerate("letter")}
        >
          <Plus />
          Create draft
        </Button>
      </div>
      {matter.drafts.length ? (
        <div className="draft-list">
          {matter.drafts.map((draft) => (
            <button type="button" key={draft.id} onClick={() => onOpen(draft.id)}>
              <span className="file-icon">
                {draft.kind === "letter" ? <FilePenLine /> : <Scale />}
              </span>
              <span>
                <strong>{draft.title}</strong>
                <small>
                  {draft.responseIds.length} responses · Edited {formatDate(draft.updatedAt)}
                </small>
              </span>
              <span className="draft-status">Draft</span>
              <ChevronRight />
            </button>
          ))}
        </div>
      ) : (
        <div className="draft-start-grid">
          <div>
            <div className="draft-start-icon">
              <FilePenLine />
            </div>
            <span className="section-eyebrow">RESOLVE IT TOGETHER</span>
            <h3>Meet-and-confer letter</h3>
            <p>
              A focused, request-by-request letter grounded in the actual responses. Editable and
              ready for your review.
            </p>
            <TextAction onClick={() => onGenerate("letter")}>Draft a letter</TextAction>
          </div>
          <div>
            <div className="draft-start-icon">
              <Scale />
            </div>
            <span className="section-eyebrow">PREPARE YOUR NEXT MOVE</span>
            <h3>Motion to compel outline</h3>
            <p>
              A clear structure for unresolved issues, with placeholders for verified facts,
              governing law, and procedural requirements.
            </p>
            <TextAction onClick={() => onGenerate("motion")}>Build an outline</TextAction>
          </div>
        </div>
      )}
      <div className="analysis-footnote">
        <Info />
        <span>
          Drafts are not sent or filed. Attorney verification and jurisdiction-specific research are
          required.
        </span>
      </div>
    </section>
  );
}

function WorkspaceOverview({
  matters,
  nav,
  onNew,
  onMatter,
}: {
  matters: Matter[];
  nav: NavId;
  onNew: () => void;
  onMatter: (id: string) => void;
}) {
  const flags = matters.reduce((count, matter) => count + flaggedResponses(matter).length, 0);
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="page-eyebrow">
            <span />
            YOUR COUNSEL WORKSPACE
          </div>
          <h1>{nav === "matters" ? "Every matter. In focus." : "A little less busywork."}</h1>
          <p>Keep your discovery review moving, one clear next step at a time.</p>
        </div>
        <Button variant="primary" onClick={onNew}>
          <Plus />
          New matter
        </Button>
      </div>
      <div className="overview-banner">
        <div>
          <span className="section-eyebrow">CLARITY STARTS HERE</span>
          <h2>
            More room for
            <br />
            <em>the work that matters.</em>
          </h2>
          <p>
            {matters.length} {matters.length === 1 ? "matter" : "matters"} in your workspace.{" "}
            {flags} responses flagged for attorney review.
          </p>
        </div>
        <div className="overview-art" aria-hidden="true">
          <div>
            <FileText />
            <span />
            <span />
            <span />
          </div>
          <div>
            <CheckCheck />
            <span />
            <span />
          </div>
        </div>
      </div>
      <section className="matter-list-panel">
        <div className="panel-heading">
          <div>
            <h2>
              Your matters <span className="count-badge">{matters.length}</span>
            </h2>
            <p>Pick up where you left off.</p>
          </div>
          <Button onClick={onNew}>
            <Plus />
            Add matter
          </Button>
        </div>
        <div className="matter-list">
          {matters.map((matter) => (
            <button type="button" key={matter.id} onClick={() => onMatter(matter.id)}>
              <span className="matter-icon">
                <BriefcaseBusiness />
              </span>
              <span className="matter-list-name">
                <strong>{matter.title}</strong>
                <small>
                  {matter.caseNumber || "Case details not set"}
                  {matter.isDemo ? " · Sample matter" : ""}
                </small>
              </span>
              <span>
                <strong>{matter.responses.length}</strong>
                <small>responses</small>
              </span>
              <span>
                <strong>{flaggedResponses(matter).length}</strong>
                <small>flagged</small>
              </span>
              <ChevronRight />
            </button>
          ))}
        </div>
      </section>
    </>
  );
}
