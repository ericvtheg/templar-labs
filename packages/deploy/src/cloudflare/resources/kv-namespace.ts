import type { KVNamespaceProps } from "alchemy/cloudflare";
import { KVNamespace } from "alchemy/cloudflare";
import { type ResourceNameInput, resourceName } from "../../naming.ts";

export type KvNamespaceOptions = Omit<KVNamespaceProps, "title"> &
  Omit<ResourceNameInput, "resource"> & {
    title?: string;
  };

export async function kvNamespace(id: string, options: KvNamespaceOptions) {
  const { project, qualifier, title, ...props } = options;

  return await KVNamespace(id, {
    ...props,
    title: title ?? resourceName({ project, qualifier, resource: id }),
  });
}
