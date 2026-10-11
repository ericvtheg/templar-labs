import "./v4.css";

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from "react";
import { Link, Outlet, useLocation } from "react-router";
import { type PageId, pageById, pagePath, type VersionId } from "../content/pages.ts";
import { useCurrentPage, VersionSwitcher } from "../shared/chrome.tsx";
import { useEscape, usePageFocus } from "../shared/hooks.ts";

/** v4 and v5 are the same design. v4 has room for one photo on the homepage. */
export type Variant = { id: Extract<VersionId, "v4" | "v5">; photo: boolean };

const VariantContext = createContext<Variant>({ id: "v4", photo: true });

export function useVariant(): Variant {
  return useContext(VariantContext);
}

// Travel and the hotels are one page, as Emma designed it.
const navPages: readonly PageId[] = ["home", "schedule", "travel", "things-to-do", "faq"];

function isCurrent(link: PageId, page: PageId): boolean {
  return link === page || (link === "travel" && page === "stay");
}

function Nav() {
  const { id } = useVariant();
  const { page } = useCurrentPage();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    toggleRef.current?.focus();
  }, []);

  useEscape(open, close);

  // Close the menu when its link has taken effect.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the path is the trigger
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (open) {
      closeRef.current?.focus();
    }
  }, [open]);

  const links = navPages.map((link) => (
    <Link
      key={link}
      to={pagePath(id, link)}
      aria-current={isCurrent(link, page) ? "page" : undefined}
      onClick={() => setOpen(false)}
    >
      {pageById(link).label}
    </Link>
  ));

  return (
    <header className="v4-nav">
      <nav className="v4-nav__links" aria-label="Main">
        {links}
      </nav>

      <button
        ref={toggleRef}
        type="button"
        className="v4-nav__toggle"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen(true)}
      >
        Menu
      </button>

      {open && (
        <div id={menuId} className="v4-menu" role="dialog" aria-modal="true" aria-label="Menu">
          <button ref={closeRef} type="button" className="v4-menu__close" onClick={close}>
            Close
          </button>
          <nav aria-label="Main">{links}</nav>
        </div>
      )}
    </header>
  );
}

export function V4Layout({ variant }: { variant: Variant }) {
  const stageRef = usePageFocus<HTMLDivElement>();

  return (
    <VariantContext.Provider value={variant}>
      <div className="v4">
        <Nav />
        <div ref={stageRef} tabIndex={-1} className="v4-stage">
          <main>
            <Outlet />
          </main>
        </div>
        <VersionSwitcher />
      </div>
    </VariantContext.Provider>
  );
}
