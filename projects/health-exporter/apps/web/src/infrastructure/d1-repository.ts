import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { healthDevices } from "../../../../db/schema.ts";
import type { SampleIngestionResponseV1 } from "../contracts/v1.ts";
import {
  hashCanonicalPayload,
  IngestionClaimUnauthorized,
  type IngestionRepository,
  IngestionRequestConflict,
} from "../domain/repository.ts";

type StoredRun = {
  requestId: string;
  insertedCount: number;
  unchangedCount: number;
  deletedCount: number;
  payloadHash: string;
  claimed: number;
};

export function makeD1IngestionRepository(binding: D1Database): IngestionRepository {
  const db = drizzle(binding, { schema: { healthDevices } });

  return {
    findDeviceByTokenHash: async (tokenHash) => {
      const [record] = await db
        .select({
          id: healthDevices.id,
          installationId: healthDevices.installationId,
          tokenHash: healthDevices.tokenHash,
          revokedAt: healthDevices.revokedAt,
        })
        .from(healthDevices)
        .where(eq(healthDevices.tokenHash, tokenHash))
        .limit(1);
      return record ?? null;
    },
    ingest: async (device, input) => {
      const claimId = crypto.randomUUID();
      const payloadHash = await hashCanonicalPayload(input);
      const now = Date.now();
      const statements: D1PreparedStatement[] = [
        binding
          .prepare(
            `INSERT INTO health_sync_runs
              (id, device_id, request_id, payload_hash, anchor, sample_count, deletion_count,
               inserted_count, unchanged_count, deleted_count, received_at, completed_at)
             SELECT ?, id, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?
             FROM health_devices
             WHERE id = ? AND token_hash = ? AND installation_id = ? AND revoked_at IS NULL
             ON CONFLICT (device_id, request_id) DO NOTHING`,
          )
          .bind(
            claimId,
            input.requestId,
            payloadHash,
            input.anchor ?? null,
            input.samples.length,
            input.deletions.length,
            now,
            now,
            device.id,
            device.tokenHash,
            device.installationId,
          ),
      ];

      if (input.deletions.length > 0) {
        const deletionsJson = JSON.stringify(
          input.deletions.map((deletion) => ({
            ...deletion,
            deletedAt: Date.parse(deletion.deletedAt),
          })),
        );
        statements.push(
          binding
            .prepare(
              `INSERT INTO health_ingestion_items (run_id, sample_id, kind, outcome)
               SELECT ?, json_extract(item.value, '$.sampleId'), 'deletion',
                 CASE WHEN EXISTS (
                   SELECT 1 FROM health_samples
                   WHERE device_id = ?
                     AND sample_id = json_extract(item.value, '$.sampleId')
                     AND deleted_at IS NULL
                 ) THEN 'deleted' ELSE 'unchanged' END
               FROM json_each(?) AS item
               WHERE EXISTS (SELECT 1 FROM health_sync_runs WHERE id = ?)`,
            )
            .bind(claimId, device.id, deletionsJson, claimId),
          binding
            .prepare(
              `INSERT INTO health_deletion_tombstones
                 (id, device_id, sample_id, deleted_at, received_at)
               SELECT ? || ':deletion:' || json_extract(item.value, '$.sampleId'),
                      ?, json_extract(item.value, '$.sampleId'),
                      json_extract(item.value, '$.deletedAt'), ?
               FROM json_each(?) AS item
               WHERE EXISTS (SELECT 1 FROM health_sync_runs WHERE id = ?)
               ON CONFLICT (device_id, sample_id) DO UPDATE SET
                 deleted_at = max(health_deletion_tombstones.deleted_at, excluded.deleted_at),
                 received_at = CASE
                   WHEN excluded.deleted_at > health_deletion_tombstones.deleted_at
                   THEN excluded.received_at
                   ELSE health_deletion_tombstones.received_at
                 END`,
            )
            .bind(claimId, device.id, now, deletionsJson, claimId),
          binding
            .prepare(
              `UPDATE health_samples
               SET deleted_at = (
                     SELECT json_extract(item.value, '$.deletedAt')
                     FROM json_each(?) AS item
                     WHERE json_extract(item.value, '$.sampleId') = health_samples.sample_id
                   ),
                   updated_at = ?
               WHERE device_id = ?
                 AND EXISTS (
                   SELECT 1 FROM json_each(?) AS item
                   WHERE json_extract(item.value, '$.sampleId') = health_samples.sample_id
                     AND (health_samples.deleted_at IS NULL OR health_samples.deleted_at <
                          json_extract(item.value, '$.deletedAt'))
                 )
                 AND EXISTS (SELECT 1 FROM health_sync_runs WHERE id = ?)`,
            )
            .bind(deletionsJson, now, device.id, deletionsJson, claimId),
        );
      }

      if (input.samples.length > 0) {
        const samplesJson = JSON.stringify(
          input.samples.map((sample) => ({
            ...sample,
            startAt: Date.parse(sample.startAt),
            endAt: Date.parse(sample.endAt),
            sourceMetadataJson: JSON.stringify(sample.source.metadata),
          })),
        );
        statements.push(
          binding
            .prepare(
              `INSERT INTO health_ingestion_items (run_id, sample_id, kind, outcome)
               SELECT ?, json_extract(item.value, '$.sampleId'), 'sample',
                 CASE WHEN EXISTS (
                   SELECT 1 FROM health_samples
                   WHERE device_id = ? AND sample_id = json_extract(item.value, '$.sampleId')
                   UNION ALL
                   SELECT 1 FROM health_deletion_tombstones
                   WHERE device_id = ? AND sample_id = json_extract(item.value, '$.sampleId')
                 ) THEN 'unchanged' ELSE 'inserted' END
               FROM json_each(?) AS item
               WHERE EXISTS (SELECT 1 FROM health_sync_runs WHERE id = ?)`,
            )
            .bind(claimId, device.id, device.id, samplesJson, claimId),
          binding
            .prepare(
              `INSERT INTO health_samples
                (id, device_id, sample_id, type, value, unit, start_at, end_at,
                 source_bundle_id, source_name, source_version, source_product_type,
                 source_metadata_json, created_at, updated_at)
               SELECT ? || ':sample:' || json_extract(item.value, '$.sampleId'),
                      ?, json_extract(item.value, '$.sampleId'),
                      json_extract(item.value, '$.type'), json_extract(item.value, '$.value'),
                      json_extract(item.value, '$.unit'), json_extract(item.value, '$.startAt'),
                      json_extract(item.value, '$.endAt'),
                      json_extract(item.value, '$.source.bundleIdentifier'),
                      json_extract(item.value, '$.source.name'),
                      json_extract(item.value, '$.source.version'),
                      json_extract(item.value, '$.source.productType'),
                      json_extract(item.value, '$.sourceMetadataJson'), ?, ?
               FROM json_each(?) AS item
               WHERE EXISTS (
                 SELECT 1 FROM health_ingestion_items
                 WHERE run_id = ?
                   AND sample_id = json_extract(item.value, '$.sampleId')
                   AND outcome = 'inserted'
               )
               ON CONFLICT (device_id, sample_id) DO NOTHING`,
            )
            .bind(claimId, device.id, now, now, samplesJson, claimId),
        );
      }

      statements.push(
        binding
          .prepare(
            `UPDATE health_sync_runs SET
               inserted_count = (
                 SELECT count(*) FROM health_ingestion_items
                 WHERE run_id = ? AND outcome = 'inserted'
               ),
               unchanged_count = (
                 SELECT count(*) FROM health_ingestion_items
                 WHERE run_id = ? AND outcome = 'unchanged'
               ),
               deleted_count = (
                 SELECT count(*) FROM health_ingestion_items
                 WHERE run_id = ? AND outcome = 'deleted'
               )
             WHERE id = ?`,
          )
          .bind(claimId, claimId, claimId, claimId),
        binding
          .prepare(
            `UPDATE health_devices SET last_seen_at = ?
             WHERE id = ? AND EXISTS (SELECT 1 FROM health_sync_runs WHERE id = ?)`,
          )
          .bind(now, device.id, claimId),
        binding
          .prepare(
            `SELECT request_id AS requestId, payload_hash AS payloadHash,
                    inserted_count AS insertedCount,
                    unchanged_count AS unchangedCount, deleted_count AS deletedCount,
                    CASE WHEN id = ? THEN 1 ELSE 0 END AS claimed
             FROM health_sync_runs
             WHERE device_id = ? AND request_id = ?`,
          )
          .bind(claimId, device.id, input.requestId),
      );

      const results = await binding.batch<StoredRun>(statements);
      const stored = results.at(-1)?.results[0];
      if (stored === undefined) {
        throw new IngestionClaimUnauthorized();
      }
      if (stored.payloadHash !== payloadHash) {
        throw new IngestionRequestConflict();
      }
      return responseFromRun(stored);
    },
  };
}

function responseFromRun(run: StoredRun): SampleIngestionResponseV1 {
  return {
    requestId: run.requestId,
    status: run.claimed === 1 ? "accepted" : "replayed",
    inserted: run.insertedCount,
    unchanged: run.unchangedCount,
    deleted: run.deletedCount,
  };
}
