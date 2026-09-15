import { useEffect, useRef } from "react";
// Each new encounter starts at its heading, including for keyboard/screen-reader users.
export function useEncounterFocus(change: string | number) {
  const container = useRef<HTMLElement>(null);
  useEffect(() => {
    void change;
    if (!container.current?.closest(".serial-session")) {
      return;
    }
    const heading = container.current.querySelector<HTMLElement>("h1, h2");
    heading?.setAttribute("tabindex", "-1");
    heading?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [change]);
  return container;
}
