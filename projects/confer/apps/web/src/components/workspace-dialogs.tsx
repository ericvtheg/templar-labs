import {
  ArrowRight,
  Check,
  Download,
  FileSearch,
  FileText,
  HardDrive,
  LockKeyhole,
  MessageSquareText,
  Scale,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { useRef, useState } from "react";
import { downloadBlob } from "../lib/documents.ts";
import type { SourceDocument, Workspace } from "../lib/model.ts";
import { workspaceSchema } from "../lib/model.ts";
import { Button, Modal } from "./ui.tsx";

export function DocumentDialog({
  document,
  initialPage,
  onClose,
}: {
  document: SourceDocument;
  initialPage: number;
  onClose: () => void;
}) {
  const pages = document.text.split("\f");
  const pageNumbers = Array.from({ length: pages.length }, (_, index) => index + 1);
  const [page, setPage] = useState(Math.max(1, Math.min(initialPage, pages.length)));
  return (
    <Modal
      title={document.name}
      description="Extracted source text · Original files are not retained"
      onClose={onClose}
      size="wide"
    >
      <div className="source-toolbar">
        <span>
          <FileText />
          {pages.length} text {pages.length === 1 ? "page" : "pages"}
        </span>
        <label>
          Text page{" "}
          <select
            aria-label="Source text page"
            value={page}
            onChange={(event) => setPage(Number(event.target.value))}
          >
            {pageNumbers.map((number) => (
              <option key={number} value={number}>
                {number}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="modal-body document-body">
        <pre className="source-text">{pages[page - 1]}</pre>
      </div>
      <footer className="modal-footer">
        <small>Word and pasted text may not preserve original pagination.</small>
        <Button
          onClick={() =>
            downloadBlob(
              new Blob([document.text], { type: "text/plain;charset=utf-8" }),
              `${document.name.replace(/\.(pdf|docx|txt)$/i, "")}-extracted.txt`,
            )
          }
        >
          <Download />
          Export source text
        </Button>
      </footer>
    </Modal>
  );
}

export function HelpDialog({ onClose, onUpload }: { onClose: () => void; onUpload: () => void }) {
  return (
    <Modal
      title="Less discovery busywork. More clarity."
      description="A private workspace for turning responses into a thoughtful next step."
      onClose={onClose}
      size="wide"
    >
      <div className="modal-body help-body">
        <div className="help-step">
          <span>01</span>
          <div>
            <h3>
              <FileSearch />
              Bring in the source
            </h3>
            <p>
              Upload text-based PDFs, DOCX, or TXT files, or paste numbered requests and responses.
              Check the extracted text and response count. Scanned files need OCR first.
            </p>
          </div>
        </div>
        <div className="help-step">
          <span>02</span>
          <div>
            <h3>
              <ShieldCheck />
              Make the judgment call
            </h3>
            <p>
              Local rules flag generalized objections, unclear qualifications or production dates,
              privilege references, records-based answers, and uncertain admissions. These are
              potential issues—not legal conclusions. Review, annotate, or dismiss each finding.
            </p>
          </div>
        </div>
        <div className="help-step">
          <span>03</span>
          <div>
            <h3>
              <MessageSquareText />
              Draft your next step
            </h3>
            <p>
              Create a request-by-request meet-and-confer letter or a motion outline. Edit, copy, or
              export to Word. Unreviewed findings remain labeled. Source quotations are included; no
              legal authorities are invented.
            </p>
          </div>
        </div>
        <div className="help-boundary">
          <Scale />
          <p>
            <strong>Counsel stays in control.</strong> Confer does not evaluate legal sufficiency,
            research jurisdiction-specific rules, calculate court deadlines, send letters, or file
            motions. Confirm all facts, law, confidentiality obligations, and procedural
            requirements.
          </p>
        </div>
        <div className="privacy-note">
          <LockKeyhole />
          <span>
            No AI provider, server uploads, analytics, or external fonts. Session-only by default;
            optional device saving is unencrypted.
          </span>
        </div>
      </div>
      <footer className="modal-footer">
        <Button variant="primary" onClick={onUpload}>
          Import responses
          <ArrowRight />
        </Button>
      </footer>
    </Modal>
  );
}

export function SettingsDialog({
  workspace,
  persistent,
  error,
  onPersistence,
  onRestore,
  onClose,
  notify,
}: {
  workspace: Workspace;
  persistent: boolean;
  error: string;
  onPersistence: (enabled: boolean) => boolean;
  onRestore: (workspace: Workspace) => void;
  onClose: () => void;
  notify: (message: string) => void;
}) {
  const [backup, setBackup] = useState<Workspace | null>(null);
  const [restoreError, setRestoreError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  return (
    <Modal
      title="Your workspace, your device"
      description="Choose how your local matters, extracted responses, and drafts are kept."
      onClose={onClose}
    >
      <div className="modal-body settings-body">
        <div className="setting-intro">
          <ShieldCheck />
          <div>
            <h3>Private by design</h3>
            <p>
              Documents are processed in your browser. Nothing is sent to a server or an AI
              provider.
            </p>
          </div>
        </div>
        <label className="storage-setting">
          <HardDrive />
          <span>
            <strong>Save on this device</strong>
            <small>
              {persistent
                ? "Workspace will be available after reopening."
                : "Off · Work is lost when this session closes."}
            </small>
          </span>
          <input
            type="checkbox"
            role="switch"
            aria-checked={persistent}
            aria-label="Save on this device"
            checked={persistent}
            onChange={(event) => {
              if (onPersistence(event.target.checked)) {
                notify(
                  event.target.checked
                    ? "Device saving enabled."
                    : "Saved browser copy removed. Work remains in this session.",
                );
              }
            }}
          />
        </label>
        <p className="notice">
          Device saving uses <strong>unencrypted browser storage</strong>. Enable it only if your
          firm's policies permit it on a trusted device. Anyone with access to this browser profile
          may access the workspace. Turning it off removes the saved browser copy.
        </p>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="backup-section">
          <h3>Workspace backup</h3>
          <p>
            JSON backups include all source text, review notes, and drafts. They are unencrypted;
            store and share them securely.
          </p>
          <div className="button-row">
            <Button
              onClick={() => {
                downloadBlob(
                  new Blob([JSON.stringify(workspace, null, 2)], { type: "application/json" }),
                  "confer-workspace.json",
                );
                notify("Workspace backup exported. Keep it secure.");
              }}
            >
              <Download />
              Export backup
            </Button>
            <Button onClick={() => input.current?.click()}>
              <Upload />
              Restore backup
            </Button>
          </div>
          <input
            ref={input}
            type="file"
            className="sr-only"
            aria-label="Restore workspace backup"
            accept=".json"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) {
                return;
              }
              setRestoreError("");
              setBackup(null);
              try {
                if (file.size > 12_000_000) {
                  throw new Error("Backup exceeds the 12 MB limit.");
                }
                const parsed = workspaceSchema.safeParse(JSON.parse(await file.text()));
                if (!parsed.success) {
                  throw new Error("This is not a valid Confer workspace backup.");
                }
                setBackup(parsed.data);
              } catch (cause) {
                setRestoreError(
                  cause instanceof Error ? cause.message : "Unable to read this backup.",
                );
              } finally {
                if (input.current) {
                  input.current.value = "";
                }
              }
            }}
          />
        </div>
        {restoreError && (
          <p className="form-error" role="alert">
            {restoreError}
          </p>
        )}
        {backup && (
          <div className="restore-confirm">
            <strong>
              Replace this workspace with {backup.matters.length}{" "}
              {backup.matters.length === 1 ? "matter" : "matters"}?
            </strong>
            <p>
              Your current workspace will be replaced. Export a backup first if you need to keep it.
            </p>
            <Button
              variant="primary"
              onClick={() => {
                onRestore(backup);
                onClose();
                notify("Workspace restored from backup.");
              }}
            >
              <Check />
              Replace workspace
            </Button>
          </div>
        )}
      </div>
      <footer className="modal-footer">
        <Button onClick={onClose}>Done</Button>
      </footer>
    </Modal>
  );
}
