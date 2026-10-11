import "./v2.css";

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Link, useLocation, useOutlet } from "react-router";
import { type PageId, pageById, pagePath } from "../content/pages.ts";
import { couple } from "../content/site.ts";
import { art } from "../shared/art.ts";
import { useCurrentPage, VersionSwitcher } from "../shared/chrome.tsx";
import { useEscape, usePageFocus } from "../shared/hooks.ts";
import { Petals, Squiggle } from "./parts.tsx";

// Travel and Stay share one nav entry, as in the Canva design.
const navPages: readonly PageId[] = ["home", "schedule", "travel", "things-to-do", "faq"];

function isCurrent(link: PageId, page: PageId): boolean {
  return link === page || (link === "travel" && page === "stay");
}

function Header() {
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
    <header className="v2-top">
      <Link to={pagePath("v2", "home")} className="v2-mark" data-home={page === "home"}>
        {couple.first} <i>&amp;</i> {couple.second}
      </Link>

      <nav className="v2-nav" aria-label="Main">
        {navPages.map((id) => {
          const current = isCurrent(id, page);
          return (
            <Link key={id} to={pagePath("v2", id)} aria-current={current ? "page" : undefined}>
              {pageById(id).label}
              {current && (
                <motion.span
                  layoutId="v2-nav-mark"
                  className="v2-nav__mark"
                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                >
                  <Squiggle />
                </motion.span>
              )}
            </Link>
          );
        })}
      </nav>

      <button
        ref={toggleRef}
        type="button"
        className="v2-menu-toggle"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen(true)}
      >
        Menu
      </button>

      {open && (
        <div id={menuId} className="v2-menu" role="dialog" aria-modal="true" aria-label="Menu">
          <button ref={closeRef} type="button" className="v2-menu__close" onClick={close}>
            Close
          </button>
          <nav aria-label="Main">
            {navPages.map((id, index) => (
              <Link
                key={id}
                to={pagePath("v2", id)}
                aria-current={isCurrent(id, page) ? "page" : undefined}
                style={{ animationDelay: `${60 + index * 55}ms` }}
                onClick={() => setOpen(false)}
              >
                {pageById(id).label}
              </Link>
            ))}
          </nav>
          <img className="v2-menu__art" src={art.bouquet} alt="" />
        </div>
      )}
    </header>
  );
}

export function V2Layout() {
  const { pathname } = useLocation();
  const outlet = useOutlet();
  const stageRef = usePageFocus<HTMLDivElement>();

  return (
    <div className="v2">
      <Header />
      <div ref={stageRef} tabIndex={-1} className="v2-stage">
        <AnimatePresence mode="wait" initial={false}>
          <motion.main
            key={pathname}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8, transition: { duration: 0.2, ease: "easeIn" } }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          >
            {outlet}
          </motion.main>
        </AnimatePresence>
      </div>
      <Petals trigger={pathname} />
      <VersionSwitcher />
    </div>
  );
}
