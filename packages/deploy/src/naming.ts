export type ResourceNameInput = {
  project: string;
  resource: string;
  qualifier?: string | undefined;
};

export function resourceName(input: ResourceNameInput): string {
  return [input.project, input.qualifier, input.resource].filter(Boolean).join("-");
}
