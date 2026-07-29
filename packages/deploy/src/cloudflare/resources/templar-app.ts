import type { TemplarPlatformEnv } from "@templar/config";
import alchemy, { Scope, type Secret } from "alchemy";
import type {
  Binding,
  Bindings,
  Queue,
  QueueConsumerSettings,
  TanStackStartProps,
} from "alchemy/cloudflare";
import { defaultTemplarBindings, type StandardTemplarBindings } from "../../templar-bindings.ts";
import { createTemplarPlatformBindings } from "../platform-bindings.ts";
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
  B extends StandardTemplarBindings = typeof defaultTemplarBindings,
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
  readonly templarBindings?: B;
};

type NamedBinding<Name extends string, Value extends Binding> = {
  readonly [BindingName in Name]: Value;
};

type EnabledServiceBinding<
  Services extends TemplarAppServices | undefined,
  Service extends keyof TemplarAppServices,
  Value extends Binding,
> = Services extends { readonly [Key in Service]: true } ? Value : never;

type QueueResourceBinding<Value extends Queue<string> | TemplarAppQueueInput | undefined> =
  Value extends TemplarAppQueueInput
    ? Value["binding"]
    : Value extends Queue<string>
      ? Value
      : never;

type TemplarAppBindings<
  B extends StandardTemplarBindings,
  AppBindings extends Bindings,
  BlobBinding extends Binding | undefined,
  CacheBinding extends Binding | undefined,
  DbBinding extends Binding | undefined,
  QueueBinding extends Queue<string> | TemplarAppQueueInput | undefined,
  Services extends TemplarAppServices | undefined,
> = AppBindings &
  TemplarPlatformEnv &
  NamedBinding<B["authBaseUrl"], EnabledServiceBinding<Services, "auth", string>> &
  NamedBinding<B["authSecret"], EnabledServiceBinding<Services, "auth", Secret>> &
  NamedBinding<B["openRouterApiToken"], EnabledServiceBinding<Services, "ai", Secret>> &
  NamedBinding<B["db"], Extract<DbBinding, Binding>> &
  NamedBinding<B["r2"], Extract<BlobBinding, Binding>> &
  NamedBinding<B["cache"], Extract<CacheBinding, Binding>> &
  NamedBinding<B["jobsQueue"], QueueResourceBinding<QueueBinding>>;

const DEFAULT_QUEUE_SETTINGS = {
  batchSize: 1,
  maxConcurrency: 2,
  maxRetries: 0,
} as const satisfies QueueConsumerSettings;

export async function templarApp<
  const B extends StandardTemplarBindings = typeof defaultTemplarBindings,
  const AppBindings extends Bindings = Record<never, never>,
  const BlobBinding extends Binding | undefined = undefined,
  const CacheBinding extends Binding | undefined = undefined,
  const DbBinding extends Binding | undefined = undefined,
  const QueueBinding extends Queue<string> | TemplarAppQueueInput | undefined = undefined,
  const Services extends TemplarAppServices | undefined = undefined,
>(
  id: string,
  options: TemplarAppOptions<
    B,
    AppBindings,
    BlobBinding,
    CacheBinding,
    DbBinding,
    QueueBinding,
    Services
  >,
) {
  const {
    bindings,
    blob,
    cache,
    db,
    domainName,
    eventSources,
    queue,
    services,
    templarBindings = defaultTemplarBindings as unknown as B,
    ...appOptions
  } = options;
  const scope = Scope.current;
  const queueInput = normalizeQueueInput(queue);
  const consumerEventSource = queueConsumerEventSource(queueInput);
  const platformBindings = createTemplarPlatformBindings({
    appId: scope.appName,
    local: scope.local,
  });
  type WorkerBindings = TemplarAppBindings<
    B,
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
            [templarBindings.authBaseUrl]: domainName === undefined ? "" : `https://${domainName}`,
            [templarBindings.authSecret]: alchemy.secret.env("TEMPLAR_AUTH_SECRET"),
          }
        : {}),
      ...(services?.ai === true
        ? {
            [templarBindings.openRouterApiToken]: alchemy.secret.env("OPENROUTER_API_TOKEN"),
          }
        : {}),
      ...(db === undefined ? {} : { [templarBindings.db]: db }),
      ...(blob === undefined ? {} : { [templarBindings.r2]: blob }),
      ...(cache === undefined ? {} : { [templarBindings.cache]: cache }),
      ...(queueInput === undefined ? {} : { [templarBindings.jobsQueue]: queueInput.binding }),
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
