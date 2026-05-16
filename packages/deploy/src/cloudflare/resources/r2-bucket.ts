import type { BucketProps } from "alchemy/cloudflare";
import { R2Bucket } from "alchemy/cloudflare";
import { type ResourceNameInput, resourceName } from "../../naming.ts";

export type R2BucketOptions = Omit<BucketProps, "name"> &
  Omit<ResourceNameInput, "resource"> & {
    name?: string;
  };

export async function r2Bucket(id: string, options: R2BucketOptions) {
  const { project, qualifier, name, ...props } = options;

  return await R2Bucket(id, {
    ...props,
    name: name ?? resourceName({ project, qualifier, resource: id }),
  });
}
