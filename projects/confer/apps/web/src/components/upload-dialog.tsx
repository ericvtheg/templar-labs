import {
  ArrowRight,
  FileCheck2,
  FileText,
  LoaderCircle,
  ShieldCheck,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { parseDiscovery } from "../lib/analysis.ts";
import { sampleProduction } from "../lib/demo.ts";
import { extractDocument } from "../lib/documents.ts";
import type { DiscoveryResponse, RequestKind, SourceDocument } from "../lib/model.ts";
import { kindLabels, MAX_TEXT_LENGTH, requestKinds } from "../lib/model.ts";
import { Button, Field, Modal } from "./ui.tsx";

export function UploadDialog({
  matterTitle,
  onClose,
  onImport,
}: {
  matterTitle: string;
  onClose: () => void;
  onImport: (document: SourceDocument, responses: DiscoveryResponse[]) => string | undefined;
}) {
  const [mode, setMode] = useState<"file" | "paste">("file");
  const [text, setText] = useState("");
  const [name, setName] = useState("");
  const [kind, setKind] = useState<RequestKind>("RFP");
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<{
    document: SourceDocument;
    responses: DiscoveryResponse[];
  } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const analyze = (content: string, filename: string, pages: number) => {
    const document: SourceDocument = {
      id: crypto.randomUUID(),
      name: filename,
      text: content,
      pages,
      addedAt: new Date().toISOString(),
    };
    const responses = parseDiscovery(document, kind);
    setPreview({ document, responses });
  };
  const readFile = async (file: File) => {
    setBusy(true);
    setError("");
    setPreview(null);
    try {
      const extracted = await extractDocument(file);
      if (!mounted.current) {
        return;
      }
      setName(file.name.slice(0, 500));
      analyze(extracted.text, file.name.slice(0, 500), extracted.pages);
    } catch (cause) {
      if (mounted.current) {
        setError(
          cause instanceof Error
            ? cause.message
            : "This file could not be read. Try an unlocked PDF, a DOCX, or a TXT file.",
        );
      }
    } finally {
      if (mounted.current) {
        setBusy(false);
      }
      if (fileRef.current) {
        fileRef.current.value = "";
      }
    }
  };

  return (
    <Modal
      title="Bring your responses into focus"
      description={`Import discovery responses for ${matterTitle}.`}
      onClose={onClose}
      size="wide"
    >
      <div className="modal-body upload-body">
        <fieldset className="segmented-control" aria-label="Import method">
          <button
            type="button"
            aria-pressed={mode === "file"}
            disabled={busy}
            onClick={() => {
              setMode("file");
              setPreview(null);
              setError("");
            }}
          >
            <Upload />
            Upload a document
          </button>
          <button
            type="button"
            aria-pressed={mode === "paste"}
            disabled={busy}
            onClick={() => {
              setMode("paste");
              setPreview(null);
              setError("");
            }}
          >
            <FileText />
            Paste text
          </button>
        </fieldset>
        <Field
          label="Request type for generic ‘RESPONSE NO.’ headings"
          hint="Full headings are detected automatically, including mixed discovery types."
        >
          {(id) => (
            <select
              id={id}
              value={kind}
              disabled={busy || !!preview}
              onChange={(event) => setKind(event.target.value as RequestKind)}
            >
              {requestKinds.map((value) => (
                <option key={value} value={value}>
                  {kindLabels[value]}
                </option>
              ))}
            </select>
          )}
        </Field>
        {mode === "file" && !preview && (
          <section
            aria-label="Document upload"
            className={`dropzone ${dragging ? "dragging" : ""}`}
            onDragOver={(event) => {
              event.preventDefault();
              if (!busy) {
                setDragging(true);
              }
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              const file = event.dataTransfer.files[0];
              if (file && !busy) {
                void readFile(file);
              }
            }}
          >
            <div className="dropzone-icon">
              {busy ? <LoaderCircle className="spinning" /> : <Upload />}
            </div>
            <h3>{busy ? "Reading your document locally…" : "Drop discovery responses here"}</h3>
            <p>Text-based PDF, Word (.docx), or TXT · Up to 10 MB</p>
            <Button onClick={() => fileRef.current?.click()} disabled={busy}>
              Choose a file
              <ArrowRight />
            </Button>
            <input
              ref={fileRef}
              type="file"
              className="sr-only"
              aria-label="Choose discovery document"
              accept=".pdf,.docx,.txt"
              disabled={busy}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  void readFile(file);
                }
              }}
            />
            <small>Scanned PDFs need OCR first. Original files are not retained.</small>
          </section>
        )}
        {mode === "paste" && !preview && (
          <>
            <Field label="Document name">
              {(id) => (
                <input
                  id={id}
                  value={name}
                  maxLength={500}
                  placeholder="e.g. Defendant's production responses — Set One"
                  onChange={(event) => setName(event.target.value)}
                />
              )}
            </Field>
            <Field label="Numbered requests and responses">
              {(id) => (
                <textarea
                  id={id}
                  className="paste-input"
                  value={text}
                  maxLength={MAX_TEXT_LENGTH}
                  placeholder={
                    "REQUEST FOR PRODUCTION NO. 1:\nProduce all contracts…\n\nRESPONSE TO REQUEST FOR PRODUCTION NO. 1:\nResponding party objects…"
                  }
                  onChange={(event) => setText(event.target.value)}
                />
              )}
            </Field>
            <div className="paste-actions">
              <button
                type="button"
                className="text-link"
                onClick={() => {
                  setText(sampleProduction);
                  setName("Sample production responses.txt");
                  setError("");
                }}
              >
                Try with sample text
              </button>
              <Button
                variant="primary"
                disabled={!text.trim()}
                onClick={() => {
                  setError("");
                  try {
                    analyze(
                      text,
                      name.trim() || "Pasted discovery responses.txt",
                      text.split("\f").length,
                    );
                  } catch (cause) {
                    setError(
                      cause instanceof Error ? cause.message : "Unable to analyze this text.",
                    );
                  }
                }}
              >
                Analyze responses
                <ArrowRight />
              </Button>
            </div>
          </>
        )}
        {preview && (
          <div className="import-preview">
            <div className="preview-file">
              <div className="file-icon">
                <FileCheck2 />
              </div>
              <div>
                <strong>{preview.document.name}</strong>
                <span>
                  {preview.document.pages} extracted{" "}
                  {preview.document.pages === 1 ? "page" : "pages"}
                </span>
              </div>
              <button
                type="button"
                className="icon-button"
                aria-label="Choose another document"
                onClick={() => setPreview(null)}
              >
                <X />
              </button>
            </div>
            <div className="preview-stats">
              <div>
                <strong>{preview.responses.length}</strong>
                <span>responses detected</span>
              </div>
              <div>
                <strong>
                  {preview.responses.filter((response) => response.issues.length > 0).length}
                </strong>
                <span>responses flagged</span>
              </div>
            </div>
            <p className="notice">
              Check that every numbered response was detected. This is rules-based triage, not a
              legal-sufficiency assessment.
            </p>
            <div className="detected-list">
              {preview.responses.map((response) => (
                <div key={response.id}>
                  <span className="detected-request">
                    {response.kind} No. {response.number}
                  </span>
                  <span>{response.request ? "Request paired" : "Original request missing"}</span>
                  <span>
                    {response.issues.length
                      ? `${response.issues.length} potential ${response.issues.length === 1 ? "issue" : "issues"}`
                      : "No rule flags"}
                  </span>
                </div>
              ))}
            </div>
            <details>
              <summary>Check the extracted source text</summary>
              <pre className="source-text compact">{preview.document.text}</pre>
            </details>
          </div>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="privacy-note">
          <ShieldCheck />
          <span>
            Processed in your browser. No document text is sent to a server or AI provider.
          </span>
        </div>
      </div>
      <footer className="modal-footer">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        {preview && (
          <Button
            variant="primary"
            onClick={() => {
              const importError = onImport(preview.document, preview.responses);
              if (importError) {
                setError(importError);
              }
            }}
          >
            Add {preview.responses.length} responses
            <ArrowRight />
          </Button>
        )}
      </footer>
    </Modal>
  );
}
