import assert from "node:assert/strict";
import test from "node:test";
import { analyzeResponse, parseDiscovery } from "../src/lib/analysis.ts";
import { createDemoWorkspace } from "../src/lib/demo.ts";
import type { SourceDocument } from "../src/lib/model.ts";
import { flaggedResponses, MAX_TEXT_LENGTH, priority, workspaceSchema } from "../src/lib/model.ts";

function source(text: string): SourceDocument {
  return {
    id: "source",
    name: "responses.txt",
    text,
    pages: text.split("\f").length,
    addedAt: "2026-01-01T00:00:00Z",
  };
}

test("sample is schema-valid and derived counts match actual responses", () => {
  const workspace = createDemoWorkspace();
  assert.ok(workspaceSchema.safeParse(workspace).success);
  const matter = workspace.matters[0];
  assert.ok(matter);
  assert.equal(matter.documents.length, 3);
  assert.equal(matter.responses.length, 12);
  assert.equal(flaggedResponses(matter).length, 8);
  assert.equal(
    flaggedResponses(matter).filter((response) => response.status === "reviewed").length,
    2,
  );
});

test("pairs requests with responses and preserves verbatim source text", () => {
  const responses = parseDiscovery(
    source(
      "REQUEST FOR PRODUCTION NO. 1:\nProduce contracts.\nRESPONSE TO REQUEST FOR PRODUCTION NO. 1:\nResponding party objects that the request is vague.\n\nREQUEST FOR PRODUCTION NO. 2:\nProduce policies.\nRESPONSE NO. 2:\nAll responsive records were produced at ACME00001.",
    ),
  );
  assert.equal(responses.length, 2);
  assert.equal(responses[0]?.request, "Produce contracts.");
  assert.equal(responses[0]?.response, "Responding party objects that the request is vague.");
  assert.equal(responses[1]?.request, "Produce policies.");
  assert.equal(responses[1]?.issues.length, 0);
});

test("supports mixed discovery, wrapped headings, decimal interrogatory numbers, and generic responses", () => {
  const responses = parseDiscovery(
    source(
      "SPECIAL INTERROGATORY\nNO. 17.1:\nIdentify records.\nRESPONSE NO. 17.1:\nSee the documents.\n\nREQUEST FOR ADMISSION NO. 2:\nAdmit the fact.\nRESPONSE NO. 2:\nCannot admit or deny.",
    ),
  );
  assert.equal(responses[0]?.kind, "ROG");
  assert.equal(responses[0]?.number, "17.1");
  assert.equal(responses[1]?.kind, "RFA");
  assert.ok(responses[1]?.issues.some((issue) => issue.code === "admission"));
});

test("supports response-only documents and explicit fallback types", () => {
  const [response] = parseDiscovery(source("RESPONSE NO. 9:\nSee the documents."), "ROG");
  assert.equal(response?.request, "");
  assert.equal(response?.kind, "ROG");
  assert.equal(response?.number, "9");
  assert.equal(response?.issues[0]?.code, "evasive");
});

test("records source text pages and handles CRLF", () => {
  const responses = parseDiscovery(
    source(
      "Cover sheet\fRESPONSE TO REQUEST FOR PRODUCTION NO. 3:\r\nWe will produce responsive documents in due course.",
    ),
  );
  assert.equal(responses[0]?.page, 2);
  assert.ok(responses[0]?.issues.some((issue) => issue.code === "production"));
});

test("rejects unrecognized, request-only, duplicate, and oversized sources", () => {
  assert.throws(() => parseDiscovery(source("An unstructured paragraph.")), /No numbered/);
  assert.throws(
    () => parseDiscovery(source("REQUEST NO. 1:\nProduce all documents.")),
    /no response text/,
  );
  assert.throws(
    () => parseDiscovery(source("RESPONSE NO. 1:\nAnswer.\nRESPONSE NO. 1:\nAnother answer.")),
    /More than one response/,
  );
  assert.throws(() => parseDiscovery(source("x".repeat(MAX_TEXT_LENGTH + 1))), /too long/);
  assert.throws(() => parseDiscovery(source("\f".repeat(200))), /200 text pages/);
});

test("flags generalized objections only in objection context", () => {
  assert.deepEqual(
    analyzeResponse(
      "The description of the event was vague, but all responsive records are produced.",
      "RFP",
    ),
    [],
  );
  assert.ok(
    analyzeResponse(
      "Responding party objects that this request is vague and ambiguous.",
      "RFP",
    ).some((issue) => issue.code === "boilerplate"),
  );
});

test("does not flag definite production dates or specific record references", () => {
  for (const answer of [
    "We will produce by July 20, 2026.",
    "We will produce within 30 days.",
    "We will produce on 2026-07-20.",
  ]) {
    assert.ok(!analyzeResponse(answer, "RFP").some((issue) => issue.code === "production"));
  }
  assert.deepEqual(
    analyzeResponse("See the documents identified at Bates ACME000123–ACME000130.", "ROG"),
    [],
  );
  assert.deepEqual(
    analyzeResponse("After reasonable inquiry, responding party cannot admit or deny.", "RFA"),
    [],
  );
});

test("checks privilege references cautiously and does not assert a log is universally required", () => {
  const finding = analyzeResponse("Responsive records are withheld as privileged.", "RFP").find(
    (issue) => issue.code === "privilege",
  );
  assert.ok(finding);
  assert.match(finding.explanation, /may not be required/);
  assert.deepEqual(
    analyzeResponse(
      "Privileged records are identified in the separately served privilege log.",
      "RFP",
    ),
    [],
  );
});

test("findings contain actual matching source excerpts and priority is the strongest finding", () => {
  const text =
    "Responding party objects that this is unduly burdensome and will not produce documents.";
  const findings = analyzeResponse(text, "RFP");
  for (const finding of findings) {
    assert.ok(text.includes(finding.excerpt));
  }
  const [response] = parseDiscovery(source(`RESPONSE NO. 1:\n${text}`));
  assert.ok(response);
  assert.equal(priority(response), "high");
});

test("dismissing a finding removes it from active flagged counts without losing the source", () => {
  const workspace = createDemoWorkspace();
  const matter = workspace.matters[0];
  assert.ok(matter);
  const response = matter.responses[0];
  assert.ok(response);
  const original = response.response;
  response.status = "dismissed";
  assert.equal(flaggedResponses(matter).length, 7);
  assert.equal(response.response, original);
});
