import "./v4.css";

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from "react";
import { Link, Outlet, useLocation } from "react-router";
import { SheetProvider } from "../canva/parts.tsx";
import type { Sheet } from "../canva/sheet.ts";
import { type PageId, pageById, pagePath, type VersionId } from "../content/pages.ts";
import { useCurrentPage, VersionSwitcher } from "../shared/chrome.tsx";
import { useEscape, usePageFocus } from "../shared/hooks.ts";

/**
 * One version built on Emma's Canva pages. Versions 4 and 5 are round two and
 * differ only in the photo. Versions 6 and 7 are round three.
 */
export type Variant = {
  id: VersionId;
  /** v4 has room for one photo on the homepage. v5 has none. */
  photo: boolean;
  /** The measured layout the pages are placed on. */
  sheet: Sheet;
  /** Extra class names on the root, for styles added on top of v4.css. */
  className?: string;
  /** The order of the navigation links. */
  nav?: readonly PageId[];
};

const VariantContext = createContext<Variant | null>(null);

export function useVariant(): Variant {
  const variant = useContext(VariantContext);
  if (!variant) {
    throw new Error("This page must be rendered inside a V4Layout.");
  }
  return variant;
}

// Travel and the hotels are one page, as Emma designed it.
const defaultNav: readonly PageId[] = ["home", "schedule", "travel", "things-to-do", "faq"];

function isCurrent(link: PageId, page: PageId): boolean {
  return link === page || (link === "travel" && page === "stay");
}

function Nav() {
  const { id, nav = defaultNav } = useVariant();
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

  const links = nav.map((link) => (
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
      <div className={variant.className ? `v4 ${variant.className}` : "v4"}>
        <Nav />
        <div ref={stageRef} tabIndex={-1} className="v4-stage">
          <main>
            <SheetProvider sheet={variant.sheet}>
              <Outlet />
            </SheetProvider>
          </main>
        </div>
        <VersionSwitcher />
      </div>
    </VariantContext.Provider>
  );
}
