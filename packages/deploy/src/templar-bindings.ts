export type TemplarBindings = Readonly<Record<string, string>>;

export type StandardTemplarBindings = TemplarBindings & {
  readonly authBaseUrl: string;
  readonly authSecret: string;
  readonly cache: string;
  readonly db: string;
  readonly jobsQueue: string;
  readonly openRouterApiToken: string;
  readonly r2: string;
};

export const defaultTemplarBindings: StandardTemplarBindings = defineTemplarBindings({
  authBaseUrl: "AUTH_BASE_URL",
  authSecret: "AUTH_SECRET",
  cache: "CACHE",
  db: "DB",
  jobsQueue: "JOBS",
  openRouterApiToken: "OPENROUTER_API_TOKEN",
  r2: "R2",
});

export type TemplarBindingName<TBindings extends TemplarBindings> = TBindings[keyof TBindings];

export function defineTemplarBindings<const TBindings extends TemplarBindings>(
  bindings: TBindings,
): TBindings {
  return bindings;
}
