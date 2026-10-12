// The moving parts of versions 8 and 9: squiggly lines, swaying flowers and
// handwriting that writes itself. All of it stops for people who ask their
// device for reduced motion. The styles are in v8.css.

import { type CSSProperties, useEffect, useRef, useState } from "react";

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** True once the element has scrolled into view. It stays true after that. */
function useInView<T extends Element>() {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    if (prefersReducedMotion() || !("IntersectionObserver" in window)) {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [ref, inView] as const;
}

type SquiggleProps = { className?: string; vertical?: boolean };

/**
 * A hand-drawn wavy line, in place of a straight rule. It draws itself when it
 * scrolls into view, then keeps flowing slowly.
 */
export function Squiggle({ className, vertical = false }: SquiggleProps) {
  const [ref, inView] = useInView<HTMLDivElement>();

  return (
    <div
      ref={ref}
      className={className ? `v8-squiggle ${className}` : "v8-squiggle"}
      data-vertical={vertical ? "true" : undefined}
      data-in={inView ? "true" : undefined}
      aria-hidden="true"
    >
      <span />
    </div>
  );
}

type SwayingProps = {
  src: string;
  className?: string;
  /**
   * How much of the drawing sways, measured from its top, from 0 to 1. Anything
   * below (a planter box, a log) stays still. 1 sways the whole drawing.
   */
  sways?: number;
  /** How far it leans, relative to the default. */
  amount?: number;
  /** Seconds for one lean, so drawings on a page do not move in step. */
  seconds?: number;
};

/**
 * One of Emma's flower drawings, swaying as if in a light breeze. The drawing is
 * shown twice: a still copy for the base, and a moving copy for the flowers,
 * which bend from the line where the two meet.
 */
export function Swaying({ src, className, sways = 1, amount = 1, seconds = 7 }: SwayingProps) {
  const vars = {
    "--sways": `${sways * 100}%`,
    "--lean": amount,
    "--sway-time": `${seconds}s`,
  } as CSSProperties;

  return (
    <div className={className ? `v8-sway ${className}` : "v8-sway"} style={vars} aria-hidden="true">
      <img className="v8-sway__still" src={src} alt="" />
      <img className="v8-sway__moving" src={src} alt="" />
    </div>
  );
}

type WrittenProps = { src: string; text: string; className?: string };

/**
 * A handwritten phrase that writes itself, word by word, when the page opens.
 * The words stay in the page for screen readers.
 */
export function Written({ src, text, className }: WrittenProps) {
  return (
    <p className={className ? `v8-written ${className}` : "v8-written"}>
      <img src={src} alt="" />
      <span className="sr-only">{text}</span>
    </p>
  );
}
