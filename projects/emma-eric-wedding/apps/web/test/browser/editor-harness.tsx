import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { createRoot } from "react-dom/client";
import { WeddingEditor, type WeddingEditorActions } from "../../src/components/wedding-editor.tsx";
import type { WeddingEditorState, WeddingRevision } from "../../src/lib/wedding-content-service.ts";
import {
  defaultWeddingPage,
  type WeddingPageData,
  weddingPageDataSchema,
} from "../../src/lib/wedding-page.ts";
import "../../src/styles.css";

type ObservedPuckPayload = WeddingPageData & {
  readonly root: WeddingPageData["root"] & {
    readonly readOnly?: Readonly<Record<string, boolean>>;
  };
  readonly zones?: Readonly<Record<string, unknown>>;
};

type ObservedMetadata = { readonly hasRootReadOnly: boolean; readonly hasZones: boolean };

type HarnessState = {
  readonly auth: "isolated-authorized-fixture";
  readonly savePayloads: ObservedPuckPayload[];
  readonly publishPayloads: ObservedPuckPayload[];
  readonly saveMetadata: ObservedMetadata[];
  readonly publishMetadata: ObservedMetadata[];
  saved: WeddingPageData | null;
  published: WeddingPageData | null;
  releasePending: (() => void) | null;
};

declare global {
  interface Window {
    weddingEditorSmoke: HarnessState;
  }
}

const smokeState: HarnessState = {
  auth: "isolated-authorized-fixture",
  savePayloads: [],
  publishPayloads: [],
  saveMetadata: [],
  publishMetadata: [],
  saved: null,
  published: null,
  releasePending: null,
};
window.weddingEditorSmoke = smokeState;

let version = 0;
let draft = structuredClone(defaultWeddingPage);
let revisions: WeddingRevision[] = [];

async function commit(
  action: "save" | "publish",
  input: { readonly data: { readonly data: WeddingPageData; readonly expectedVersion: number } },
): Promise<WeddingEditorState> {
  const rawPayload = structuredClone(input.data.data) as ObservedPuckPayload;
  const payloads = action === "save" ? smokeState.savePayloads : smokeState.publishPayloads;
  const metadata = action === "save" ? smokeState.saveMetadata : smokeState.publishMetadata;
  payloads.push(rawPayload);
  metadata.push({
    hasRootReadOnly: Reflect.has(rawPayload.root, "readOnly"),
    hasZones: Reflect.has(rawPayload, "zones"),
  });
  const nextDraft = weddingPageDataSchema.parse(rawPayload);
  if (input.data.expectedVersion !== version) {
    throw new Error("The wedding page changed in another session.");
  }

  await new Promise<void>((resolve) => {
    smokeState.releasePending = resolve;
  });
  smokeState.releasePending = null;

  version += 1;
  draft = nextDraft;
  smokeState.saved = structuredClone(nextDraft);
  if (action === "publish") {
    smokeState.published = structuredClone(nextDraft);
  }
  const revision: WeddingRevision = {
    id: `browser-${action}-${version}`,
    version,
    action,
    data: nextDraft,
    createdAt: new Date("2026-09-29T18:00:00.000Z"),
    createdBy: "isolated-browser-fixture",
  };
  revisions = [revision, ...revisions];
  return {
    version,
    draft,
    published: smokeState.published,
    updatedAt: revision.createdAt,
    updatedBy: revision.createdBy,
    publishedAt: action === "publish" ? revision.createdAt : null,
    revisions,
  };
}

const actions: WeddingEditorActions = {
  saveDraft: (input) => commit("save", input),
  publish: (input) => commit("publish", input),
  restore: () => Promise.reject(new Error("No restore fixture is used in this smoke test.")),
};

const initialState: WeddingEditorState = {
  version,
  draft,
  published: null,
  updatedAt: new Date(0),
  updatedBy: "",
  publishedAt: null,
  revisions,
};

const rootRoute = createRootRoute({
  component: () => <WeddingEditor initialState={initialState} actions={actions} />,
});
const router = createRouter({
  routeTree: rootRoute,
  history: createMemoryHistory({ initialEntries: ["/"] }),
});
const root = document.getElementById("root");
if (root === null) {
  throw new Error("Browser harness root is missing.");
}
createRoot(root).render(<RouterProvider router={router} />);
