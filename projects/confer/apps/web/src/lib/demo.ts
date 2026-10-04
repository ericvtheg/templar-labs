import { parseDiscovery } from "./analysis.ts";
import type { Matter, SourceDocument, Workspace } from "./model.ts";

export const sampleProduction = `REQUEST FOR PRODUCTION NO. 1:
Produce all contracts and amendments between Plaintiff and Defendant relating to Plaintiff's employment.
RESPONSE TO REQUEST FOR PRODUCTION NO. 1:
Responding party objects that this request is vague, ambiguous, overly broad, and unduly burdensome. Responding party will not produce documents in response to this request.

REQUEST FOR PRODUCTION NO. 2:
Produce communications concerning the decision to terminate Plaintiff's employment.
RESPONSE TO REQUEST FOR PRODUCTION NO. 2:
Responding party objects to this request to the extent it seeks documents protected by attorney-client privilege or the attorney work-product doctrine. Responsive materials are withheld on that basis.

REQUEST FOR PRODUCTION NO. 3:
Produce Plaintiff's personnel file, including performance reviews.
RESPONSE TO REQUEST FOR PRODUCTION NO. 3:
After a diligent search, responding party will comply. All responsive, nonprivileged documents have been produced at ACME000101–ACME000146.

REQUEST FOR PRODUCTION NO. 4:
Produce employee handbooks and workplace policies in effect during Plaintiff's employment.
RESPONSE TO REQUEST FOR PRODUCTION NO. 4:
Responding party will produce responsive, nonprivileged documents in due course. The search for responsive materials is ongoing.

REQUEST FOR PRODUCTION NO. 5:
Produce records supporting the stated financial reasons for Plaintiff's termination.
RESPONSE TO REQUEST FOR PRODUCTION NO. 5:
Responding party objects on relevance and confidentiality grounds and declines to respond to this request. Responding party will not produce its financial records.

REQUEST FOR PRODUCTION NO. 6:
Produce documents relating to investigations of Plaintiff's workplace complaints.
RESPONSE TO REQUEST FOR PRODUCTION NO. 6:
Subject to and without waiving its objections, responding party has produced responsive documents at ACME000201–ACME000224.

REQUEST FOR PRODUCTION NO. 7:
Produce insurance policies that may cover the claims in this action.
RESPONSE TO REQUEST FOR PRODUCTION NO. 7:
Responding party has produced all responsive insurance policies at ACME000301–ACME000340 after a diligent search and reasonable inquiry.

REQUEST FOR PRODUCTION NO. 8:
Produce photographs of Plaintiff's assigned work area.
RESPONSE TO REQUEST FOR PRODUCTION NO. 8:
Following a diligent search and reasonable inquiry, responding party has no responsive documents in its possession, custody, or control. No documents are being withheld on the basis of an objection.`;

const sampleInterrogatories = `SPECIAL INTERROGATORY NO. 1:
Identify each person involved in the decision to terminate Plaintiff's employment and describe their role.
RESPONSE TO SPECIAL INTERROGATORY NO. 1:
See the documents previously produced. The answer may be derived from responding party's business records.

SPECIAL INTERROGATORY NO. 2:
State the date on which Plaintiff's employment was terminated.
RESPONSE TO SPECIAL INTERROGATORY NO. 2:
Plaintiff's employment was terminated on March 14, 2024.

SPECIAL INTERROGATORY NO. 3:
Identify persons with knowledge of Plaintiff's performance during the six months before termination.
RESPONSE TO SPECIAL INTERROGATORY NO. 3:
Subject to and without waiving its objections, responding party identifies Jordan Lee, Plaintiff's direct manager, and Sam Rivera, the human resources representative. Both can be contacted through counsel.`;

const sampleAdmissions = `REQUEST FOR ADMISSION NO. 1:
Admit that Plaintiff reported a workplace safety concern before the termination decision.
RESPONSE TO REQUEST FOR ADMISSION NO. 1:
Responding party lacks sufficient information and therefore cannot admit or deny this request.`;

export function createDemoWorkspace(): Workspace {
  const addedAt = new Date().toISOString();
  const documents: SourceDocument[] = [
    {
      id: "demo-rfp",
      name: "Production responses · Set One.txt",
      text: sampleProduction,
      addedAt,
      pages: 1,
    },
    {
      id: "demo-rog",
      name: "Interrogatory responses · Set One.txt",
      text: sampleInterrogatories,
      addedAt,
      pages: 1,
    },
    {
      id: "demo-rfa",
      name: "Admission responses · Set One.txt",
      text: sampleAdmissions,
      addedAt,
      pages: 1,
    },
  ];
  const responses = documents.flatMap((document) => parseDiscovery(document));
  for (const response of responses) {
    response.id = `demo-${response.kind}-${response.number}`;
    if ((response.kind === "RFP" && response.number === "6") || response.kind === "RFA") {
      response.status = "reviewed";
    }
  }
  const matter: Matter = {
    id: "demo-matter",
    title: "Mitchell v. Acme Industries",
    caseNumber: "24-CV-01842",
    court: "Superior Court of California, County of San Francisco",
    client: "Alex Mitchell",
    respondingParty: "Acme Industries, Inc.",
    opposingCounsel: "Counsel for Acme Industries",
    sender: "[Your name and firm]",
    responseBy: "",
    isDemo: true,
    createdAt: addedAt,
    documents,
    responses,
    drafts: [],
  };
  return { version: 1, activeMatterId: matter.id, matters: [matter] };
}
