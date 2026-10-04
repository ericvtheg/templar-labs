import {
  ArrowRight,
  Check,
  Clipboard,
  Download,
  FilePenLine,
  FileText,
  LoaderCircle,
  Scale,
} from "lucide-react";
import { useState } from "react";
import { downloadBlob, exportWord } from "../lib/documents.ts";
import type { Draft, DraftKind, Matter } from "../lib/model.ts";
import { draftLabels, flaggedResponses, kindLabels } from "../lib/model.ts";
import { Button, Modal } from "./ui.tsx";

export function GenerateDialog({
  matter,
  initialKind,
  initialIds,
  onClose,
  onGenerate,
}: {
  matter: Matter;
  initialKind: DraftKind;
  initialIds: string[];
  onClose: () => void;
  onGenerate: (kind: DraftKind, ids: string[]) => void;
}) {
  const responses = flaggedResponses(matter);
  const [kind, setKind] = useState(initialKind);
  const [ids, setIds] = useState(
    initialIds.length
      ? responses
          .filter((response) => initialIds.includes(response.id))
          .map((response) => response.id)
      : responses.map((response) => response.id),
  );
  const [acknowledged, setAcknowledged] = useState(false);
  const pending = responses.filter(
    (response) => ids.includes(response.id) && response.status === "pending",
  ).length;
  return (
    <Modal
      title="From review to resolution"
      description="Create an editable, source-linked starting point—not a final legal document."
      onClose={onClose}
      size="wide"
    >
      <div className="modal-body">
        <div className="draft-type-grid">
          <button
            type="button"
            className={`draft-type ${kind === "letter" ? "selected" : ""}`}
            aria-pressed={kind === "letter"}
            onClick={() => setKind("letter")}
          >
            <FilePenLine />
            <strong>Meet-and-confer letter</strong>
            <span>A cooperative, request-by-request letter seeking clarification.</span>
            {kind === "letter" && <Check className="type-check" />}
          </button>
          <button
            type="button"
            className={`draft-type ${kind === "motion" ? "selected" : ""}`}
            aria-pressed={kind === "motion"}
            onClick={() => setKind("motion")}
          >
            <Scale />
            <strong>Motion to compel outline</strong>
            <span>A structured outline with research and procedural placeholders.</span>
            {kind === "motion" && <Check className="type-check" />}
          </button>
        </div>
        <div className="draft-inclusions">
          <h3>
            Responses to include <span>{ids.length} selected</span>
          </h3>
          <div className="inclusion-list">
            {responses.map((response) => (
              <label key={response.id}>
                <input
                  type="checkbox"
                  checked={ids.includes(response.id)}
                  onChange={(event) =>
                    setIds((current) =>
                      event.target.checked
                        ? [...current, response.id]
                        : current.filter((id) => id !== response.id),
                    )
                  }
                />
                <span>
                  <strong>
                    {kindLabels[response.kind]} No. {response.number}
                  </strong>
                  <small>{response.issues.map((issue) => issue.title).join(" · ")}</small>
                </span>
                <span className={`review-status status-${response.status}`}>
                  {response.status === "reviewed" ? "Reviewed" : "Unreviewed"}
                </span>
              </label>
            ))}
          </div>
        </div>
        {pending > 0 && (
          <p className="notice">
            {pending} selected {pending === 1 ? "response has" : "responses have"} unreviewed
            findings. These will be explicitly marked in the draft.
          </p>
        )}
        <p className="draft-disclaimer">
          No authorities, court deadlines, sent correspondence, or completed procedural steps are
          invented. Missing details remain as placeholders. Jurisdiction-specific research is
          required.
        </p>
        <label className="acknowledgement">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(event) => setAcknowledged(event.target.checked)}
          />
          <span>
            I understand this is a draft that requires source verification and attorney review
            before use.
          </span>
        </label>
      </div>
      <footer className="modal-footer">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="primary"
          disabled={!acknowledged || ids.length === 0}
          onClick={() => onGenerate(kind, ids)}
        >
          Create draft
          <ArrowRight />
        </Button>
      </footer>
    </Modal>
  );
}

export function DraftEditor({
  draft,
  persistent,
  onClose,
  onUpdate,
  notify,
}: {
  draft: Draft;
  persistent: boolean;
  onClose: () => void;
  onUpdate: (content: string) => void;
  notify: (message: string) => void;
}) {
  const [exporting, setExporting] = useState(false);
  return (
    <Modal
      title={draft.title}
      description={`${draft.responseIds.length} source-linked responses · Draft for attorney review`}
      onClose={onClose}
      size="wide"
    >
      <div className="editor-toolbar">
        <span className="draft-label">
          <FileText />
          EDITABLE DRAFT
        </span>
        <span className="editor-save">
          <Check />
          {persistent ? "Device saving enabled" : "Kept in this session"}
        </span>
      </div>
      <div className="draft-paper">
        <textarea
          aria-label="Draft content"
          spellCheck
          value={draft.content}
          maxLength={1_000_000}
          onChange={(event) => onUpdate(event.target.value)}
        />
      </div>
      <div className="editor-warning">
        Verify facts, quotations, governing law, service requirements, and deadlines. Not
        filing-ready.
      </div>
      <footer className="modal-footer editor-footer">
        <Button
          variant="ghost"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(draft.content);
              notify("Draft copied to clipboard.");
            } catch {
              notify("Clipboard unavailable. Select and copy the draft text instead.");
            }
          }}
        >
          <Clipboard />
          Copy text
        </Button>
        <div>
          <Button
            onClick={() =>
              downloadBlob(
                new Blob([draft.content], { type: "text/plain;charset=utf-8" }),
                `${draft.kind}-draft.txt`,
              )
            }
          >
            Save TXT
          </Button>
          <Button
            variant="primary"
            disabled={exporting}
            onClick={async () => {
              setExporting(true);
              try {
                await exportWord(draft.content, draftLabels[draft.kind]);
                notify("Word draft exported. Review before use.");
              } catch {
                notify("Word export failed. You can still save as TXT or copy the text.");
              } finally {
                setExporting(false);
              }
            }}
          >
            {exporting ? <LoaderCircle className="spinning" /> : <Download />}
            {exporting ? "Exporting…" : "Export Word"}
          </Button>
        </div>
      </footer>
    </Modal>
  );
}
