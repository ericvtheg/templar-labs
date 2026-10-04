import { z } from "zod";

export const MAX_TEXT_LENGTH = 300_000;
export const MAX_RESPONSES = 250;
export const MAX_DRAFT_LENGTH = 1_000_000;
export const requestKinds = ["RFP", "ROG", "RFA"] as const;
export const kindLabels = {
  RFP: "Request for production",
  ROG: "Interrogatory",
  RFA: "Request for admission",
} as const;

const shortText = z.string().max(500);
const dateString = z.string().refine((value) => {
  if (!value) {
    return true;
  }
  const date = new Date(`${value}T12:00:00Z`);
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
}, "Enter a valid date.");

export const issueSchema = z.object({
  code: z.enum([
    "boilerplate",
    "conditional",
    "production",
    "privilege",
    "evasive",
    "admission",
    "refusal",
  ]),
  title: shortText,
  severity: z.enum(["high", "medium", "low"]),
  explanation: z.string().max(3_000),
  remedy: z.string().max(3_000),
  excerpt: z.string().max(10_000),
});

export const responseSchema = z.object({
  id: shortText,
  number: z.string().max(20),
  kind: z.enum(requestKinds),
  request: z.string().max(MAX_TEXT_LENGTH),
  response: z.string().max(MAX_TEXT_LENGTH),
  documentId: shortText,
  page: z.number().int().min(1).max(200),
  issues: z.array(issueSchema).max(10),
  status: z.enum(["pending", "reviewed", "dismissed"]),
  note: z.string().max(5_000),
});

export const documentSchema = z.object({
  id: shortText,
  name: shortText,
  text: z.string().max(MAX_TEXT_LENGTH),
  addedAt: shortText,
  pages: z.number().int().min(1).max(200),
});

export const draftKinds = ["letter", "motion"] as const;
export const draftLabels = {
  letter: "Meet-and-confer letter",
  motion: "Motion to compel outline",
} as const;

export const draftSchema = z.object({
  id: shortText,
  kind: z.enum(draftKinds),
  title: shortText,
  content: z.string().max(MAX_DRAFT_LENGTH),
  updatedAt: shortText,
  responseIds: z.array(shortText).max(MAX_RESPONSES),
});

export const matterDetailsSchema = z.object({
  title: z.string().trim().min(1, "A matter name is required.").max(200),
  caseNumber: shortText,
  court: shortText,
  client: shortText,
  respondingParty: shortText,
  opposingCounsel: shortText,
  sender: shortText,
  responseBy: dateString,
});

export const matterSchema = matterDetailsSchema
  .extend({
    id: shortText,
    isDemo: z.boolean(),
    createdAt: shortText,
    documents: z.array(documentSchema).max(100),
    responses: z.array(responseSchema).max(MAX_RESPONSES),
    drafts: z.array(draftSchema).max(100),
  })
  .superRefine((matter, context) => {
    const sourceIds = new Set(matter.documents.map((document) => document.id));
    const responseIds = new Set(matter.responses.map((response) => response.id));
    const draftIds = new Set(matter.drafts.map((draft) => draft.id));
    if (
      !matter.id ||
      sourceIds.size !== matter.documents.length ||
      responseIds.size !== matter.responses.length ||
      draftIds.size !== matter.drafts.length
    ) {
      context.addIssue({
        code: "custom",
        message: "Matter, source, response, and draft IDs must be nonempty and unique.",
      });
    }
    for (const response of matter.responses) {
      const document = matter.documents.find((source) => source.id === response.documentId);
      if (!response.id || !document || response.page > document.pages) {
        context.addIssue({
          code: "custom",
          message: "Each response must reference an existing source text page.",
        });
      }
    }
    for (const draft of matter.drafts) {
      if (!draft.id || draft.responseIds.some((id) => !responseIds.has(id))) {
        context.addIssue({
          code: "custom",
          message: "Draft provenance must reference existing responses.",
        });
      }
    }
  });

export const workspaceSchema = z
  .object({
    version: z.literal(1),
    activeMatterId: shortText,
    matters: z.array(matterSchema).min(1).max(50),
  })
  .refine(
    (value) =>
      value.matters.some((matter) => matter.id === value.activeMatterId) &&
      new Set(value.matters.map((matter) => matter.id)).size === value.matters.length,
    {
      message: "The active matter must exist and matter IDs must be unique.",
    },
  );

export type Issue = z.infer<typeof issueSchema>;
export type DiscoveryResponse = z.infer<typeof responseSchema>;
export type SourceDocument = z.infer<typeof documentSchema>;
export type Draft = z.infer<typeof draftSchema>;
export type DraftKind = Draft["kind"];
export type MatterDetails = z.infer<typeof matterDetailsSchema>;
export type Matter = z.infer<typeof matterSchema>;
export type Workspace = z.infer<typeof workspaceSchema>;
export type RequestKind = DiscoveryResponse["kind"];
export type Severity = Issue["severity"];

export const emptyDetails: MatterDetails = {
  title: "",
  caseNumber: "",
  court: "",
  client: "",
  respondingParty: "",
  opposingCounsel: "",
  sender: "",
  responseBy: "",
};

export function priority(response: DiscoveryResponse): Severity | null {
  for (const severity of ["high", "medium", "low"] as const) {
    if (response.issues.some((issue) => issue.severity === severity)) {
      return severity;
    }
  }
  return null;
}

export function flaggedResponses(matter: Matter): DiscoveryResponse[] {
  return matter.responses.filter(
    (response) => response.issues.length > 0 && response.status !== "dismissed",
  );
}

export function formatDate(value: string): string {
  if (!value) {
    return "Not set";
  }
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  return Number.isNaN(date.getTime())
    ? "Not set"
    : date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
}

export function requestTitle(response: DiscoveryResponse): string {
  const text = response.request.replace(/\s+/g, " ").trim();
  if (!text) {
    return `${kindLabels[response.kind]} No. ${response.number}`;
  }
  return text.length > 76 ? `${text.slice(0, 73)}…` : text;
}
