import type { Bindings, WorkerProps } from "alchemy/cloudflare";
import { Worker } from "alchemy/cloudflare";
import { type ResourceNameInput, resourceName } from "../../naming.ts";

export type CloudflareWorkerOptions<B extends Bindings = Bindings> = Omit<
  WorkerProps<B>,
  "compatibilityFlags" | "name"
> &
  Omit<ResourceNameInput, "resource"> & {
    compatibilityFlags?: string[];
    name?: string;
  };

export async function cloudflareWorker<const B extends Bindings>(
  id: string,
  options: CloudflareWorkerOptions<B>,
) {
  const { project, qualifier, name, compatibilityFlags, ...props } = options;

  const workerProps = {
    ...props,
    compatibilityFlags: compatibilityFlags ?? ["nodejs_compat"],
    name: name ?? resourceName({ project, qualifier, resource: id }),
  } as WorkerProps<B>;

  return await Worker(id, workerProps);
}
