export type AcceptanceCleanupTokens = {
  propertyKey: string;
  pipelineVersion?: number;
  pipelineUpdatedAt?: string;
  preferenceUserEmail?: string;
  preferenceVersion?: number;
  rankingProfileVersion?: number;
  rankingProfileUpdatedAt?: string;
  scenarioId?: string;
  scenarioVersion?: number;
  scenarioOperationToken?: string;
  benchmarkId?: string;
  benchmarkVersion?: number;
  benchmarkCreatedBy?: string;
  buyBoxId?: string;
  buyBoxVersion?: number;
  buyBoxCreatedBy?: string;
};

/**
 * This statement deliberately violates a NOT NULL constraint when either
 * acceptance-owned token no longer matches. Placing it inside the same D1
 * batch as every cleanup statement makes a mismatch roll the whole batch back.
 */
export function acceptanceCleanupGuard(db: D1Database, tokens: AcceptanceCleanupTokens) {
  return db
    .prepare(
      `INSERT INTO partner_properties (property_key,saved,dismissed,stage,version,created_at,created_by,updated_at,updated_by)
       SELECT '__acceptance_cleanup_guard_failure__',NULL,0,'New',1,'guard','guard','guard','guard'
       WHERE (? IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM partner_properties
         WHERE property_key=? AND version=? AND updated_at=?
       )) OR (? IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM user_alert_preferences
         WHERE user_email=? COLLATE NOCASE AND version=?
       )) OR (? IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM ranking_adjustment_profile
         WHERE id='shared' AND version=? AND updated_at=?
       )) OR (? IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM property_deal_scenarios
         WHERE id=? AND version=? AND operation_token=?
       )) OR (? IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM blind_benchmarks
         WHERE id=? AND version=? AND created_by=? COLLATE NOCASE
       )) OR (? IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM buy_boxes
         WHERE id=? AND version=? AND created_by=? COLLATE NOCASE
       ))`,
    )
    .bind(
      tokens.pipelineVersion ?? null,
      tokens.propertyKey,
      tokens.pipelineVersion ?? null,
      tokens.pipelineUpdatedAt ?? null,
      tokens.preferenceVersion ?? null,
      tokens.preferenceUserEmail ?? null,
      tokens.preferenceVersion ?? null,
      tokens.rankingProfileVersion ?? null,
      tokens.rankingProfileVersion ?? null,
      tokens.rankingProfileUpdatedAt ?? null,
      tokens.scenarioId ?? null,
      tokens.scenarioId ?? null,
      tokens.scenarioVersion ?? null,
      tokens.scenarioOperationToken ?? null,
      tokens.benchmarkId ?? null,
      tokens.benchmarkId ?? null,
      tokens.benchmarkVersion ?? null,
      tokens.benchmarkCreatedBy ?? null,
      tokens.buyBoxId ?? null,
      tokens.buyBoxId ?? null,
      tokens.buyBoxVersion ?? null,
      tokens.buyBoxCreatedBy ?? null,
    );
}
