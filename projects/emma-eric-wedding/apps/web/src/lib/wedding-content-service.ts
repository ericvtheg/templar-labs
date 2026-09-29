import { defaultWeddingPage, type WeddingPageData, weddingPageDataSchema } from "./wedding-page.ts";

export type WeddingRevisionAction = "save" | "publish" | "restore";

export type WeddingDocument = {
  readonly version: number;
  readonly draft: WeddingPageData;
  readonly published: WeddingPageData | null;
  readonly updatedAt: Date;
  readonly updatedBy: string;
  readonly publishedAt: Date | null;
};

export type WeddingRevision = {
  readonly id: string;
  readonly version: number;
  readonly action: WeddingRevisionAction;
  readonly data: WeddingPageData;
  readonly createdAt: Date;
  readonly createdBy: string;
};

export type WeddingContentCommit = {
  readonly expectedVersion: number;
  readonly document: WeddingDocument;
  readonly revision: WeddingRevision;
};

export type WeddingContentRepository = {
  readonly readDocument: () => Promise<WeddingDocument | null>;
  readonly readPublished: () => Promise<WeddingPageData | null>;
  readonly commit: (input: WeddingContentCommit) => Promise<WeddingDocument | null>;
  readonly listRevisions: () => Promise<readonly WeddingRevision[]>;
  readonly readRevision: (id: string) => Promise<WeddingRevision | null>;
};

export type WeddingEditorActor = {
  readonly id: string;
};

export type WeddingEditorState = WeddingDocument & {
  readonly revisions: readonly WeddingRevision[];
};

type MutationInput = {
  readonly data: WeddingPageData;
  readonly expectedVersion: number;
  readonly actor: WeddingEditorActor;
};

type RestoreInput = {
  readonly revisionId: string;
  readonly expectedVersion: number;
  readonly actor: WeddingEditorActor;
};

export class StaleWeddingContentError extends Error {
  constructor() {
    super("The wedding page changed in another session. Reload before saving again.");
    this.name = "StaleWeddingContentError";
  }
}

export function createWeddingContentService(
  repository: WeddingContentRepository,
  dependencies: {
    readonly createId?: () => string;
    readonly now?: () => Date;
  } = {},
) {
  const createId = dependencies.createId ?? crypto.randomUUID;
  const now = dependencies.now ?? (() => new Date());

  async function loadEditor(): Promise<WeddingEditorState> {
    const document = await repository.readDocument();
    const revisions = await repository.listRevisions();

    if (document === null) {
      return {
        version: 0,
        draft: clonePage(defaultWeddingPage),
        published: null,
        updatedAt: new Date(0),
        updatedBy: "",
        publishedAt: null,
        revisions,
      };
    }

    return { ...document, revisions };
  }

  function loadPublished(): Promise<WeddingPageData | null> {
    return repository.readPublished();
  }

  async function saveDraft(input: MutationInput): Promise<WeddingEditorState> {
    const current = await repository.readDocument();
    return commit({
      current,
      expectedVersion: input.expectedVersion,
      actor: input.actor,
      action: "save",
      draft: parsePage(input.data),
      published: current?.published ?? null,
      publishedAt: current?.publishedAt ?? null,
    });
  }

  async function publish(input: MutationInput): Promise<WeddingEditorState> {
    const current = await repository.readDocument();
    const data = parsePage(input.data);
    const publishedAt = now();
    return commit({
      current,
      expectedVersion: input.expectedVersion,
      actor: input.actor,
      action: "publish",
      draft: data,
      published: data,
      publishedAt,
      timestamp: publishedAt,
    });
  }

  async function restoreDraft(input: RestoreInput): Promise<WeddingEditorState> {
    const [current, revision] = await Promise.all([
      repository.readDocument(),
      repository.readRevision(input.revisionId),
    ]);
    if (revision === null) {
      throw new Error("Wedding page revision not found.");
    }

    return commit({
      current,
      expectedVersion: input.expectedVersion,
      actor: input.actor,
      action: "restore",
      draft: parsePage(revision.data),
      published: current?.published ?? null,
      publishedAt: current?.publishedAt ?? null,
    });
  }

  async function commit(input: {
    readonly current: WeddingDocument | null;
    readonly expectedVersion: number;
    readonly actor: WeddingEditorActor;
    readonly action: WeddingRevisionAction;
    readonly draft: WeddingPageData;
    readonly published: WeddingPageData | null;
    readonly publishedAt: Date | null;
    readonly timestamp?: Date;
  }): Promise<WeddingEditorState> {
    if ((input.current?.version ?? 0) !== input.expectedVersion) {
      throw new StaleWeddingContentError();
    }

    const timestamp = input.timestamp ?? now();
    const version = input.expectedVersion + 1;
    const document: WeddingDocument = {
      version,
      draft: input.draft,
      published: input.published,
      updatedAt: timestamp,
      updatedBy: input.actor.id,
      publishedAt: input.publishedAt,
    };
    const revision: WeddingRevision = {
      id: createId(),
      version,
      action: input.action,
      data: input.draft,
      createdAt: timestamp,
      createdBy: input.actor.id,
    };
    const saved = await repository.commit({
      expectedVersion: input.expectedVersion,
      document,
      revision,
    });
    if (saved === null) {
      throw new StaleWeddingContentError();
    }

    return { ...saved, revisions: await repository.listRevisions() };
  }

  return { loadEditor, loadPublished, saveDraft, publish, restoreDraft };
}

function parsePage(data: WeddingPageData) {
  return weddingPageDataSchema.parse(data);
}

function clonePage(data: WeddingPageData) {
  return weddingPageDataSchema.parse(structuredClone(data));
}
