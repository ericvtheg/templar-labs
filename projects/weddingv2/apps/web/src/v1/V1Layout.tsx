import "./v1.css";

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Link, useLocation, useOutlet } from "react-router";
import { type PageId, pageById, pagePath } from "../content/pages.ts";
import { useCurrentPage, VersionSwitcher } from "../shared/chrome.tsx";
import { useEscape, usePageFocus } from "../shared/hooks.ts";

// Travel and Stay share one nav entry, as in the Canva design.
const navPages: readonly PageId[] = ["home", "schedule", "travel", "things-to-do", "faq"];

function isCurrent(link: PageId, page: PageId): boolean {
  return link === page || (link === "travel" && page === "stay");
}

function Nav() {
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

  return (
    <header className="v1-nav">
      <nav className="v1-nav__links" aria-label="Main">
        {navPages.map((id) => (
          <Link
            key={id}
            to={pagePath("v1", id)}
            aria-current={isCurrent(id, page) ? "page" : undefined}
          >
            {pageById(id).label}
          </Link>
        ))}
      </nav>

      <button
        ref={toggleRef}
        type="button"
        className="v1-nav__toggle"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen(true)}
      >
        Menu
      </button>

      {open && (
        <div id={menuId} className="v1-menu" role="dialog" aria-modal="true" aria-label="Menu">
          <button ref={closeRef} type="button" className="v1-menu__close" onClick={close}>
            Close
          </button>
          <nav aria-label="Main">
            {navPages.map((id) => (
              <Link
                key={id}
                to={pagePath("v1", id)}
                aria-current={isCurrent(id, page) ? "page" : undefined}
                onClick={() => setOpen(false)}
              >
                {pageById(id).label}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
}

export function V1Layout() {
  const { pathname } = useLocation();
  const outlet = useOutlet();
  const stageRef = usePageFocus<HTMLDivElement>();

  return (
    <div className="v1">
      <Nav />
      <div ref={stageRef} tabIndex={-1} className="v1-stage">
        <AnimatePresence mode="wait" initial={false}>
          <motion.main
            key={pathname}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.24, ease: "easeOut" }}
          >
            {outlet}
          </motion.main>
        </AnimatePresence>
      </div>
      <VersionSwitcher />
    </div>
  );
}
