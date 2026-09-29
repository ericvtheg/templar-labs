import "@puckeditor/core/puck.css";
import { type Config, Puck } from "@puckeditor/core";
import { useEffect, useMemo, useRef, useState } from "react";
import type { WeddingEditorState } from "../lib/wedding-content-service.ts";
import type { WeddingBlock, WeddingPageData } from "../lib/wedding-page.ts";
import { weddingPageConfig } from "./wedding-page.tsx";

export type WeddingEditorActions = {
  readonly saveDraft: (input: {
    readonly data: { readonly data: WeddingPageData; readonly expectedVersion: number };
  }) => Promise<WeddingEditorState>;
  readonly publish: (input: {
    readonly data: { readonly data: WeddingPageData; readonly expectedVersion: number };
  }) => Promise<WeddingEditorState>;
  readonly restore: (input: {
    readonly data: { readonly revisionId: string; readonly expectedVersion: number };
  }) => Promise<WeddingEditorState>;
};

export function WeddingEditor({
  initialState,
  actions,
}: {
  readonly initialState: WeddingEditorState;
  readonly actions: WeddingEditorActions;
}) {
  const [data, setData] = useState(initialState.draft);
  const dataRef = useRef(initialState.draft);
  const [version, setVersion] = useState(initialState.version);
  const [revisions, setRevisions] = useState(initialState.revisions);
  const [editorKey, setEditorKey] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<"save" | "publish" | "restore" | null>(null);
  const busyRef = useRef<typeof busy>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [restoreCandidate, setRestoreCandidate] = useState<{ id: string; version: number } | null>(
    null,
  );

  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (!dirty) {
        return;
      }
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);

  const blockRows = useMemo(
    () => data.content.map((block, index) => ({ block, index, label: blockLabel(block) })),
    [data.content],
  );

  const applyState = (state: WeddingEditorState, message: string) => {
    dataRef.current = state.draft;
    setData(state.draft);
    setVersion(state.version);
    setRevisions(state.revisions);
    setDirty(false);
    setNotice(message);
    setError(null);
    setEditorKey((value) => value + 1);
  };

  const beginBusy = (activity: NonNullable<typeof busy>) => {
    if (busyRef.current !== null) {
      return false;
    }
    busyRef.current = activity;
    setBusy(activity);
    setNotice(null);
    setError(null);
    return true;
  };

  const endBusy = () => {
    busyRef.current = null;
    setBusy(null);
  };

  const handleSave = async () => {
    if (!beginBusy("save")) {
      return;
    }
    try {
      applyState(
        await actions.saveDraft({
          data: { data: dataRef.current, expectedVersion: version },
        }),
        "Draft saved.",
      );
    } catch (caught) {
      setError(toEditorError(caught, "The draft could not be saved. Please try again."));
    } finally {
      endBusy();
    }
  };

  const handlePublish = async (nextData: WeddingPageData) => {
    if (!beginBusy("publish")) {
      return;
    }
    try {
      applyState(
        await actions.publish({ data: { data: nextData, expectedVersion: version } }),
        "Published. The public website now shows this version.",
      );
    } catch (caught) {
      setError(
        toEditorError(caught, "The page could not be published. The public site is unchanged."),
      );
    } finally {
      endBusy();
    }
  };

  const performRestore = async (revisionId: string, revisionVersion: number) => {
    if (!beginBusy("restore")) {
      return;
    }
    try {
      const state = await actions.restore({ data: { revisionId, expectedVersion: version } });
      applyState(state, `Revision ${revisionVersion} restored as a new draft.`);
      setRestoreCandidate(null);
    } catch (caught) {
      setError(toEditorError(caught, "That revision could not be restored. Please try again."));
    } finally {
      endBusy();
    }
  };

  const moveBlock = (index: number, direction: -1 | 1) => {
    if (busyRef.current !== null) {
      return;
    }
    const destination = index + direction;
    if (destination < 0 || destination >= data.content.length) {
      return;
    }
    const content = [...data.content];
    const [block] = content.splice(index, 1);
    if (block === undefined) {
      return;
    }
    content.splice(destination, 0, block);
    const nextData = { ...data, content };
    dataRef.current = nextData;
    setData(nextData);
    setDirty(true);
    setEditorKey((value) => value + 1);
    setNotice(`${blockLabel(block)} moved ${direction < 0 ? "up" : "down"}.`);
  };

  return (
    <main className="editor-page">
      <header className="editor-toolbar">
        <div>
          <p className="eyebrow">Private wedding editor</p>
          <h1>Emma & Eric</h1>
        </div>
        <div className="editor-toolbar-actions">
          <a className="editor-link" href="/" target="_blank" rel="noreferrer">
            View public site
          </a>
          <button
            className="button button-primary"
            disabled={busy !== null || !dirty}
            onClick={handleSave}
            type="button"
          >
            {busy === "save" ? "Saving…" : "Save draft"}
          </button>
          <form action="/api/auth/sign-out?returnTo=/edit" method="post">
            <button className="editor-link-button" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </header>

      <div className="editor-status" aria-live="polite">
        <span>{dirty ? "Unsaved changes" : `Draft revision ${version}`}</span>
        {notice ? <strong>{notice}</strong> : null}
        {error ? (
          <strong className="editor-error" role="alert">
            {error}
          </strong>
        ) : null}
      </div>

      <details className="editor-order-panel">
        <summary>Keyboard section order</summary>
        <p>
          Use these buttons as a keyboard alternative to dragging sections in the canvas or outline.
        </p>
        <ol>
          {blockRows.map(({ block, index, label }) => (
            <li key={block.props.id}>
              <span>
                {label}
                {block.props.visible ? "" : " (hidden)"}
              </span>
              <button
                disabled={index === 0 || busy !== null}
                onClick={() => moveBlock(index, -1)}
                type="button"
                aria-label={`Move ${label} up`}
              >
                ↑
              </button>
              <button
                disabled={index === blockRows.length - 1 || busy !== null}
                onClick={() => moveBlock(index, 1)}
                type="button"
                aria-label={`Move ${label} down`}
              >
                ↓
              </button>
            </li>
          ))}
        </ol>
      </details>

      <details className="editor-history-panel">
        <summary>Revision history</summary>
        {revisions.length === 0 ? (
          <p>No saved revisions yet.</p>
        ) : (
          <ol>
            {revisions.map((revision) => (
              <li key={revision.id}>
                <span>
                  Revision {revision.version} · {revision.action} ·{" "}
                  {formatRevisionDate(revision.createdAt)}
                </span>
                <button
                  disabled={busy !== null || revision.version === version}
                  onClick={() =>
                    setRestoreCandidate({ id: revision.id, version: revision.version })
                  }
                  type="button"
                >
                  Restore as draft
                </button>
              </li>
            ))}
          </ol>
        )}
      </details>

      {restoreCandidate ? (
        <section
          aria-label={`Restore revision ${restoreCandidate.version}`}
          aria-modal="true"
          className="editor-confirm"
          role="dialog"
        >
          <h2>Restore revision {restoreCandidate.version}?</h2>
          <p>This creates a new draft. The public website will not change.</p>
          <div>
            <button
              disabled={busy !== null}
              onClick={() => setRestoreCandidate(null)}
              type="button"
            >
              Cancel
            </button>
            <button
              className="button button-primary"
              disabled={busy !== null}
              onClick={() => void performRestore(restoreCandidate.id, restoreCandidate.version)}
              type="button"
            >
              Restore as draft
            </button>
          </div>
        </section>
      ) : null}

      <section
        aria-busy={busy !== null}
        aria-label="Visual page editor"
        className="puck-shell"
        inert={busy !== null}
      >
        <Puck
          key={editorKey}
          config={weddingPageConfig as unknown as Config}
          data={data}
          dnd={{ behavior: "static" }}
          headerTitle="Wedding website"
          iframe={{ enabled: true, syncHostStyles: true, waitForStyles: true }}
          metadata={{ canEdit: true }}
          onChange={(nextData) => {
            if (busyRef.current !== null) {
              return;
            }
            const nextWeddingData = nextData as WeddingPageData;
            if (JSON.stringify(nextWeddingData) === JSON.stringify(dataRef.current)) {
              return;
            }
            dataRef.current = nextWeddingData;
            setData(nextWeddingData);
            setDirty(true);
            setNotice(null);
          }}
          onPublish={(nextData) => void handlePublish(nextData as WeddingPageData)}
          viewports={[
            { width: 390, height: "auto", label: "Mobile", icon: "Smartphone" },
            { width: 1280, height: "auto", label: "Desktop", icon: "Monitor" },
          ]}
        />
      </section>
    </main>
  );
}

function blockLabel(block: WeddingBlock) {
  switch (block.type) {
    case "HeroBlock":
      return "Hero";
    case "DetailsBlock":
      return "Details";
    case "ScheduleBlock":
      return block.props.title;
    case "StoryBlock":
      return block.props.title;
    case "TravelBlock":
      return block.props.title;
    case "StayBlock":
      return block.props.title;
    case "FaqBlock":
      return block.props.title;
    case "RegistryBlock":
      return block.props.title;
    case "PhotoBlock":
      return block.props.caption || "Photo";
  }
}

function formatRevisionDate(value: Date | string) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );
}

function toEditorError(error: unknown, fallback: string) {
  return error instanceof Error && /changed in another session/i.test(error.message)
    ? "This draft changed in another session. Reload before saving so nobody’s work is overwritten."
    : fallback;
}
