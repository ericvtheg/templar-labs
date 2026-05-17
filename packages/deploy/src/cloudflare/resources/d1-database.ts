import type { D1DatabaseProps } from "alchemy/cloudflare";
import { D1Database } from "alchemy/cloudflare";
import { type ResourceNameInput, resourceName } from "../../naming.ts";

export type D1DatabaseOptions = Omit<D1DatabaseProps, "name"> &
  Omit<ResourceNameInput, "resource"> & {
    name?: string;
  };

export async function d1Database(id: string, options: D1DatabaseOptions) {
  const { project, qualifier, name, ...props } = options;

  return await D1Database(id, {
    ...props,
    name: name ?? resourceName({ project, qualifier, resource: id }),
  });
}
