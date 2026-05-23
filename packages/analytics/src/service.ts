import { AppEnvironment } from "@templar/config";
import { Context, Effect, Layer } from "effect";
import type { AnalyticsDriver } from "./driver.ts";
import { AnalyticsValidationError } from "./errors.ts";
import { withAnalyticsLogging } from "./logging.ts";
import type {
  AnalyticsEventMap,
  AnalyticsProperties,
  AnalyticsPropertyValue,
  AnalyticsServiceDefaults,
  IdentifyUserInput,
  ResolvedIdentifyUserInput,
  ResolvedTrackEventInput,
  TrackEventInput,
} from "./types.ts";

export type AnalyticsService<
  Events extends AnalyticsEventMap,
  UserProperties extends AnalyticsProperties,
> = {
  readonly track: <EventName extends keyof Events & string>(
    input: TrackEventInput<Events, EventName>,
  ) => Effect.Effect<void>;
  readonly identify: (input: IdentifyUserInput<UserProperties>) => Effect.Effect<void>;
};

export const AnalyticsTagIdentifier: unique symbol = Symbol(
  "@templar/analytics/AnalyticsTagIdentifier",
);

export type AnalyticsTagId<
  Events extends AnalyticsEventMap,
  UserProperties extends AnalyticsProperties,
> = {
  readonly [AnalyticsTagIdentifier]: {
    readonly events: Events;
    readonly userProperties: UserProperties;
  };
};

export type AnalyticsTag<
  Events extends AnalyticsEventMap,
  UserProperties extends AnalyticsProperties,
> = Context.Tag<
  AnalyticsTagId<Events, UserProperties>,
  AnalyticsService<Events, UserProperties>
> & {
  readonly track: <EventName extends keyof Events & string>(
    input: TrackEventInput<Events, EventName>,
  ) => Effect.Effect<void, never, AnalyticsTagId<Events, UserProperties>>;
  readonly identify: (
    input: IdentifyUserInput<UserProperties>,
  ) => Effect.Effect<void, never, AnalyticsTagId<Events, UserProperties>>;
};

export function makeAnalyticsTag<
  Events extends AnalyticsEventMap,
  UserProperties extends AnalyticsProperties,
>(identifier = "@templar/analytics/Analytics"): AnalyticsTag<Events, UserProperties> {
  const tag = Context.GenericTag<
    AnalyticsTagId<Events, UserProperties>,
    AnalyticsService<Events, UserProperties>
  >(identifier);

  return Object.assign(tag, {
    track: Effect.serviceFunctionEffect(tag, (analytics) => analytics.track),
    identify: Effect.serviceFunctionEffect(tag, (analytics) => analytics.identify),
  });
}

export class Analytics extends Context.Tag("@templar/analytics/Analytics")<
  Analytics,
  AnalyticsService<AnalyticsEventMap, AnalyticsProperties>
>() {
  static readonly track = Effect.serviceFunctionEffect(this, (analytics) => analytics.track);
  static readonly identify = Effect.serviceFunctionEffect(this, (analytics) => analytics.identify);
}

export function makeAnalyticsLayer<
  Events extends AnalyticsEventMap,
  UserProperties extends AnalyticsProperties,
>(service: AnalyticsService<Events, UserProperties>): Layer.Layer<Analytics> {
  return Layer.succeed(
    Analytics,
    service as AnalyticsService<AnalyticsEventMap, AnalyticsProperties>,
  );
}

export function makeAnalyticsLayerFor<
  Id,
  Events extends AnalyticsEventMap,
  UserProperties extends AnalyticsProperties,
>(
  tag: Context.Tag<Id, AnalyticsService<Events, UserProperties>>,
  service: AnalyticsService<Events, UserProperties>,
): Layer.Layer<Id> {
  return Layer.succeed(tag, service);
}

export function makeAnalyticsService<
  Events extends AnalyticsEventMap,
  UserProperties extends AnalyticsProperties,
>(input: {
  readonly driver: AnalyticsDriver;
  readonly defaults: AnalyticsServiceDefaults;
}): AnalyticsService<Events, UserProperties> {
  const service: AnalyticsService<Events, UserProperties> =
    input.defaults.environment === AppEnvironment.Prod
      ? {
          track: makeTrack<Events>(input.driver, input.defaults),
          identify: makeIdentify<UserProperties>(input.driver, input.defaults),
        }
      : {
          track: () => Effect.void,
          identify: () => Effect.void,
        };

  return service;
}

function makeTrack<Events extends AnalyticsEventMap>(
  driver: AnalyticsDriver,
  defaults: AnalyticsServiceDefaults,
): AnalyticsService<Events, AnalyticsProperties>["track"] {
  return <EventName extends keyof Events & string>(input: TrackEventInput<Events, EventName>) =>
    resolveTrackInput(input, defaults).pipe(
      Effect.flatMap(driver.track),
      withAnalyticsOperationLogging(driver.provider, "track", defaults),
      Effect.catchAll(() => Effect.void),
    );
}

function makeIdentify<UserProperties extends AnalyticsProperties>(
  driver: AnalyticsDriver,
  defaults: AnalyticsServiceDefaults,
): AnalyticsService<AnalyticsEventMap, UserProperties>["identify"] {
  return (input: IdentifyUserInput<UserProperties>) =>
    resolveIdentifyInput(input, defaults).pipe(
      Effect.flatMap(driver.identify),
      withAnalyticsOperationLogging(driver.provider, "identify", defaults),
      Effect.catchAll(() => Effect.void),
    );
}

function resolveTrackInput<
  Events extends AnalyticsEventMap,
  EventName extends keyof Events & string,
>(
  input: TrackEventInput<Events, EventName>,
  defaults: AnalyticsServiceDefaults,
): Effect.Effect<ResolvedTrackEventInput, AnalyticsValidationError> {
  return Effect.flatMap(validateTrackInput(input), () =>
    Effect.flatMap(validateMetadata("track", defaults), () => {
      const properties = mergeProperties(
        defaults,
        input.properties as AnalyticsProperties | undefined,
      );

      return Effect.as(validateProperties("track", properties), {
        event: input.event,
        userId: input.userId,
        app: defaults.app,
        projectKey: defaults.projectKey,
        environment: defaults.environment,
        properties,
      });
    }),
  );
}

function resolveIdentifyInput<UserProperties extends AnalyticsProperties>(
  input: IdentifyUserInput<UserProperties>,
  defaults: AnalyticsServiceDefaults,
): Effect.Effect<ResolvedIdentifyUserInput, AnalyticsValidationError> {
  return Effect.flatMap(validateIdentifyInput(input), () =>
    Effect.flatMap(validateMetadata("identify", defaults), () => {
      const properties = mergeProperties(defaults, input.properties as AnalyticsProperties);

      return Effect.as(validateProperties("identify", properties), {
        userId: input.userId,
        app: defaults.app,
        projectKey: defaults.projectKey,
        environment: defaults.environment,
        properties,
      });
    }),
  );
}

function mergeProperties(
  defaults: AnalyticsServiceDefaults,
  properties: AnalyticsProperties | undefined,
): AnalyticsProperties {
  return {
    ...defaults.defaultProperties,
    ...properties,
    app: defaults.app,
    projectKey: defaults.projectKey,
    environment: defaults.environment,
  };
}

function validateTrackInput<
  Events extends AnalyticsEventMap,
  EventName extends keyof Events & string,
>(input: TrackEventInput<Events, EventName>): Effect.Effect<void, AnalyticsValidationError> {
  if (input.event.trim().length === 0) {
    return validationFailure("track", "event", "Analytics event is required.");
  }

  if (input.userId.trim().length === 0) {
    return validationFailure("track", "userId", "Analytics userId is required.");
  }

  return validateProperties("track", input.properties);
}

function validateIdentifyInput<UserProperties extends AnalyticsProperties>(
  input: IdentifyUserInput<UserProperties>,
): Effect.Effect<void, AnalyticsValidationError> {
  if (input.userId.trim().length === 0) {
    return validationFailure("identify", "userId", "Analytics userId is required.");
  }

  return validateProperties("identify", input.properties as Record<string, unknown>);
}

function validateProperties(
  operation: "track" | "identify",
  properties: Readonly<Record<string, unknown>> | undefined,
): Effect.Effect<void, AnalyticsValidationError> {
  if (properties === undefined) {
    return Effect.void;
  }

  const invalidPath = firstInvalidJsonValuePath(properties);

  return invalidPath === undefined
    ? Effect.void
    : validationFailure(operation, invalidPath, "Analytics properties must be JSON-safe values.");
}

function validateMetadata(
  operation: "track" | "identify",
  defaults: AnalyticsServiceDefaults,
): Effect.Effect<void, AnalyticsValidationError> {
  if (defaults.app.trim().length === 0) {
    return validationFailure(operation, "app", "Analytics app metadata is required.");
  }

  if (defaults.projectKey.trim().length === 0) {
    return validationFailure(operation, "projectKey", "Analytics projectKey metadata is required.");
  }

  return Effect.void;
}

function firstInvalidJsonValuePath(value: unknown, path = "properties"): string | undefined {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return undefined;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? undefined : path;
  }

  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      const invalidPath = firstInvalidJsonValuePath(item, `${path}.${index}`);

      if (invalidPath !== undefined) {
        return invalidPath;
      }
    }

    return undefined;
  }

  if (typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (item === undefined) {
        return `${path}.${key}`;
      }

      const invalidPath = firstInvalidJsonValuePath(item, `${path}.${key}`);

      if (invalidPath !== undefined) {
        return invalidPath;
      }
    }

    return undefined;
  }

  return path;
}

function validationFailure(
  operation: "track" | "identify",
  field: string,
  message: string,
): Effect.Effect<never, AnalyticsValidationError> {
  return Effect.fail(
    new AnalyticsValidationError({
      operation,
      field,
      message,
    }),
  );
}

function withAnalyticsOperationLogging(
  provider: string,
  operation: "track" | "identify",
  defaults: AnalyticsServiceDefaults,
): <A, E, R>(self: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R> {
  return withAnalyticsLogging({
    provider,
    operation,
    app: defaults.app,
    projectKey: defaults.projectKey,
    environment: defaults.environment,
  });
}

export function isJsonSafeAnalyticsValue(value: unknown): value is AnalyticsPropertyValue {
  return firstInvalidJsonValuePath(value) === undefined;
}
