import alchemy from "alchemy";
import type {
  Bindings,
  Queue,
  QueueConsumerSettings,
  TanStackStartProps,
} from "alchemy/cloudflare";
import { defaultTemplarBindings, type StandardTemplarBindings } from "../../templar-bindings.ts";
import { type TanStackStartAppOptions, tanstackStartApp } from "./tanstack-start-app.ts";

export type TemplarAppQueueInput = {
  readonly binding: Queue;
  readonly consumer?: boolean | QueueConsumerSettings;
};

type EventSource = NonNullable<TanStackStartProps<Bindings>["eventSources"]>[number];

export type TemplarAppOptions<B extends StandardTemplarBindings = typeof defaultTemplarBindings> =
  Omit<TanStackStartAppOptions, "bindings" | "eventSources"> & {
    readonly bindings?: Bindings;
    readonly blob?: Bindings[string];
    readonly cache?: Bindings[string];
    readonly db?: Bindings[string];
    readonly domainName?: string;
    readonly eventSources?: EventSource[];
    readonly queue?: Queue | TemplarAppQueueInput;
    readonly templarBindings?: B;
  };

const defaultQueueSettings = {
  batchSize: 10,
  maxConcurrency: 2,
  maxRetries: 3,
  retryDelay: 30,
} as const satisfies QueueConsumerSettings;

export async function templarApp<
  const B extends StandardTemplarBindings = typeof defaultTemplarBindings,
>(id: string, options: TemplarAppOptions<B>) {
  const {
    bindings,
    blob,
    cache,
    db,
    domainName,
    eventSources,
    queue,
    templarBindings = defaultTemplarBindings as unknown as B,
    ...appOptions
  } = options;
  const queueInput = normalizeQueueInput(queue);
  const consumerEventSource = queueConsumerEventSource(queueInput);

  return await tanstackStartApp(id, {
    ...appOptions,
    ...(domainName === undefined
      ? {}
      : {
          domains: [
            {
              domainName,
              adopt: true,
            },
          ],
        }),
    bindings: {
      ...bindings,
      [templarBindings.authBaseUrl]: domainName === undefined ? "" : `https://${domainName}`,
      [templarBindings.authSecret]: alchemy.secret.env("TEMPLAR_AUTH_SECRET"),
      [templarBindings.openRouterApiToken]: alchemy.secret.env("OPENROUTER_API_TOKEN"),
      ...(db === undefined ? {} : { [templarBindings.db]: db }),
      ...(blob === undefined ? {} : { [templarBindings.r2]: blob }),
      ...(cache === undefined ? {} : { [templarBindings.cache]: cache }),
      ...(queueInput === undefined ? {} : { [templarBindings.jobsQueue]: queueInput.binding }),
    },
    eventSources: [
      ...(eventSources ?? []),
      ...(consumerEventSource === undefined ? [] : [consumerEventSource]),
    ],
  });
}

function normalizeQueueInput(
  queue: TemplarAppOptions["queue"] | undefined,
): TemplarAppQueueInput | undefined {
  if (queue === undefined) {
    return undefined;
  }

  if (typeof queue === "object" && queue !== null && "binding" in queue) {
    return {
      binding: queue.binding,
      consumer: queue.consumer ?? true,
    };
  }

  return {
    binding: queue,
    consumer: true,
  };
}

function queueConsumerEventSource(
  queueInput: TemplarAppQueueInput | undefined,
): EventSource | undefined {
  if (queueInput === undefined || queueInput.consumer === false) {
    return undefined;
  }

  return {
    queue: queueInput.binding,
    settings:
      queueInput.consumer === true
        ? defaultQueueSettings
        : (queueInput.consumer ?? defaultQueueSettings),
  };
}
