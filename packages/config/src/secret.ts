import { Config, type Option, Redacted } from "effect";

export function requiredSecret(name: string): Config.Config<Redacted.Redacted> {
  return Config.redacted(name);
}

export function optionalSecret(name: string): Config.Config<Option.Option<Redacted.Redacted>> {
  return Config.option(requiredSecret(name));
}

export function exposeSecret(secret: Redacted.Redacted): string {
  return Redacted.value(secret);
}
