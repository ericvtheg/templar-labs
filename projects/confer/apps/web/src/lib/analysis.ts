import type { DiscoveryResponse, Issue, RequestKind, SourceDocument } from "./model.ts";
import { MAX_RESPONSES, MAX_TEXT_LENGTH } from "./model.ts";

/** Conservative, explainable triage. These rules do not determine legal sufficiency. */
export function analyzeResponse(text: string, kind: RequestKind): Issue[] {
  const issues: Issue[] = [];
  const normalized = text.replace(/\s+/g, " ").trim();
  const add = (
    code: Issue["code"],
    title: string,
    severity: Issue["severity"],
    explanation: string,
    remedy: string,
    pattern: RegExp,
  ) => {
    const match = normalized.match(pattern);
    if (!match || match.index === undefined) {
      return;
    }
    const start = Math.max(0, match.index - 50);
    const end = Math.min(normalized.length, match.index + match[0].length + 100);
    issues.push({
      code,
      title,
      severity,
      explanation,
      remedy,
      excerpt: normalized.slice(start, end),
    });
  };

  if (/\bobject(?:s|ion|ions)?\b/i.test(normalized)) {
    add(
      "boilerplate",
      "Generalized objections",
      "medium",
      "The response uses a generalized objection. Review whether it explains the objection's factual basis and how it applies to this particular request.",
      "Explain the request-specific basis for each objection and identify any information or documents being withheld on that basis.",
      /\b(?:vague|ambiguous|overly broad|overbroad|unduly burdensome|not reasonably calculated)\b/i,
    );
  }

  add(
    "conditional",
    "Unclear scope of response",
    "low",
    "A response qualified by 'subject to' or 'without waiving' may leave unclear whether anything has been withheld. The phrase alone does not establish a deficiency.",
    "Clarify whether the response is complete and whether any information or documents have been withheld because of the objections.",
    /\b(?:subject to|without waiving)\b/i,
  );

  if (kind === "RFP") {
    if (!/\b(?:by|on|before|within)\s+(?:\d|[A-Z][a-z]+\s+\d)/i.test(normalized)) {
      add(
        "production",
        "Production timing unclear",
        "medium",
        "The response promises future production but this rule did not detect a specific production date. Check the complete response and any subsequent agreements.",
        "Provide a definite production date, describe the scope of the production, and confirm whether the production will be complete.",
        /\b(?:will (?:produce|be produced)|to be produced|at a later date|in due course)\b/i,
      );
    }
    if (
      /\b(?:privileg(?:e|ed)|work.product)\b/i.test(normalized) &&
      !/\bprivilege log\b/i.test(normalized)
    ) {
      add(
        "privilege",
        "Privilege support not identified",
        "high",
        "Privilege or work product is mentioned, but no privilege log is referenced in this response. A log may have been provided separately or may not be required; verify that context.",
        "Identify what is being withheld on privilege or work-product grounds and provide the supporting information required by the applicable rules, including a log if appropriate.",
        /\b(?:privileg(?:e|ed)|work.product)\b/i,
      );
    }
  }

  if (kind === "ROG" && !/\b(?:bates|[a-z]{2,}[- ]?\d{3,}|pages?\s+\d)\b/i.test(normalized)) {
    add(
      "evasive",
      "Documents not specifically identified",
      "high",
      "The response refers to documents without a specific reference detected by this rule. Verify whether the applicable rules permit a records-based answer and whether the records are sufficiently identified.",
      "Provide a substantive answer or identify the specific records from which the answer can be derived and explain the basis for relying on those records.",
      /\b(?:see (?:the )?(?:documents|records)|refer(?:s)? to (?:the )?(?:documents|records)|answer.{0,30}in.{0,15}(?:documents|records))\b/i,
    );
  }

  if (kind === "RFA" && !/\b(?:reasonable|diligent) inquiry\b/i.test(normalized)) {
    add(
      "admission",
      "Inquiry basis unclear",
      "medium",
      "The response says the party cannot admit or deny, but no reasonable inquiry is described. Check the entire response and the jurisdiction's requirements before challenging it.",
      "Explain the inquiry undertaken and why the information available is insufficient to admit or deny, or provide an amended admission or denial.",
      /\b(?:cannot admit or deny|unable to admit or deny|lacks sufficient (?:information|knowledge))\b/i,
    );
  }

  add(
    "refusal",
    "Substantive response withheld",
    "high",
    "The response expressly declines a substantive answer or production. Review the stated grounds, the request's scope, and any privilege or proportionality considerations before seeking relief.",
    "Provide a substantive response to the non-objectionable portion, or explain the specific grounds for withholding it.",
    /\b(?:will not (?:produce|respond|answer)|declines to (?:respond|answer)|refuses to (?:produce|respond|answer))\b/i,
  );

  return issues;
}

const headingPattern =
  /^[ \t]*(RESPONSE(?:S)?(?:\s+TO)?(?:\s+(?:REQUEST(?:S)?\s+FOR\s+(?:PRODUCTION|ADMISSION)(?:\s+OF\s+DOCUMENTS)?|(?:SPECIAL\s+|FORM\s+)?INTERROGATOR(?:Y|IES)|REQUEST))?|REQUEST(?:S)?\s+FOR\s+(?:PRODUCTION|ADMISSION)(?:\s+OF\s+DOCUMENTS)?|(?:SPECIAL\s+|FORM\s+)?INTERROGATOR(?:Y|IES)|REQUEST)\s*(?:NUMBER|NO\.?|#)\s*(\d+(?:\.\d+)?)\s*[:.)-]?\s*/gim;

function detectKind(heading: string, fallback: RequestKind): RequestKind {
  if (/PRODUCTION/i.test(heading)) {
    return "RFP";
  }
  if (/INTERROGATOR/i.test(heading)) {
    return "ROG";
  }
  if (/ADMISSION/i.test(heading)) {
    return "RFA";
  }
  return fallback;
}

export function parseDiscovery(
  document: SourceDocument,
  fallbackKind: RequestKind = "RFP",
): DiscoveryResponse[] {
  if (document.text.length > MAX_TEXT_LENGTH) {
    throw new Error(
      "This document is too long. Split it into sets of fewer than 300,000 characters.",
    );
  }
  if (document.pages > 200 || document.text.split("\f").length > 200) {
    throw new Error("Import no more than 200 text pages at a time.");
  }
  const text = document.text.replace(/\r\n?/g, "\n").replace(/\f/g, "\f\n");
  const headings = [...text.matchAll(headingPattern)];
  if (headings.length === 0) {
    throw new Error(
      "No numbered discovery responses found. Use headings such as ‘REQUEST FOR PRODUCTION NO. 1’ and ‘RESPONSE TO REQUEST FOR PRODUCTION NO. 1’, or ‘RESPONSE NO. 1’.",
    );
  }
  const entries = new Map<string, DiscoveryResponse>();
  for (const [index, match] of headings.entries()) {
    const heading = match[1];
    const number = match[2];
    if (!heading || !number || match.index === undefined) {
      continue;
    }
    const isResponse = /^RESPONSE/i.test(heading);
    const kind = detectKind(heading, fallbackKind);
    // Generic response headings inherit the immediately preceding request's kind.
    const previous = headings[index - 1];
    const effectiveKind =
      isResponse && /^RESPONSES?$/i.test(heading) && previous?.[2] === number
        ? detectKind(previous[1] ?? "", fallbackKind)
        : kind;
    const key = `${effectiveKind}:${number}`;
    const start = match.index + match[0].length;
    const end = headings[index + 1]?.index ?? text.length;
    const body = text.slice(start, end).replace(/\f/g, "\n").trim();
    const entry = entries.get(key) ?? {
      id: crypto.randomUUID(),
      number,
      kind: effectiveKind,
      request: "",
      response: "",
      documentId: document.id,
      page: text.slice(0, match.index).split("\f").length,
      issues: [],
      status: "pending" as const,
      note: "",
    };
    if (isResponse) {
      if (entry.response) {
        throw new Error(
          `More than one response for ${effectiveKind} No. ${number} was found. Import separate sets as separate documents.`,
        );
      }
      entry.response = body;
      entry.page = text.slice(0, match.index).split("\f").length;
    } else {
      entry.request = body;
    }
    entries.set(key, entry);
  }
  const responses = [...entries.values()].filter((entry) => entry.response.trim());
  if (responses.length === 0) {
    throw new Error(
      "Numbered requests were found, but no response text. Include the opposing party's response under a ‘RESPONSE … NO. 1’ heading.",
    );
  }
  if (responses.length > MAX_RESPONSES) {
    throw new Error(`Import no more than ${MAX_RESPONSES} responses at a time.`);
  }
  for (const entry of responses) {
    entry.issues = analyzeResponse(entry.response, entry.kind);
  }
  return responses;
}
