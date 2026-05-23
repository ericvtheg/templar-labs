import { exposeSecret, requiredSecret } from "@templar/config";
import { Config, type ConfigError, type Context, Effect, Layer, type Redacted } from "effect";
import type { AnalyticsDriver } from "../driver.ts";
import { AnalyticsProviderError } from "../errors.ts";
import {
  Analytics,
  type AnalyticsService,
  makeAnalyticsLayer,
  makeAnalyticsLayerFor,
  makeAnalyticsService,
} from "../service.ts";
import type {
  AnalyticsEventMap,
  AnalyticsProperties,
  AnalyticsServiceDefaults,
  ResolvedIdentifyUserInput,
  ResolvedTrackEventInput,
} from "../types.ts";

export type PostHogAnalyticsFetch = typeof fetch;

export type PostHogAnalyticsProviderOptions = {
  readonly host: string;
  readonly projectApiKey: string;
  readonly fetch?: PostHogAnalyticsFetch;
};

export type PostHogAnalyticsProviderConfig = {
  readonly host: string;
  readonly projectApiKey: Redacted.Redacted;
};

export type PostHogAnalyticsAppOptions = AnalyticsServiceDefaults;

export type PostHogAnalyticsOptions = PostHogAnalyticsProviderOptions & PostHogAnalyticsAppOptions;

export type PostHogAnalyticsProvider = {
  readonly makeAnalytics: <
    Events extends AnalyticsEventMap,
    UserProperties extends AnalyticsProperties,
  >(
    options: PostHogAnalyticsAppOptions,
  ) => AnalyticsService<Events, UserProperties>;
  readonly makeLayer: (options: PostHogAnalyticsAppOptions) => Layer.Layer<Analytics>;
  readonly makeLayerFor: <
    Id,
    Events extends AnalyticsEventMap,
    UserProperties extends AnalyticsProperties,
  >(
    tag: Context.Tag<Id, AnalyticsService<Events, UserProperties>>,
    options: PostHogAnalyticsAppOptions,
  ) => Layer.Layer<Id>;
};

type PostHogCaptureBody = {
  readonly api_key: string;
  readonly event: string;
  readonly distinct_id: string;
  readonly properties?: AnalyticsProperties | PostHogIdentifyProperties;
};

type PostHogIdentifyProperties = AnalyticsProperties & {
  readonly $set: AnalyticsProperties;
};

type PostHogErrorResponse = {
  readonly detail?: string;
  readonly error?: string;
  readonly message?: string;
};

export const postHogAnalyticsProviderConfig: Config.Config<PostHogAnalyticsProviderConfig> =
  Config.all({
    host: Config.string("POSTHOG_HOST"),
    projectApiKey: requiredSecret("POSTHOG_PROJECT_API_KEY"),
  });

export const postHogAnalyticsProviderEffect: Effect.Effect<
  PostHogAnalyticsProvider,
  ConfigError.ConfigError
> = Effect.map(postHogAnalyticsProviderConfig, makePostHogAnalyticsProviderFromConfig);

export function makePostHogAnalyticsProviderFromConfig(
  config: PostHogAnalyticsProviderConfig,
  options: {
    readonly fetch?: PostHogAnalyticsFetch;
  } = {},
): PostHogAnalyticsProvider {
  return makePostHogAnalyticsProvider({
    host: config.host,
    projectApiKey: exposeSecret(config.projectApiKey),
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
  });
}

export function makePostHogAnalyticsProvider(
  options: PostHogAnalyticsProviderOptions,
): PostHogAnalyticsProvider {
  const driver = createPostHogAnalyticsDriver(options);

  return {
    makeAnalytics: <Events extends AnalyticsEventMap, UserProperties extends AnalyticsProperties>(
      appOptions: PostHogAnalyticsAppOptions,
    ) =>
      makeAnalyticsService<Events, UserProperties>({
        driver,
        defaults: appOptions,
      }),
    makeLayer: (appOptions: PostHogAnalyticsAppOptions) =>
      makeAnalyticsLayer(
        makeAnalyticsService<AnalyticsEventMap, AnalyticsProperties>({
          driver,
          defaults: appOptions,
        }),
      ),
    makeLayerFor: <
      Id,
      Events extends AnalyticsEventMap,
      UserProperties extends AnalyticsProperties,
    >(
      tag: Context.Tag<Id, AnalyticsService<Events, UserProperties>>,
      appOptions: PostHogAnalyticsAppOptions,
    ) =>
      makeAnalyticsLayerFor(
        tag,
        makeAnalyticsService<Events, UserProperties>({
          driver,
          defaults: appOptions,
        }),
      ),
  };
}

export function makePostHogAnalytics<
  Events extends AnalyticsEventMap,
  UserProperties extends AnalyticsProperties,
>(options: PostHogAnalyticsOptions): AnalyticsService<Events, UserProperties> {
  const { host, projectApiKey, fetch: fetchImpl, ...appOptions } = options;

  return makePostHogAnalyticsProvider({
    host,
    projectApiKey,
    ...(fetchImpl === undefined ? {} : { fetch: fetchImpl }),
  }).makeAnalytics<Events, UserProperties>(appOptions);
}

export const makeAnalytics = makePostHogAnalytics;
export const makeAnalyticsProvider = makePostHogAnalyticsProvider;

export function postHogAnalyticsLayer<
  Events extends AnalyticsEventMap,
  UserProperties extends AnalyticsProperties,
>(options: PostHogAnalyticsOptions) {
  return makeAnalyticsLayer(makePostHogAnalytics<Events, UserProperties>(options));
}

export const analyticsLayer = postHogAnalyticsLayer;

export function postHogAnalyticsLayerFor<
  Id,
  Events extends AnalyticsEventMap,
  UserProperties extends AnalyticsProperties,
>(
  tag: Context.Tag<Id, AnalyticsService<Events, UserProperties>>,
  options: PostHogAnalyticsOptions,
): Layer.Layer<Id> {
  return makeAnalyticsLayerFor(tag, makePostHogAnalytics<Events, UserProperties>(options));
}

export function postHogAnalyticsLayerFromConfig(
  options: PostHogAnalyticsAppOptions,
): Layer.Layer<Analytics, ConfigError.ConfigError> {
  return Layer.effect(
    Analytics,
    Effect.map(postHogAnalyticsProviderEffect, (provider) => provider.makeAnalytics(options)),
  );
}

export const analyticsLayerFromConfig = postHogAnalyticsLayerFromConfig;

export function postHogAnalyticsLayerFromConfigFor<
  Id,
  Events extends AnalyticsEventMap,
  UserProperties extends AnalyticsProperties,
>(
  tag: Context.Tag<Id, AnalyticsService<Events, UserProperties>>,
  options: PostHogAnalyticsAppOptions,
): Layer.Layer<Id, ConfigError.ConfigError> {
  return Layer.effect(
    tag,
    Effect.map(postHogAnalyticsProviderEffect, (provider) =>
      provider.makeAnalytics<Events, UserProperties>(options),
    ),
  );
}

function createPostHogAnalyticsDriver(config: PostHogAnalyticsProviderOptions): AnalyticsDriver {
  return {
    provider: "posthog",
    track: (input) =>
      sendPostHogEvent({
        config,
        operation: "track",
        body: trackBody(config.projectApiKey, input),
      }),
    identify: (input) =>
      sendPostHogEvent({
        config,
        operation: "identify",
        body: identifyBody(config.projectApiKey, input),
      }),
  };
}

function sendPostHogEvent(input: {
  readonly config: PostHogAnalyticsProviderOptions;
  readonly operation: "track" | "identify";
  readonly body: PostHogCaptureBody;
}): Effect.Effect<void, AnalyticsProviderError> {
  return Effect.tryPromise({
    try: async (signal) => {
      const fetchImpl = input.config.fetch ?? fetch;
      const response = await fetchImpl(postHogCaptureUrl(input.config.host), {
        method: "POST",
        signal,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(input.body),
      });

      if (!response.ok) {
        throw await postHogHttpError(input.operation, response);
      }
    },
    catch: (cause) =>
      cause instanceof AnalyticsProviderError
        ? cause
        : new AnalyticsProviderError({
            provider: "posthog",
            operation: input.operation,
            message: "PostHog analytics request failed.",
            cause,
          }),
  });
}

function trackBody(apiKey: string, input: ResolvedTrackEventInput): PostHogCaptureBody {
  return {
    api_key: apiKey,
    event: input.event,
    distinct_id: input.userId,
    ...(input.properties === undefined ? {} : { properties: input.properties }),
  };
}

function identifyBody(apiKey: string, input: ResolvedIdentifyUserInput): PostHogCaptureBody {
  return {
    api_key: apiKey,
    event: "$identify",
    distinct_id: input.userId,
    properties: {
      ...input.properties,
      $set: input.properties,
    },
  };
}

function postHogCaptureUrl(host: string): string {
  return `${host.replace(/\/+$/, "")}/capture/`;
}

async function postHogHttpError(
  operation: "track" | "identify",
  response: Response,
): Promise<AnalyticsProviderError> {
  const body = await readPostHogErrorBody(response);

  return new AnalyticsProviderError({
    provider: "posthog",
    operation,
    status: response.status,
    message:
      body.detail ?? body.error ?? body.message ?? `PostHog returned HTTP ${response.status}.`,
    cause: body,
  });
}

async function readPostHogErrorBody(response: Response): Promise<PostHogErrorResponse> {
  try {
    return (await response.json()) as PostHogErrorResponse;
  } catch (cause) {
    return {
      message: cause instanceof Error ? cause.message : "Failed to parse PostHog error body.",
    };
  }
}
