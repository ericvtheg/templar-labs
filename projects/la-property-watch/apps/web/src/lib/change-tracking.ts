import { allowedEmails } from "./model.ts";

type PublicationInput = {
  readonly runId: string;
  readonly sourceId: string;
  readonly sourceName: string;
  readonly sourceUrl: string;
  readonly detectedAt: string;
  readonly sourceUpdatedAt: string | null;
  readonly snapshotComplete: boolean;
};

/**
 * These statements run in the same D1 batch as evidence publication, snapshot
 * reconciliation, ranking replacement, and ingestion success. They compare
 * staging to the last successful publication. The first successful source
 * publication establishes a baseline and intentionally produces no events.
 */
export function publicationChangeStatements(
  db: D1Database,
  input: PublicationInput,
): D1PreparedStatement[] {
  const statements: D1PreparedStatement[] = [];

  statements.push(
    db
      .prepare(
        `INSERT OR IGNORE INTO property_change_events (id,property_key,source_id,source_record_id,event_type,severity,detected_at,published_at,before_json,after_json,source_name,source_url,ingestion_run_id)
         SELECT ?||':new-installment:'||s.id||':'||?,s.property_key,?,s.source_record_id,'new_delinquent_installment','new',?,COALESCE(s.source_published_at,s.source_updated_at,s.event_date),NULL,json_object('tax_year',s.tax_year,'tax_installment',s.tax_installment,'reported_balance_cents',s.delinquent_amount_cents),?,?,?
         FROM foreclosure_record_staging s
         JOIN source_publications p ON p.source_id=?
         LEFT JOIN foreclosure_records old ON old.id=s.id
         WHERE s.staging_run_id=? AND s.signal_type='tax_delinquency' AND old.id IS NULL`,
      )
      .bind(
        input.sourceId,
        input.runId,
        input.sourceId,
        input.detectedAt,
        input.sourceName,
        input.sourceUrl,
        input.runId,
        input.sourceId,
        input.runId,
      ),
  );

  statements.push(
    db
      .prepare(
        `INSERT OR IGNORE INTO property_change_events (id,property_key,source_id,source_record_id,event_type,severity,detected_at,published_at,before_json,after_json,source_name,source_url,ingestion_run_id)
         SELECT ?||':release-record:'||s.id||':'||?,s.property_key,?,s.source_record_id,'explicit_status_changed','status',?,COALESCE(s.source_published_at,s.source_updated_at,s.event_date),NULL,json_object('signal_type','lien_release','explicit_source_status',1,'linkage_status','exact_instrument_linkage_requires_verification'),?,?,?
         FROM foreclosure_record_staging s
         JOIN source_publications p ON p.source_id=?
         LEFT JOIN foreclosure_records old ON old.id=s.id
         WHERE s.staging_run_id=? AND s.signal_type='lien_release' AND old.id IS NULL`,
      )
      .bind(
        input.sourceId,
        input.runId,
        input.sourceId,
        input.detectedAt,
        input.sourceName,
        input.sourceUrl,
        input.runId,
        input.sourceId,
        input.runId,
      ),
  );

  statements.push(
    db
      .prepare(
        `INSERT OR IGNORE INTO property_change_events (id,property_key,source_id,source_record_id,event_type,severity,detected_at,published_at,before_json,after_json,source_name,source_url,ingestion_run_id)
         SELECT ?||':balance:'||s.id||':'||COALESCE(s.delinquent_amount_cents,s.unpaid_balance_cents,s.principal_balance_cents,-1)||':'||?,s.property_key,?,s.source_record_id,'balance_changed',CASE WHEN COALESCE(s.delinquent_amount_cents,s.unpaid_balance_cents,s.principal_balance_cents,0)>COALESCE(old.delinquent_amount_cents,old.unpaid_balance_cents,old.principal_balance_cents,0) THEN 'worsening' ELSE 'changed' END,?,COALESCE(s.source_published_at,s.source_updated_at,s.event_date),json_object('reported_balance_cents',COALESCE(old.delinquent_amount_cents,old.unpaid_balance_cents,old.principal_balance_cents)),json_object('reported_balance_cents',COALESCE(s.delinquent_amount_cents,s.unpaid_balance_cents,s.principal_balance_cents)),?,?,?
         FROM foreclosure_record_staging s
         JOIN source_publications p ON p.source_id=?
         JOIN foreclosure_records old ON old.id=s.id
         WHERE s.staging_run_id=?
           AND COALESCE(s.delinquent_amount_cents,s.unpaid_balance_cents,s.principal_balance_cents,-1)<>COALESCE(old.delinquent_amount_cents,old.unpaid_balance_cents,old.principal_balance_cents,-1)
           AND (ABS(COALESCE(s.delinquent_amount_cents,s.unpaid_balance_cents,s.principal_balance_cents,0)-COALESCE(old.delinquent_amount_cents,old.unpaid_balance_cents,old.principal_balance_cents,0))>=10000
             OR ABS(COALESCE(s.delinquent_amount_cents,s.unpaid_balance_cents,s.principal_balance_cents,0)-COALESCE(old.delinquent_amount_cents,old.unpaid_balance_cents,old.principal_balance_cents,0))*100>=MAX(1,ABS(COALESCE(old.delinquent_amount_cents,old.unpaid_balance_cents,old.principal_balance_cents,0)))*5)`,
      )
      .bind(
        input.sourceId,
        input.runId,
        input.sourceId,
        input.detectedAt,
        input.sourceName,
        input.sourceUrl,
        input.runId,
        input.sourceId,
        input.runId,
      ),
  );

  statements.push(
    db
      .prepare(
        `INSERT OR IGNORE INTO property_change_events (id,property_key,source_id,source_record_id,event_type,severity,detected_at,published_at,before_json,after_json,source_name,source_url,ingestion_run_id)
         SELECT ?||':independent:'||s.property_key||':'||s.signal_type||':'||?,s.property_key,?,MIN(s.source_record_id),'new_independent_signal','new',?,MAX(COALESCE(s.source_published_at,s.source_updated_at,s.event_date)),NULL,json_object('signal_type',s.signal_type),?,?,?
         FROM foreclosure_record_staging s
         JOIN source_publications p ON p.source_id=?
         LEFT JOIN foreclosure_records old ON old.id=s.id
         WHERE s.staging_run_id=? AND old.id IS NULL
           AND s.signal_type IN ('tax_delinquency','code_violation','recorded_lien','mortgage_foreclosure_initiated')
           AND EXISTS (SELECT 1 FROM foreclosure_records prior WHERE prior.property_key=s.property_key AND prior.snapshot_presence='present' AND prior.signal_type<>s.signal_type AND prior.signal_type IN ('tax_delinquency','code_violation','recorded_lien','mortgage_foreclosure_initiated'))
           AND NOT EXISTS (SELECT 1 FROM foreclosure_records same_signal WHERE same_signal.property_key=s.property_key AND same_signal.snapshot_presence='present' AND same_signal.signal_type=s.signal_type)
         GROUP BY s.property_key,s.signal_type`,
      )
      .bind(
        input.sourceId,
        input.runId,
        input.sourceId,
        input.detectedAt,
        input.sourceName,
        input.sourceUrl,
        input.runId,
        input.sourceId,
        input.runId,
      ),
  );

  statements.push(
    db
      .prepare(
        `INSERT OR IGNORE INTO property_change_events (id,property_key,source_id,source_record_id,event_type,severity,detected_at,published_at,before_json,after_json,source_name,source_url,ingestion_run_id)
         SELECT ?||':foreclosure:'||s.id||':'||?,s.property_key,?,s.source_record_id,'foreclosure_initiated','worsening',?,COALESCE(s.source_published_at,s.source_updated_at,s.event_date),NULL,json_object('signal_type',s.signal_type,'status',s.evidence_status),?,?,?
         FROM foreclosure_record_staging s
         JOIN source_publications p ON p.source_id=?
         LEFT JOIN foreclosure_records old ON old.id=s.id
         WHERE s.staging_run_id=? AND s.signal_type='mortgage_foreclosure_initiated' AND old.id IS NULL`,
      )
      .bind(
        input.sourceId,
        input.runId,
        input.sourceId,
        input.detectedAt,
        input.sourceName,
        input.sourceUrl,
        input.runId,
        input.sourceId,
        input.runId,
      ),
  );

  statements.push(
    db
      .prepare(
        `INSERT OR IGNORE INTO property_change_events (id,property_key,source_id,source_record_id,event_type,severity,detected_at,published_at,before_json,after_json,source_name,source_url,ingestion_run_id)
         SELECT ?||':status:'||s.id||':'||LOWER(COALESCE(s.evidence_status,''))||':'||?,s.property_key,?,s.source_record_id,'explicit_status_changed','status',?,COALESCE(s.source_published_at,s.source_updated_at,s.event_date),json_object('status',old.evidence_status),json_object('status',s.evidence_status,'explicit_source_status',1),?,?,?
         FROM foreclosure_record_staging s
         JOIN source_publications p ON p.source_id=?
         JOIN foreclosure_records old ON old.id=s.id
         WHERE s.staging_run_id=? AND COALESCE(s.evidence_status,'')<>COALESCE(old.evidence_status,'')
           AND (
             (s.signal_type='tax_delinquency' AND LOWER(TRIM(COALESCE(s.evidence_status,''))) IN ('paid','cured','resolved'))
             OR (s.signal_type IN ('notice_of_default','mortgage_foreclosure_initiated','scheduled_trustee_sale') AND LOWER(TRIM(COALESCE(s.evidence_status,''))) IN ('withdrawn','withdrawn (cured)','cured','stayed','released'))
             OR (s.signal_type='recorded_lien' AND LOWER(TRIM(COALESCE(s.evidence_status,''))) IN ('released','satisfied','terminated'))
             OR (s.signal_type='code_violation' AND LOWER(TRIM(COALESCE(s.evidence_status,''))) IN ('closed','complied','resolved'))
           )`,
      )
      .bind(
        input.sourceId,
        input.runId,
        input.sourceId,
        input.detectedAt,
        input.sourceName,
        input.sourceUrl,
        input.runId,
        input.sourceId,
        input.runId,
      ),
  );

  statements.push(
    db
      .prepare(
        `INSERT OR IGNORE INTO property_change_events (id,property_key,source_id,source_record_id,event_type,severity,detected_at,published_at,before_json,after_json,source_name,source_url,ingestion_run_id)
         SELECT ?||':reappeared:'||s.id||':'||?,s.property_key,?,s.source_record_id,'evidence_reappeared','new',?,COALESCE(s.source_published_at,s.source_updated_at,s.event_date),json_object('snapshot_presence','no_longer_present','no_longer_present_at',old.no_longer_present_at),json_object('snapshot_presence','present','status','requires_current_verification'),?,?,?
         FROM foreclosure_record_staging s
         JOIN source_publications p ON p.source_id=?
         JOIN foreclosure_records old ON old.id=s.id
         WHERE s.staging_run_id=? AND old.snapshot_presence='no_longer_present'`,
      )
      .bind(
        input.sourceId,
        input.runId,
        input.sourceId,
        input.detectedAt,
        input.sourceName,
        input.sourceUrl,
        input.runId,
        input.sourceId,
        input.runId,
      ),
  );

  if (input.snapshotComplete) {
    statements.push(
      db
        .prepare(
          `INSERT OR IGNORE INTO property_change_events (id,property_key,source_id,source_record_id,event_type,severity,detected_at,published_at,before_json,after_json,source_name,source_url,ingestion_run_id)
           SELECT ?||':missing:'||old.id||':'||?,old.property_key,?,old.source_record_id,'missing_from_snapshot','verification',?,COALESCE(old.source_published_at,old.source_updated_at,old.event_date),json_object('snapshot_presence','present','status',old.evidence_status),json_object('snapshot_presence','no_longer_present','status','needs_verification','resolution_inferred',0),?,?,?
           FROM foreclosure_records old
           JOIN source_publications p ON p.source_id=?
           WHERE old.source_id=? AND old.snapshot_presence='present'
             AND NOT EXISTS (SELECT 1 FROM foreclosure_record_staging s WHERE s.staging_run_id=? AND s.id=old.id)`,
        )
        .bind(
          input.sourceId,
          input.runId,
          input.sourceId,
          input.detectedAt,
          input.sourceName,
          input.sourceUrl,
          input.runId,
          input.sourceId,
          input.sourceId,
          input.runId,
        ),
    );
  }

  for (const email of allowedEmails) {
    statements.push(
      db
        .prepare(
          `INSERT OR IGNORE INTO property_alerts (id,user_email,property_key,change_event_id,kind,title,created_at,available_at)
           SELECT ?||':'||LOWER(HEX(RANDOMBLOB(16))),?,e.property_key,e.id,CASE WHEN e.severity='worsening' THEN 'worsening_activity' ELSE 'new_activity' END,CASE e.event_type WHEN 'balance_changed' THEN 'Reported balance changed' WHEN 'new_delinquent_installment' THEN 'New delinquent installment' WHEN 'new_independent_signal' THEN 'New independent distress signal' WHEN 'foreclosure_initiated' THEN 'Foreclosure initiation published' WHEN 'evidence_reappeared' THEN 'Evidence reappeared' WHEN 'missing_from_snapshot' THEN 'Evidence missing; verify status' ELSE 'Published status changed' END,e.detected_at,e.detected_at
           FROM property_change_events e
           JOIN partner_properties p ON p.property_key=e.property_key AND p.saved=1
           LEFT JOIN user_alert_preferences prefs ON LOWER(prefs.user_email)=LOWER(?)
           WHERE e.ingestion_run_id=?
             AND ((e.severity='worsening' AND COALESCE(prefs.worsening_activity,1)=1) OR (e.severity<>'worsening' AND COALESCE(prefs.new_activity,1)=1))`,
        )
        .bind(
          `activity_${email.toLowerCase().replaceAll(/[^a-z0-9]/g, "_")}`,
          email,
          email,
          input.runId,
        ),
    );
  }

  statements.push(
    db
      .prepare(
        "INSERT INTO source_publications (source_id,baseline_established_at,last_success_run_id,last_source_updated_at,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(source_id) DO UPDATE SET last_success_run_id=excluded.last_success_run_id,last_source_updated_at=excluded.last_source_updated_at,updated_at=excluded.updated_at",
      )
      .bind(input.sourceId, input.detectedAt, input.runId, input.sourceUpdatedAt, input.detectedAt),
  );
  return statements;
}
