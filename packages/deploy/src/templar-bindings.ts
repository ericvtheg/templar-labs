export type TemplarBindings = Readonly<Record<string, string>>;

export type TemplarBindingName<TBindings extends TemplarBindings> = TBindings[keyof TBindings];

export function defineTemplarBindings<const TBindings extends TemplarBindings>(
  bindings: TBindings,
): TBindings {
  return bindings;
}
