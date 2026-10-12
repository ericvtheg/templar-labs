// Building blocks for the versions that reproduce Emma's Canva pages exactly.
//
// Each <Panel> is one of her 1366 x 768 Canva pages. Text and art sit at the
// positions measured from her screenshots, and the panels stack so the page
// scrolls the way her design does. On a phone the same content reflows.
// The styles are in v4/v4.css.

import {
  type CSSProperties,
  createContext,
  type ElementType,
  type ReactNode,
  useContext,
} from "react";
import { panel, type Sheet } from "./sheet.ts";

const SheetContext = createContext<Sheet | null>(null);

export function SheetProvider({ sheet, children }: { sheet: Sheet; children: ReactNode }) {
  return <SheetContext.Provider value={sheet}>{children}</SheetContext.Provider>;
}

function useSheet(): Sheet {
  const sheet = useContext(SheetContext);
  if (!sheet) {
    throw new Error("Canva parts need a <SheetProvider>.");
  }
  return sheet;
}

type PanelProps = { name: string; height?: number; anchor?: string; children: ReactNode };

/** One Canva page. */
export function Panel({ name, height = panel.height, anchor, children }: PanelProps) {
  return (
    <section
      className="v4-panel"
      id={anchor}
      data-panel={name}
      style={{ "--h": height } as CSSProperties}
    >
      {children}
    </section>
  );
}

type TextProps = {
  /** Key into the sheet's spec.json. */
  block: string;
  as?: ElementType;
  className: string;
  /** Centered text is placed by its center line. Wrapped text keeps a box width. */
  layout?: "left" | "center" | "wrap";
  children: ReactNode;
};

/** A piece of live text at its Canva position. */
export function Text({ block, as: Tag = "p", className, layout = "left", children }: TextProps) {
  const sheet = useSheet();
  return (
    <Tag
      className={`v4-text ${className}`}
      data-block={block}
      data-layout={layout}
      style={sheet.place(block)}
    >
      {children}
    </Tag>
  );
}

type LinesProps = { block: string; text: string; label?: string | null };

/**
 * Text broken into Emma's own lines. On a phone the lines run together and reflow.
 * A label, such as "Flight:", opens the first line in capitals.
 */
export function Lines({ block, text, label }: LinesProps) {
  const sheet = useSheet();
  return (
    <>
      {sheet.linesFor(block, text).map((line, index) => (
        <span key={line} className="v4-line">
          {index === 0 && label && <span className="v4-caps">{label}: </span>}
          {line}{" "}
        </span>
      ))}
    </>
  );
}

type LetteringProps = {
  src: string;
  /** The same words set on shorter lines, for a phone. */
  narrowSrc?: string;
  text: string;
  at: CSSProperties;
  as?: ElementType;
  className?: string;
};

/**
 * One of Emma's handwritten phrases, shown as her own lettering. Her handwriting
 * font is not available as a web font. The words stay in the page for screen readers.
 */
export function Lettering({ src, narrowSrc, text, at, as: Tag = "p", className }: LetteringProps) {
  return (
    <Tag
      className={className ? `v4-lettering ${className}` : "v4-lettering"}
      data-narrow={narrowSrc ? "true" : undefined}
      style={at}
    >
      <img className="v4-lettering__wide" src={src} alt="" />
      {narrowSrc && <img className="v4-lettering__narrow" src={narrowSrc} alt="" />}
      <span className="sr-only">{text}</span>
    </Tag>
  );
}

type ArtProps = { src: string; at: CSSProperties; className?: string };

export function Art({ src, at, className }: ArtProps) {
  return (
    <img className={className ? `v4-art ${className}` : "v4-art"} src={src} alt="" style={at} />
  );
}
