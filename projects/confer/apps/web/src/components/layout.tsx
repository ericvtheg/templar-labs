import {
  ArrowUpRight,
  BriefcaseBusiness,
  ChevronDown,
  CircleHelp,
  FilePenLine,
  Files,
  LayoutGrid,
  LockKeyhole,
  Menu,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
} from "lucide-react";
import type { Matter } from "../lib/model.ts";

export type NavId = "overview" | "matters" | "discovery" | "drafts";
export const navLabels: Record<NavId, string> = {
  overview: "Overview",
  matters: "Matters",
  discovery: "Discovery",
  drafts: "Drafting",
};

export function Brand() {
  return (
    <div className="brand">
      <svg
        className="brand-mark"
        width="34"
        height="34"
        viewBox="0 0 40 40"
        role="img"
        aria-label="Confer mark"
      >
        <rect width="40" height="40" rx="11" fill="currentColor" />
        <path
          d="M26 11h-8a9 9 0 0 0 0 18h8M26 16h-7a4 4 0 0 0 0 8h7"
          fill="none"
          stroke="#eff3e9"
          strokeWidth="2.8"
          strokeLinecap="round"
        />
      </svg>
      <span>
        confer<span className="brand-period">.</span>
        <small>DISCOVERY, CLARIFIED.</small>
      </span>
    </div>
  );
}

export function Sidebar({
  nav,
  matters,
  activeMatterId,
  onNavigate,
  onMatter,
  onNewMatter,
  onHelp,
  onSettings,
}: {
  nav: NavId;
  matters: Matter[];
  activeMatterId: string;
  onNavigate: (nav: NavId) => void;
  onMatter: (id: string) => void;
  onNewMatter: () => void;
  onHelp: () => void;
  onSettings: () => void;
}) {
  const items = [
    { id: "overview" as const, icon: LayoutGrid },
    { id: "matters" as const, icon: BriefcaseBusiness },
    { id: "discovery" as const, icon: Files },
    { id: "drafts" as const, icon: FilePenLine },
  ];
  return (
    <aside className="sidebar">
      <Brand />
      <button type="button" className="workspace-switch" onClick={onSettings}>
        <span className="workspace-avatar">CW</span>
        <span>
          Counsel workspace<small>Personal workspace</small>
        </span>
        <ChevronDown />
      </button>
      <div className="nav-section-label">WORKSPACE</div>
      <nav className="main-nav" aria-label="Main navigation">
        {items.map(({ id, icon: Icon }) => (
          <button
            type="button"
            key={id}
            className={nav === id ? "active" : ""}
            aria-current={nav === id ? "page" : undefined}
            onClick={() => onNavigate(id)}
          >
            <Icon />
            <span>{navLabels[id]}</span>
            {id === "matters" && <span className="nav-count">{matters.length}</span>}
            {id === "drafts" && matters.some((matter) => matter.drafts.length) && (
              <span className="nav-count">
                {matters.reduce((count, matter) => count + matter.drafts.length, 0)}
              </span>
            )}
          </button>
        ))}
      </nav>
      <div className="recent-matters">
        <div className="nav-section-label">
          <span>YOUR MATTERS</span>
          <button
            type="button"
            className="icon-button"
            aria-label="Create a new matter"
            onClick={onNewMatter}
          >
            <Plus />
          </button>
        </div>
        <nav aria-label="Your matters">
          {matters.map((matter) => (
            <button
              type="button"
              key={matter.id}
              className={matter.id === activeMatterId ? "selected" : ""}
              onClick={() => onMatter(matter.id)}
            >
              <span className="matter-dot" />
              <span className="recent-matter-title">{matter.title}</span>
            </button>
          ))}
        </nav>
        <button type="button" className="new-matter" onClick={onNewMatter}>
          <Plus />
          New matter
        </button>
      </div>
      <div className="sidebar-bottom">
        <div className="sidebar-note">
          <div className="note-symbol">
            <span />
            <span />
            <span />
          </div>
          <h3>Move discovery forward.</h3>
          <p>
            Less back-and-forth.
            <br />
            More meaningful progress.
          </p>
          <button type="button" onClick={onHelp}>
            See how it works
            <ArrowUpRight />
          </button>
        </div>
        <nav className="utility-nav" aria-label="Workspace tools">
          <button type="button" onClick={onHelp}>
            <CircleHelp />
            Help & getting started
          </button>
          <button type="button" onClick={onSettings}>
            <Settings2 />
            Workspace settings
          </button>
        </nav>
        <div className="sidebar-footer">
          <span>
            Built with care, by <strong>Breli</strong>
          </span>
          <LockKeyhole />
        </div>
      </div>
    </aside>
  );
}

export function Topbar({
  nav,
  persistent,
  storageError,
  onSearch,
  onSettings,
  onMobileMenu,
}: {
  nav: NavId;
  persistent: boolean;
  storageError: string;
  onSearch: () => void;
  onSettings: () => void;
  onMobileMenu: () => void;
}) {
  return (
    <header className="topbar">
      <button
        type="button"
        className="icon-button mobile-menu"
        aria-label="Open navigation"
        onClick={onMobileMenu}
      >
        <Menu />
      </button>
      <div className="breadcrumbs">
        <span>Workspace</span>
        <span className="breadcrumb-slash">/</span>
        <strong>{navLabels[nav]}</strong>
      </div>
      <div className="topbar-actions">
        <button
          type="button"
          className="topbar-search"
          aria-label="Search discovery responses"
          onClick={onSearch}
        >
          <Search />
          <span>Quick search</span>
          <kbd>⌘ K</kbd>
        </button>
        <span className="topbar-divider" />
        <button
          type="button"
          className={`session-indicator ${storageError ? "save-error" : ""}`}
          onClick={onSettings}
        >
          <ShieldCheck />
          <span>
            {storageError ? "Save issue" : persistent ? "Saved on device" : "Private session"}
          </span>
        </button>
        <button
          type="button"
          className="profile-avatar"
          aria-label="Open workspace settings"
          onClick={onSettings}
        >
          CW
        </button>
      </div>
    </header>
  );
}
