import type { QueueProps } from "alchemy/cloudflare";
import { Queue } from "alchemy/cloudflare";
import { type ResourceNameInput, resourceName } from "../../naming.ts";

export type QueueOptions = Omit<QueueProps, "name"> &
  Omit<ResourceNameInput, "resource"> & {
    name?: string;
  };

export async function queue(id: string, options: QueueOptions) {
  const { project, qualifier, name, ...props } = options;

  return await Queue<string>(id, {
    ...props,
    name: name ?? resourceName({ project, qualifier, resource: id }),
  });
}
