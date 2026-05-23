import type { AppEnvironment } from "@templar/config";

export type AnalyticsPropertyValue =
  | string
  | number
  | boolean
  | null
  | ReadonlyArray<AnalyticsPropertyValue>
  | { readonly [key: string]: AnalyticsPropertyValue };

export type AnalyticsProperties = {
  readonly [key: string]: AnalyticsPropertyValue;
};

/**
 * Map event names to their property shape. Prefer lowercase `object.action`
 * event names such as `project.created`, `deploy.started`, or `user.invited`.
 */
export type AnalyticsEventMap = {
  readonly [event: string]: AnalyticsProperties | undefined;
};

export type TrackEventInput<
  Events extends AnalyticsEventMap,
  EventName extends keyof Events & string,
> = {
  readonly event: EventName;
  readonly userId: string;
} & (Events[EventName] extends undefined
  ? {
      readonly properties?: undefined;
    }
  : {
      readonly properties: Events[EventName];
    });

export type IdentifyUserInput<UserProperties extends AnalyticsProperties> = {
  readonly userId: string;
  readonly properties: Partial<UserProperties>;
};

export type AnalyticsMetadata = {
  readonly app: string;
  readonly projectKey: string;
  readonly environment: AppEnvironment;
};

export type AnalyticsServiceDefaults = AnalyticsMetadata & {
  readonly defaultProperties?: AnalyticsProperties;
};

export type ResolvedTrackEventInput = AnalyticsMetadata & {
  readonly event: string;
  readonly userId: string;
  readonly properties?: AnalyticsProperties;
};

export type ResolvedIdentifyUserInput = AnalyticsMetadata & {
  readonly userId: string;
  readonly properties: AnalyticsProperties;
};
