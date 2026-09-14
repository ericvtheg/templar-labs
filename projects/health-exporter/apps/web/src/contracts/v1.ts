import { z } from "zod";

export const contractLimitsV1 = {
  maxAnchorLength: 16_384,
  maxBatchItems: 500,
  maxIdentifierLength: 255,
  maxMetadataEntries: 32,
  maxMetadataKeyLength: 64,
  maxMetadataValueLength: 1_024,
  maxRequestBodyBytes: 1_048_576,
} as const;

const identifier = z.string().min(1).max(contractLimitsV1.maxIdentifierLength);
const instant = z.iso.datetime({ offset: true });
const metadata = z
  .record(
    z.string().min(1).max(contractLimitsV1.maxMetadataKeyLength),
    z.string().max(contractLimitsV1.maxMetadataValueLength),
  )
  .refine((value) => Object.keys(value).length <= contractLimitsV1.maxMetadataEntries, {
    message: `metadata must contain at most ${contractLimitsV1.maxMetadataEntries} entries`,
  });

export const deviceIdentityV1Schema = z
  .object({
    deviceId: z.uuid(),
    installationId: z.uuid(),
    platform: z.literal("ios"),
    appVersion: identifier,
  })
  .strict();

export const sourceProvenanceV1Schema = z
  .object({
    bundleIdentifier: identifier,
    name: identifier,
    version: z.string().max(contractLimitsV1.maxIdentifierLength).optional(),
    productType: z.string().max(contractLimitsV1.maxIdentifierLength).optional(),
    metadata: metadata.default({}),
  })
  .strict();

export const healthSampleV1Schema = z
  .object({
    sampleId: z.uuid(),
    type: z.literal("bodyMass"),
    value: z.number().int().positive(),
    unit: z.literal("g"),
    startAt: instant,
    endAt: instant,
    source: sourceProvenanceV1Schema,
  })
  .strict()
  .refine((sample) => Date.parse(sample.endAt) >= Date.parse(sample.startAt), {
    message: "endAt must not precede startAt",
    path: ["endAt"],
  });

export const deletedHealthSampleV1Schema = z
  .object({
    sampleId: z.uuid(),
    deletedAt: instant,
  })
  .strict();

export const sampleIngestionRequestV1Schema = z
  .object({
    requestId: z.uuid(),
    device: deviceIdentityV1Schema,
    anchor: z.string().min(1).max(contractLimitsV1.maxAnchorLength).optional(),
    samples: z.array(healthSampleV1Schema).max(contractLimitsV1.maxBatchItems),
    deletions: z.array(deletedHealthSampleV1Schema).max(contractLimitsV1.maxBatchItems),
  })
  .strict()
  .superRefine((request, context) => {
    if (request.samples.length + request.deletions.length === 0) {
      context.addIssue({
        code: "custom",
        message: "at least one sample or deletion is required",
      });
    }
    if (request.samples.length + request.deletions.length > contractLimitsV1.maxBatchItems) {
      context.addIssue({
        code: "custom",
        message: `at most ${contractLimitsV1.maxBatchItems} total changes are allowed`,
      });
    }
    const seen = new Set<string>();
    for (const [index, sample] of request.samples.entries()) {
      if (seen.has(sample.sampleId)) {
        context.addIssue({
          code: "custom",
          message: "sampleId must occur only once per request",
          path: ["samples", index, "sampleId"],
        });
      }
      seen.add(sample.sampleId);
    }
    for (const [index, deletion] of request.deletions.entries()) {
      if (seen.has(deletion.sampleId)) {
        context.addIssue({
          code: "custom",
          message: "sampleId must occur only once per request",
          path: ["deletions", index, "sampleId"],
        });
      }
      seen.add(deletion.sampleId);
    }
  });

export const sampleIngestionResponseV1Schema = z.object({
  requestId: z.uuid(),
  status: z.enum(["accepted", "replayed"]),
  inserted: z.number().int().nonnegative(),
  unchanged: z.number().int().nonnegative(),
  deleted: z.number().int().nonnegative(),
});

export type DeviceIdentityV1 = z.infer<typeof deviceIdentityV1Schema>;
export type HealthSampleV1 = z.infer<typeof healthSampleV1Schema>;
export type SampleIngestionRequestV1 = z.infer<typeof sampleIngestionRequestV1Schema>;
export type SampleIngestionResponseV1 = z.infer<typeof sampleIngestionResponseV1Schema>;
