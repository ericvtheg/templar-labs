import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router";

const siteName = "Emma & Eric";

/** Sets the browser tab title for the current page. */
export function usePageTitle(title: string): void {
  useEffect(() => {
    document.title =
      title === siteName ? `${siteName} · September 25, 2027` : `${title} · ${siteName}`;
  }, [title]);
}

/** Tracks a CSS media query. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const list = window.matchMedia(query);
    const update = () => setMatches(list.matches);
    update();
    list.addEventListener("change", update);
    return () => list.removeEventListener("change", update);
  }, [query]);

  return matches;
}

/**
 * After a page change, scrolls to the top and moves focus to the new page, so
 * keyboard and screen-reader users start at its beginning.
 */
export function usePageFocus<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const { pathname } = useLocation();
  const firstPath = useRef(pathname);

  useEffect(() => {
    if (firstPath.current === pathname) {
      return;
    }
    firstPath.current = "";
    window.scrollTo(0, 0);
    ref.current?.focus({ preventScroll: true });
  }, [pathname]);

  return ref;
}

/** Runs `onEscape` when the Escape key is pressed while `active` is true. */
export function useEscape(active: boolean, onEscape: () => void): void {
  useEffect(() => {
    if (!active) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onEscape();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, onEscape]);
}

/** The window size. Re-renders on every resize. */
export function useViewport(): { width: number; height: number } {
  const [size, setSize] = useState(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));

  useEffect(() => {
    const update = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return size;
}
