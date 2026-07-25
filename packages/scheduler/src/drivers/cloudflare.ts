import { type Context, Effect, type Layer } from "effect";
import type { SchedulerDriver } from "../driver.ts";
import { SchedulerProviderError } from "../errors.ts";
import {
  makeSchedulerLayer,
  makeSchedulerLayerFor,
  makeSchedulerService,
  type SchedulerService,
} from "../service.ts";
import type { SchedulerDefinitions, SchedulerHandlers } from "../types.ts";

const CLOUDFLARE_PROVIDER = "cloudflare";

export type CloudflareScheduledControllerLike = {
  readonly cron: string;
  readonly scheduledTime: number;
};

export const cloudflareSchedulerDriver = {
  provider: CLOUDFLARE_PROVIDER,
  toTrigger: (controller) => cloudflareTrigger(controller),
} satisfies SchedulerDriver<CloudflareScheduledControllerLike>;

export function makeCloudflareScheduler<const Definitions extends SchedulerDefinitions>(
  schedules: Definitions,
  handlers: SchedulerHandlers<Definitions>,
): SchedulerService<CloudflareScheduledControllerLike> {
  return makeSchedulerService({
    driver: cloudflareSchedulerDriver,
    schedules,
    handlers,
  });
}

export const makeScheduler = makeCloudflareScheduler;

export function cloudflareSchedulerLayer<const Definitions extends SchedulerDefinitions>(
  schedules: Definitions,
  handlers: SchedulerHandlers<Definitions>,
) {
  return makeSchedulerLayer(makeCloudflareScheduler(schedules, handlers));
}

export const schedulerLayer = cloudflareSchedulerLayer;

export function cloudflareSchedulerLayerFor<Id, const Definitions extends SchedulerDefinitions>(
  tag: Context.Tag<Id, SchedulerService<CloudflareScheduledControllerLike>>,
  schedules: Definitions,
  handlers: SchedulerHandlers<Definitions>,
): Layer.Layer<Id> {
  return makeSchedulerLayerFor(tag, makeCloudflareScheduler(schedules, handlers));
}

export const schedulerLayerFor = cloudflareSchedulerLayerFor;

function cloudflareTrigger(
  controller: CloudflareScheduledControllerLike,
): Effect.Effect<{ readonly cron: string; readonly scheduledAt: Date }, SchedulerProviderError> {
  const scheduledAt = new Date(controller?.scheduledTime);

  if (
    typeof controller?.cron !== "string" ||
    controller.cron.length === 0 ||
    typeof controller.scheduledTime !== "number" ||
    !Number.isSafeInteger(controller.scheduledTime) ||
    controller.scheduledTime < 0 ||
    Number.isNaN(scheduledAt.getTime())
  ) {
    return Effect.fail(
      new SchedulerProviderError({
        provider: CLOUDFLARE_PROVIDER,
        operation: "decodeTrigger",
        cause: new TypeError("Cloudflare scheduled controller is invalid."),
      }),
    );
  }

  return Effect.succeed({
    cron: controller.cron,
    scheduledAt,
  });
}
