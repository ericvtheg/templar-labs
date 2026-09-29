import { and, desc, eq } from "@templar/db";
import { weddingSiteDocuments, weddingSiteRevisions } from "../../../../db/schema.ts";
import { getWeddingDatabase, type WeddingDatabase } from "./database.server.ts";
import type {
  WeddingContentCommit,
  WeddingContentRepository,
  WeddingDocument,
  WeddingRevision,
  WeddingRevisionAction,
} from "./wedding-content-service.ts";
import { type WeddingPageData, weddingPageDataSchema } from "./wedding-page.ts";

const documentId = "wedding-homepage";

export async function getWeddingContentRepository(): Promise<WeddingContentRepository> {
  return makeWeddingContentRepository(await getWeddingDatabase());
}

export function makeWeddingContentRepository(database: WeddingDatabase): WeddingContentRepository {
  async function readDocument(): Promise<WeddingDocument | null> {
    const rows = await database.db
      .select({
        version: weddingSiteDocuments.version,
        draftJson: weddingSiteDocuments.draftJson,
        publishedJson: weddingSiteDocuments.publishedJson,
        updatedAt: weddingSiteDocuments.updatedAt,
        updatedBy: weddingSiteDocuments.updatedBy,
        publishedAt: weddingSiteDocuments.publishedAt,
      })
      .from(weddingSiteDocuments)
      .where(eq(weddingSiteDocuments.id, documentId))
      .limit(1);
    const row = rows[0];
    if (row === undefined) {
      return null;
    }

    return {
      version: row.version,
      draft: parseStoredPage(row.draftJson),
      published: row.publishedJson === null ? null : parseStoredPage(row.publishedJson),
      updatedAt: row.updatedAt,
      updatedBy: row.updatedBy,
      publishedAt: row.publishedAt,
    };
  }

  async function readPublished(): Promise<WeddingPageData | null> {
    const rows = await database.db
      .select({ publishedJson: weddingSiteDocuments.publishedJson })
      .from(weddingSiteDocuments)
      .where(eq(weddingSiteDocuments.id, documentId))
      .limit(1);
    const value = rows[0]?.publishedJson;
    return value === undefined || value === null ? null : parseStoredPage(value);
  }

  async function commit(input: WeddingContentCommit): Promise<WeddingDocument | null> {
    const current = await readDocument();
    if ((current?.version ?? 0) !== input.expectedVersion) {
      return null;
    }

    const documentValues = {
      version: input.document.version,
      draftJson: JSON.stringify(input.document.draft),
      publishedJson:
        input.document.published === null ? null : JSON.stringify(input.document.published),
      updatedAt: input.document.updatedAt,
      updatedBy: input.document.updatedBy,
      publishedAt: input.document.publishedAt,
    };
    const revisionStatement = database.db.insert(weddingSiteRevisions).values({
      id: input.revision.id,
      documentId,
      version: input.revision.version,
      action: input.revision.action,
      contentJson: JSON.stringify(input.revision.data),
      createdBy: input.revision.createdBy,
      createdAt: input.revision.createdAt,
    });

    try {
      if (input.expectedVersion === 0) {
        await database.db.batch([
          database.db.insert(weddingSiteDocuments).values({ id: documentId, ...documentValues }),
          revisionStatement,
        ]);
      } else {
        await database.db.batch([
          database.db
            .update(weddingSiteDocuments)
            .set(documentValues)
            .where(
              and(
                eq(weddingSiteDocuments.id, documentId),
                eq(weddingSiteDocuments.version, input.expectedVersion),
              ),
            ),
          revisionStatement,
        ]);
      }
    } catch (error) {
      const latest = await readDocument();
      if ((latest?.version ?? 0) !== input.expectedVersion) {
        return null;
      }
      throw error;
    }

    const saved = await readDocument();
    return saved?.version === input.document.version ? saved : null;
  }

  async function listRevisions(): Promise<readonly WeddingRevision[]> {
    const rows = await database.db
      .select({
        id: weddingSiteRevisions.id,
        version: weddingSiteRevisions.version,
        action: weddingSiteRevisions.action,
        contentJson: weddingSiteRevisions.contentJson,
        createdAt: weddingSiteRevisions.createdAt,
        createdBy: weddingSiteRevisions.createdBy,
      })
      .from(weddingSiteRevisions)
      .where(eq(weddingSiteRevisions.documentId, documentId))
      .orderBy(desc(weddingSiteRevisions.version))
      .limit(30);
    return rows.map(toRevision);
  }

  async function readRevision(id: string): Promise<WeddingRevision | null> {
    const rows = await database.db
      .select({
        id: weddingSiteRevisions.id,
        version: weddingSiteRevisions.version,
        action: weddingSiteRevisions.action,
        contentJson: weddingSiteRevisions.contentJson,
        createdAt: weddingSiteRevisions.createdAt,
        createdBy: weddingSiteRevisions.createdBy,
      })
      .from(weddingSiteRevisions)
      .where(and(eq(weddingSiteRevisions.documentId, documentId), eq(weddingSiteRevisions.id, id)))
      .limit(1);
    return rows[0] === undefined ? null : toRevision(rows[0]);
  }

  return { readDocument, readPublished, commit, listRevisions, readRevision };
}

function parseStoredPage(value: string) {
  return weddingPageDataSchema.parse(JSON.parse(value));
}

function toRevision(row: {
  readonly id: string;
  readonly version: number;
  readonly action: string;
  readonly contentJson: string;
  readonly createdAt: Date;
  readonly createdBy: string;
}): WeddingRevision {
  return {
    id: row.id,
    version: row.version,
    action: row.action as WeddingRevisionAction,
    data: parseStoredPage(row.contentJson),
    createdAt: row.createdAt,
    createdBy: row.createdBy,
  };
}
