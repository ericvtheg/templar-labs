import { z } from "zod";

export const contractLimitsV1 = {
  maxBatchItems: 100,
  maxIdentifierLength: 255,
  maxIntervalMilliseconds: 2 * 60 * 60 * 1_000,
  maxRequestBodyBytes: 65_536,
} as const;

const instant = z.iso.datetime({ offset: true });
const identifier = z.string().min(1).max(contractLimitsV1.maxIdentifierLength);

export const stepSampleV1Schema = z
  .object({
    sampleId: z.uuid(),
    type: z.literal("stepCount"),
    value: z.number().int().nonnegative().max(1_000_000),
    unit: z.literal("count"),
    startAt: instant,
    endAt: instant,
    source: z
      .object({
        bundleIdentifier: identifier,
        name: identifier,
      })
      .strict(),
  })
  .strict()
  .superRefine((sample, context) => {
    const start = Date.parse(sample.startAt);
    const end = Date.parse(sample.endAt);
    if (end < start) {
      context.addIssue({
        code: "custom",
        message: "endAt must not precede startAt",
        path: ["endAt"],
      });
    }
    if (end - start > contractLimitsV1.maxIntervalMilliseconds) {
      context.addIssue({
        code: "custom",
        message: "sample interval must not exceed two hours",
        path: ["endAt"],
      });
    }
    if (end > Date.now() + 5 * 60 * 1_000) {
      context.addIssue({
        code: "custom",
        message: "endAt must not be in the future",
        path: ["endAt"],
      });
    }
  });

export const healthSyncRequestV1Schema = z
  .object({
    requestId: z.uuid(),
    deviceId: z.uuid(),
    samples: z.array(stepSampleV1Schema).min(1).max(contractLimitsV1.maxBatchItems),
  })
  .strict()
  .superRefine((request, context) => {
    const ids = new Set<string>();
    for (const [index, sample] of request.samples.entries()) {
      if (ids.has(sample.sampleId)) {
        context.addIssue({
          code: "custom",
          message: "sampleId must be unique",
          path: ["samples", index, "sampleId"],
        });
      }
      ids.add(sample.sampleId);
    }
  });

export type HealthSyncRequestV1 = z.infer<typeof healthSyncRequestV1Schema>;
export type StepSampleV1 = z.infer<typeof stepSampleV1Schema>;

export type HealthSyncResponseV1 = {
  readonly requestId: string;
  readonly status: "accepted" | "replayed";
  readonly inserted: number;
  readonly unchanged: number;
};

export type SyncStatusV1 = {
  readonly deviceId: string | null;
  readonly totalSamples: number;
  readonly lastSync: {
    readonly requestId: string;
    readonly acceptedSamples: number;
    readonly receivedAt: string;
  } | null;
};
