import { Queue } from "alchemy/cloudflare";
import { type ResourceNameInput, resourceName } from "../../naming.ts";

export type QueueOptions = Omit<ResourceNameInput, "resource"> & {
  name?: string;
};

export async function queue(id: string, options: QueueOptions) {
  const { project, qualifier, name } = options;

  return await Queue(id, {
    name: name ?? resourceName({ project, qualifier, resource: id }),
  });
}
