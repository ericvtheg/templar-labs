import {
  type AnalyticsEventMap,
  type AnalyticsProperties,
  makeAnalytics,
} from "@templar/analytics";
import { AppEnvironment } from "@templar/config";
import { Effect } from "effect";

export type CardiffSplitMethod = "equal" | "exact" | "percentage";

/**
 * Privacy-safe Cardiff Split analytics events. No participant names, trip
 * names, expense titles, amounts, or private trip tokens are ever sent.
 */
export type CardiffAnalyticsEvents = AnalyticsEventMap & {
  readonly trip_created: { readonly tripId: string; readonly participantCount: number };
  readonly participant_added: { readonly tripId: string; readonly participantCount: number };
  readonly expense_added: {
    readonly tripId: string;
    readonly splitMethod: CardiffSplitMethod;
    readonly participantCount: number;
  };
  readonly expense_edited: {
    readonly tripId: string;
    readonly splitMethod: CardiffSplitMethod;
    readonly participantCount: number;
  };
  readonly expense_deleted: { readonly tripId: string };
  readonly settle_up_viewed: { readonly tripId: string; readonly openRecommendations: number };
  readonly settlement_marked_paid: { readonly tripId: string };
  readonly share_link_opened: { readonly tripId: string };
};

export type CardiffAnalyticsEventName = keyof CardiffAnalyticsEvents;

export type CardiffTrackInput<Name extends CardiffAnalyticsEventName> = {
  readonly event: Name;
  readonly actorId: string;
} & (CardiffAnalyticsEvents[Name] extends undefined
  ? { readonly properties?: undefined }
  : { readonly properties: CardiffAnalyticsEvents[Name] });

type CardiffAnalyticsService = ReturnType<
  typeof makeAnalytics<CardiffAnalyticsEvents, AnalyticsProperties>
>;

const cardiffApp = "cardiff-split";
const cardiffProjectKey = "cardiff-split";

type CardiffAnalyticsEnv = {
  readonly POSTHOG_HOST?: string | undefined;
  readonly POSTHOG_PROJECT_API_KEY?: string | undefined;
};

let servicePromise: Promise<CardiffAnalyticsService | null> | null = null;

/**
 * Track a privacy-safe Cardiff Split product event. Fire-and-forget: analytics
 * never blocks core app flows and provider errors are swallowed by the service.
 * No-ops when PostHog is not configured (local dev) or the actor id is empty.
 */
export function trackCardiffEvent<Name extends CardiffAnalyticsEventName>(
  input: CardiffTrackInput<Name>,
): void {
  if (input.actorId.trim().length === 0) {
    return;
  }

  void getCardiffAnalyticsService().then((service) => {
    if (service === null) {
      return;
    }

    const effect = service.track({
      event: input.event,
      userId: input.actorId,
      ...(input.properties === undefined ? {} : { properties: input.properties }),
    } as Parameters<CardiffAnalyticsService["track"]>[0]);

    return Effect.runFork(effect);
  });
}

function getCardiffAnalyticsService(): Promise<CardiffAnalyticsService | null> {
  if (servicePromise === null) {
    servicePromise = loadCardiffAnalyticsService();
  }

  return servicePromise;
}

async function loadCardiffAnalyticsService(): Promise<CardiffAnalyticsService | null> {
  const env = await readCardiffAnalyticsEnv();
  const host = env.POSTHOG_HOST ?? "";
  const projectApiKey = env.POSTHOG_PROJECT_API_KEY ?? "";

  if (host.length === 0 || projectApiKey.length === 0) {
    return null;
  }

  return makeAnalytics<CardiffAnalyticsEvents, AnalyticsProperties>({
    host,
    projectApiKey,
    app: cardiffApp,
    projectKey: cardiffProjectKey,
    environment: AppEnvironment.Prod,
  });
}

async function readCardiffAnalyticsEnv(): Promise<CardiffAnalyticsEnv> {
  try {
    const { env } = await import("cloudflare:workers");
    const workerEnv = env as {
      readonly POSTHOG_HOST?: string | undefined;
      readonly POSTHOG_PROJECT_API_KEY?: string | undefined;
    };

    return {
      POSTHOG_HOST: typeof workerEnv.POSTHOG_HOST === "string" ? workerEnv.POSTHOG_HOST : undefined,
      POSTHOG_PROJECT_API_KEY:
        typeof workerEnv.POSTHOG_PROJECT_API_KEY === "string"
          ? workerEnv.POSTHOG_PROJECT_API_KEY
          : undefined,
    };
  } catch {
    return {};
  }
}

export type CardiffTrackAnalyticsEventInput = {
  readonly actorId: string;
  readonly event: "settle_up_viewed" | "share_link_opened";
  readonly tripId: string;
  readonly openRecommendations?: number;
};

export function trackCardiffClientEvent(input: CardiffTrackAnalyticsEventInput): void {
  if (input.event === "settle_up_viewed") {
    trackCardiffEvent({
      event: "settle_up_viewed",
      actorId: input.actorId,
      properties: {
        tripId: input.tripId,
        openRecommendations: input.openRecommendations ?? 0,
      },
    });
    return;
  }

  trackCardiffEvent({
    event: "share_link_opened",
    actorId: input.actorId,
    properties: { tripId: input.tripId },
  });
}
