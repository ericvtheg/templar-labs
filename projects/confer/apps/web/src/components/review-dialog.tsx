import {
  Check,
  CheckCheck,
  ExternalLink,
  FileText,
  Info,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import { useState } from "react";
import type { DiscoveryResponse, SourceDocument } from "../lib/model.ts";
import { kindLabels } from "../lib/model.ts";
import { Button, Field, Modal, PriorityBadge } from "./ui.tsx";

export function ReviewDialog({
  response,
  document,
  onClose,
  onSave,
  onSource,
}: {
  response: DiscoveryResponse;
  document: SourceDocument | undefined;
  onClose: () => void;
  onSave: (status: DiscoveryResponse["status"], note: string) => void;
  onSource: () => void;
}) {
  const [note, setNote] = useState(response.note);
  return (
    <Modal
      title={`${kindLabels[response.kind]} No. ${response.number}`}
      description="Review the source before deciding what belongs in your draft."
      onClose={onClose}
      size="drawer"
    >
      <div className="modal-body review-body">
        <div className="review-meta">
          <PriorityBadge response={response} />
          <span className={`review-status status-${response.status}`}>
            {response.status === "reviewed" ? <CheckCheck /> : <Info />}
            {response.status === "reviewed"
              ? "Reviewed"
              : response.status === "dismissed"
                ? "Dismissed"
                : "Needs attorney review"}
          </span>
        </div>
        <section className="review-section">
          <div className="section-eyebrow">
            <FileText />
            ORIGINAL REQUEST
          </div>
          {response.request ? (
            <p>{response.request}</p>
          ) : (
            <p className="notice">
              The original request was not provided. Obtain and compare it before relying on any
              finding or draft.
            </p>
          )}
        </section>
        <section className="review-section source-response">
          <div className="section-eyebrow">
            <FileText />
            OPPOSING PARTY’S RESPONSE
          </div>
          <blockquote>{response.response}</blockquote>
          {document && (
            <button type="button" className="source-link" onClick={onSource}>
              {document.name} · text page {response.page}
              <ExternalLink />
            </button>
          )}
        </section>
        <div className="review-findings">
          <div className="section-eyebrow">POTENTIAL ISSUES · LOCAL RULES ENGINE</div>
          {response.issues.length ? (
            response.issues.map((issue) => (
              <section key={issue.code} className={`finding finding-${issue.severity}`}>
                <h3>{issue.title}</h3>
                <p>{issue.explanation}</p>
                <details>
                  <summary>Suggested clarification</summary>
                  <p>{issue.remedy}</p>
                </details>
                <small>Source match: “{issue.excerpt}”</small>
              </section>
            ))
          ) : (
            <div className="no-findings">
              <ShieldCheck />
              <div>
                <strong>No rules-based flags</strong>
                <p>
                  This does not mean the response is legally sufficient. Review it independently
                  against the request and governing rules.
                </p>
              </div>
            </div>
          )}
        </div>
        <Field
          label="Your review notes"
          hint="Saved with your review decision. Notes are excluded from letters; motion outlines may include them as explicitly labeled internal notes."
        >
          {(id) => (
            <textarea
              id={id}
              rows={3}
              value={note}
              maxLength={5_000}
              placeholder="Add context, a requested supplement, or a follow-up question…"
              onChange={(event) => setNote(event.target.value)}
            />
          )}
        </Field>
      </div>
      <footer className="modal-footer review-footer">
        <Button
          variant="ghost"
          onClick={() => onSave(response.status === "dismissed" ? "pending" : "dismissed", note)}
        >
          <RotateCcw />
          {response.status === "dismissed" ? "Reopen review" : "Dismiss finding"}
        </Button>
        <Button variant="primary" onClick={() => onSave("reviewed", note)}>
          <Check />
          {response.status === "reviewed" ? "Save review" : "Mark reviewed"}
        </Button>
      </footer>
    </Modal>
  );
}
