import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { getEditorAccess, requireWeddingEditor } from "./auth.server.ts";
import type { EditorAccess } from "./editor-access.ts";
import { getWeddingContentRepository } from "./wedding-content-repository.server.ts";
import { createWeddingContentService, type WeddingEditorState } from "./wedding-content-service.ts";
import { weddingPageDataSchema } from "./wedding-page.ts";

const mutationInput = z.object({
  data: weddingPageDataSchema,
  expectedVersion: z.number().int().nonnegative(),
});

const restoreInput = z.object({
  revisionId: z.string().trim().min(1).max(100),
  expectedVersion: z.number().int().nonnegative(),
});

export type WeddingEditorLoaderData =
  | { readonly access: "authorized"; readonly state: WeddingEditorState }
  | { readonly access: Exclude<EditorAccess, "authorized">; readonly state: null };

export const loadPublishedWeddingPage = createServerFn({ method: "GET" }).handler(async () => {
  const service = createWeddingContentService(await getWeddingContentRepository());
  return service.loadPublished();
});

export const loadWeddingEditor = createServerFn({ method: "POST" }).handler(
  async (): Promise<WeddingEditorLoaderData> => {
    const request = getRequest();
    const access = await getEditorAccess(request);
    if (access !== "authorized") {
      return { access, state: null };
    }

    await requireWeddingEditor(request);
    const service = createWeddingContentService(await getWeddingContentRepository());
    return { access: "authorized", state: await service.loadEditor() };
  },
);

export const saveWeddingDraft = createServerFn({ method: "POST" })
  .inputValidator(mutationInput)
  .handler(async (context) => {
    const actor = await requireWeddingEditor(getRequest());
    const service = createWeddingContentService(await getWeddingContentRepository());
    return service.saveDraft({
      data: context.data.data,
      expectedVersion: context.data.expectedVersion,
      actor,
    });
  });

export const publishWeddingPage = createServerFn({ method: "POST" })
  .inputValidator(mutationInput)
  .handler(async (context) => {
    const actor = await requireWeddingEditor(getRequest());
    const service = createWeddingContentService(await getWeddingContentRepository());
    return service.publish({
      data: context.data.data,
      expectedVersion: context.data.expectedVersion,
      actor,
    });
  });

export const restoreWeddingDraft = createServerFn({ method: "POST" })
  .inputValidator(restoreInput)
  .handler(async (context) => {
    const actor = await requireWeddingEditor(getRequest());
    const service = createWeddingContentService(await getWeddingContentRepository());
    return service.restoreDraft({
      revisionId: context.data.revisionId,
      expectedVersion: context.data.expectedVersion,
      actor,
    });
  });

export const loadEditorDiscovery = createServerFn({ method: "GET" }).handler(async () => {
  return (await getEditorAccess(getRequest())) === "authorized";
});
