import type { Bindings, TanStackStartProps } from "alchemy/cloudflare";
import { TanStackStart } from "alchemy/cloudflare";
import { type ResourceNameInput, resourceName } from "../../naming.ts";

export type TanStackStartAppOptions<B extends Bindings = Bindings> = Omit<
  Partial<TanStackStartProps<B>>,
  "name"
> &
  Omit<ResourceNameInput, "resource"> & {
    name?: string;
  };

export async function tanstackStartApp<const B extends Bindings>(
  id: string,
  options: TanStackStartAppOptions<B>,
) {
  const { project, qualifier, name, ...props } = options;

  return await TanStackStart(id, {
    ...props,
    name: name ?? resourceName({ project, qualifier, resource: id }),
  });
}
