import type { HealthSyncResponseV1, SyncStatusV1 } from "../contracts/v1.ts";
import {
  type HealthRepository,
  hashCanonicalPayload,
  RequestIdConflict,
} from "../domain/repository.ts";

type StoredRun = {
  id: string;
  requestId: string;
  payloadHash: string;
  insertedCount: number;
  unchangedCount: number;
  claimed: number;
};

export function makeD1HealthRepository(binding: D1Database): HealthRepository {
  return {
    ingest: async (input) => {
      const claimId = crypto.randomUUID();
      const hash = await hashCanonicalPayload(input);
      const now = Date.now();
      const samples = JSON.stringify(
        input.samples.map((sample) => ({
          ...sample,
          startAt: Date.parse(sample.startAt),
          endAt: Date.parse(sample.endAt),
        })),
      );
      const results = await binding.batch<StoredRun>([
        binding
          .prepare(
            `INSERT INTO health_sync_runs
            (id, device_id, request_id, payload_hash, accepted_count, inserted_count, unchanged_count, received_at)
           VALUES (?, ?, ?, ?, ?, 0, 0, ?)
           ON CONFLICT (device_id, request_id) DO NOTHING`,
          )
          .bind(claimId, input.deviceId, input.requestId, hash, input.samples.length, now),
        binding
          .prepare(
            `INSERT INTO health_step_samples
            (id, device_id, sample_id, sync_run_id, value, start_at, end_at, source_bundle_id, source_name, received_at)
           SELECT ? || ':' || json_extract(item.value, '$.sampleId'), ?, json_extract(item.value, '$.sampleId'),
                  ?, json_extract(item.value, '$.value'), json_extract(item.value, '$.startAt'),
                  json_extract(item.value, '$.endAt'), json_extract(item.value, '$.source.bundleIdentifier'),
                  json_extract(item.value, '$.source.name'), ?
           FROM json_each(?) AS item
           WHERE EXISTS (SELECT 1 FROM health_sync_runs WHERE id = ?)
           ON CONFLICT (device_id, sample_id) DO NOTHING`,
          )
          .bind(claimId, input.deviceId, claimId, now, samples, claimId),
        binding
          .prepare(
            `UPDATE health_sync_runs SET
             inserted_count = (SELECT count(*) FROM health_step_samples WHERE sync_run_id = ?),
             unchanged_count = accepted_count - (SELECT count(*) FROM health_step_samples WHERE sync_run_id = ?)
           WHERE id = ?`,
          )
          .bind(claimId, claimId, claimId),
        binding
          .prepare(
            `SELECT id, request_id AS requestId, payload_hash AS payloadHash,
                  inserted_count AS insertedCount, unchanged_count AS unchangedCount,
                  CASE WHEN id = ? THEN 1 ELSE 0 END AS claimed
           FROM health_sync_runs WHERE device_id = ? AND request_id = ?`,
          )
          .bind(claimId, input.deviceId, input.requestId),
      ]);
      const stored = results.at(-1)?.results[0];
      if (stored === undefined) {
        throw new Error("sync claim missing");
      }
      if (stored.payloadHash !== hash) {
        throw new RequestIdConflict();
      }
      return response(stored);
    },
    status: async () => {
      const row = await binding
        .prepare(
          `SELECT r.device_id AS deviceId, r.request_id AS requestId, r.accepted_count AS acceptedSamples,
                r.received_at AS receivedAt,
                (SELECT count(*) FROM health_step_samples) AS totalSamples
         FROM health_sync_runs r ORDER BY r.received_at DESC, r.rowid DESC LIMIT 1`,
        )
        .first<{
          deviceId: string;
          requestId: string;
          acceptedSamples: number;
          receivedAt: number;
          totalSamples: number;
        }>();
      if (row === null) {
        return { deviceId: null, totalSamples: 0, lastSync: null };
      }
      return {
        deviceId: row.deviceId,
        totalSamples: row.totalSamples,
        lastSync: {
          requestId: row.requestId,
          acceptedSamples: row.acceptedSamples,
          receivedAt: new Date(row.receivedAt).toISOString(),
        },
      } satisfies SyncStatusV1;
    },
  };
}

function response(run: StoredRun): HealthSyncResponseV1 {
  return {
    requestId: run.requestId,
    status: run.claimed === 1 ? "accepted" : "replayed",
    inserted: run.insertedCount,
    unchanged: run.unchangedCount,
  };
}
