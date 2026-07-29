import alchemy, { Scope, type Secret } from "alchemy";
import type {
  Binding,
  Bindings,
  Queue,
  QueueConsumerSettings,
  TanStackStartProps,
} from "alchemy/cloudflare";
import { defaultTemplarBindings } from "../../templar-bindings.ts";
import {
  assertNoTemplarBindingCollisions,
  createTemplarPlatformBindings,
  type TemplarPlatformBindingSpecs,
} from "../platform-bindings.ts";
import { type TanStackStartAppOptions, tanstackStartApp } from "./tanstack-start-app.ts";

export type TemplarAppQueueInput = {
  readonly binding: Queue<string>;
  readonly settings?: QueueConsumerSettings;
};

type EventSource = NonNullable<TanStackStartProps<Bindings>["eventSources"]>[number];

export type TemplarAppServices = {
  readonly ai?: boolean;
  readonly auth?: boolean;
};

export type TemplarAppOptions<
  AppBindings extends Bindings = Bindings,
  BlobBinding extends Binding | undefined = Binding | undefined,
  CacheBinding extends Binding | undefined = Binding | undefined,
  DbBinding extends Binding | undefined = Binding | undefined,
  QueueBinding extends Queue<string> | TemplarAppQueueInput | undefined =
    | Queue<string>
    | TemplarAppQueueInput
    | undefined,
  Services extends TemplarAppServices | undefined = TemplarAppServices | undefined,
> = Omit<TanStackStartAppOptions, "bindings" | "eventSources" | "project"> & {
  readonly bindings?: AppBindings;
  readonly blob?: BlobBinding;
  readonly cache?: CacheBinding;
  readonly db?: DbBinding;
  readonly domainName?: string;
  readonly eventSources?: EventSource[];
  readonly queue?: QueueBinding;
  readonly services?: Services;
};

type NamedBinding<Name extends string, Value extends Binding> = {
  readonly [BindingName in Name]: Value;
};

type ServiceBindings<Services extends TemplarAppServices | undefined> = (Services extends {
  readonly auth: true;
}
  ? NamedBinding<typeof defaultTemplarBindings.authSecret, Secret>
  : object) &
  (Services extends { readonly ai: true }
    ? NamedBinding<typeof defaultTemplarBindings.openRouterApiToken, Secret>
    : object);

type ResourceBinding<Name extends string, Value extends Binding | undefined> = [Value] extends [
  Binding,
]
  ? NamedBinding<Name, Extract<Value, Binding>>
  : object;

type QueueResourceBinding<Value extends Queue<string> | TemplarAppQueueInput | undefined> =
  Value extends TemplarAppQueueInput
    ? Value["binding"]
    : Value extends Queue<string>
      ? Value
      : undefined;

type TemplarAppBindings<
  AppBindings extends Bindings,
  BlobBinding extends Binding | undefined,
  CacheBinding extends Binding | undefined,
  DbBinding extends Binding | undefined,
  QueueBinding extends Queue<string> | TemplarAppQueueInput | undefined,
  Services extends TemplarAppServices | undefined,
> = AppBindings &
  TemplarPlatformBindingSpecs &
  ServiceBindings<Services> &
  ResourceBinding<typeof defaultTemplarBindings.db, DbBinding> &
  ResourceBinding<typeof defaultTemplarBindings.r2, BlobBinding> &
  ResourceBinding<typeof defaultTemplarBindings.cache, CacheBinding> &
  ResourceBinding<typeof defaultTemplarBindings.jobsQueue, QueueResourceBinding<QueueBinding>>;

const DEFAULT_QUEUE_SETTINGS = {
  batchSize: 1,
  maxConcurrency: 2,
  maxRetries: 0,
} as const satisfies QueueConsumerSettings;

export async function templarApp<
  const AppBindings extends Bindings = Record<never, never>,
  const BlobBinding extends Binding | undefined = undefined,
  const CacheBinding extends Binding | undefined = undefined,
  const DbBinding extends Binding | undefined = undefined,
  const QueueBinding extends Queue<string> | TemplarAppQueueInput | undefined = undefined,
  const Services extends TemplarAppServices | undefined = undefined,
>(
  id: string,
  options: TemplarAppOptions<
    AppBindings,
    BlobBinding,
    CacheBinding,
    DbBinding,
    QueueBinding,
    Services
  >,
) {
  const { bindings, blob, cache, db, domainName, eventSources, queue, services, ...appOptions } =
    options;
  const scope = Scope.current;
  const queueInput = normalizeQueueInput(queue);
  const consumerEventSource = queueConsumerEventSource(queueInput);
  const platformBindings = createTemplarPlatformBindings({
    appId: scope.appName,
    local: scope.local,
  });
  const reservedBindingNames = [
    ...(services?.auth === true ? [defaultTemplarBindings.authSecret] : []),
    ...(services?.ai === true ? [defaultTemplarBindings.openRouterApiToken] : []),
    ...(db === undefined ? [] : [defaultTemplarBindings.db]),
    ...(blob === undefined ? [] : [defaultTemplarBindings.r2]),
    ...(cache === undefined ? [] : [defaultTemplarBindings.cache]),
    ...(queueInput === undefined ? [] : [defaultTemplarBindings.jobsQueue]),
  ];
  assertNoTemplarBindingCollisions(bindings, reservedBindingNames);
  type WorkerBindings = TemplarAppBindings<
    AppBindings,
    BlobBinding,
    CacheBinding,
    DbBinding,
    QueueBinding,
    Services
  >;

  return await tanstackStartApp<WorkerBindings>(id, {
    ...appOptions,
    project: scope.appName,
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
      ...platformBindings,
      ...(services?.auth === true
        ? {
            [defaultTemplarBindings.authSecret]: alchemy.secret.env("TEMPLAR_AUTH_SECRET"),
          }
        : {}),
      ...(services?.ai === true
        ? {
            [defaultTemplarBindings.openRouterApiToken]: alchemy.secret.env("OPENROUTER_API_TOKEN"),
          }
        : {}),
      ...(db === undefined ? {} : { [defaultTemplarBindings.db]: db }),
      ...(blob === undefined ? {} : { [defaultTemplarBindings.r2]: blob }),
      ...(cache === undefined ? {} : { [defaultTemplarBindings.cache]: cache }),
      ...(queueInput === undefined
        ? {}
        : { [defaultTemplarBindings.jobsQueue]: queueInput.binding }),
    } as WorkerBindings,
    eventSources: [
      ...(eventSources ?? []),
      ...(consumerEventSource === undefined ? [] : [consumerEventSource]),
    ],
  });
}

function normalizeQueueInput(
  queue: Queue<string> | TemplarAppQueueInput | undefined,
): TemplarAppQueueInput | undefined {
  if (queue === undefined) {
    return undefined;
  }

  if (typeof queue === "object" && queue !== null && "binding" in queue) {
    return queue;
  }

  return {
    binding: queue,
  };
}

function queueConsumerEventSource(
  queueInput: TemplarAppQueueInput | undefined,
): EventSource | undefined {
  if (queueInput === undefined) {
    return undefined;
  }

  return {
    queue: queueInput.binding,
    settings: {
      ...DEFAULT_QUEUE_SETTINGS,
      ...queueInput.settings,
    },
  };
}
