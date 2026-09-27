# Upload contracts

## V2: full-history archive

The mobile app appends `/api/v2/health-archive` to its configured HTTPS base URL. Both methods require `Authorization: Bearer <personal secret>`.

`GET ?deviceId=<UUID>` returns:

```json
{
  "protocol": 2,
  "totalRecords": 0,
  "types": [],
  "checkpoints": {}
}
```

`types` contains `{ "type": "<HealthKit identifier>", "count": 123 }` entries. `checkpoints` maps each type to an opaque base64 cursor; receivers must not interpret it. Raw types use HealthKit anchors; derived types use resumable calculation cursors. Characteristics, medication concepts, and activity summaries are snapshots and are re-read each session.

Version 0.5 requires a receiver accepting `hasMore` and the derived records below. Its GET response advertises `capabilities: ["sync-coverage", "healthkit-statistics", "knowledge-v1"]`; upgrade the receiver before installing the app.

`POST` accepts:

```json
{
  "deviceId": "42eaa184-e6cd-42af-aae8-160ecd461157",
  "type": "HKQuantityTypeIdentifierHeartRate",
  "records": [{
    "id": "sample-uuid",
    "parentId": "sample-uuid",
    "data": { "value": 60, "unit": "count/min" }
  }],
  "deleted": []
}
```

Records are keyed by device, type, and ID. Retrying overwrites that key. Series and archive fragments share the sample's parent ID; their data includes `kind`, `part`, `parts`, and `values` or base64 `content`. Base64 fragments must be concatenated in part order before decoding. `appleArchive` is an Apple secure keyed archive, not portable XML.

Each request carries at most 100 records, 100 deleted parent IDs, and 2 MiB of JSON. The client splits large pages into multiple requests. Success acknowledges the committed batch as `{ "accepted": 1, "deleted": 0 }`; clients verify both counts.

Only the **final** batch of a native page includes `checkpoint`. Earlier batches must be acknowledged before sending it. The destination commits the final records, deletions, and checkpoint atomically; a separate empty checkpoint request is also supported for older clients. Empty pages still send a checkpoint. Retrying records and deletions is idempotent. If the final response is lost, the client reads the destination's committed checkpoint on resume. Deletions remove every record sharing that parent ID for this device and type.

Version 0.5 includes `hasMore: true | false` alongside each checkpoint, including empty pages. The receiver records backfilling versus caught-up-at-time separately from record dates. A caught-up query does not establish read permission, wear completeness, or absence of data. Legacy clients omit this field and cannot establish that status.

### Derived records

Raw samples and series remain unchanged. The phone additionally exports:

| Type | Identity | Contents |
| --- | --- | --- |
| `statistics:<HealthKit quantity identifier>` | `<IANA time zone>/<YYYY-MM-DD>` | A local calendar day's merged HealthKit statistics |
| `workoutDetails` | Workout UUID | Workout context and `workoutStatistics` fragments |

Daily records contain `kind: "healthkitStatistic"`, `quantityType`, `date`, `timeZone`, `resolution: "day"`, actual `startAt`/`endAt`, `calculatedAt`, `unit`, `function`, and `value`. Empty results carry `value: null`, never an inferred zero. Discrete results also include `min`/`max`. `contributors` lists contributing HealthKit sources; it does not expose their priority order. Local days can span 23 or 25 hours.

Daily quantities are steps, walking/running distance, cycling distance, active and basal energy, exercise time, resting heart rate, and HRV. They use `HKStatisticsCollectionQuery` without `separateBySource`, allowing HealthKit to merge source data before calculating values. Receivers must not replace a missing cumulative statistic with a sum of raw overlapping samples. See [Apple's statistics documentation](https://developer.apple.com/documentation/healthkit/hkstatistics).

Workout context has `kind: "workoutContext"` and `calculatedAt`. Its timeline uses one-minute intervals anchored at workout start, clipped to workout end, and HealthKit's workout-association predicate. Metrics include heart rate, active energy, walking/running and cycling distance, running speed, and supported cycling power/cadence. Each value identifies its metric, unit, boundaries, function, contributors, and association. Minute values do not establish sets, reps, continuous sensor wear, or calories attributable to a set.

Receiving a new `workoutContext` base record discards that device/workout's old detail fragments before accepting replacements. Readers must withhold incomplete fragment sets. Deleting a raw workout also deletes its derived detail for that exporter. Fragment retries are safe; the last page batch remains the only checkpoint boundary.

Derived streams backfill independently of raw anchors. Subsequent passes refresh seven recent days and any older interval touched by a raw change. Deletions trigger a full recalculation; a full sweep also runs after 30 days to catch source-priority and permission changes. Durable generation counters preserve changes arriving during a sweep. Workout refreshes reread one workout per page, including quantities associated after the workout was first saved. These checks run when foreground or iOS background execution is available.

## V1: installed step-only builds

The mobile app appends `/api/v1/sample-ingestion` to its configured HTTPS base URL.
Requests use `Authorization: Bearer <personal secret>` and JSON bodies. Secrets are
32–512 URL-safe characters and are stored on-device, never embedded in builds.

## Upload

`POST` body:

```json
{
  "requestId": "68da8ab4-4488-42e9-bb80-49d8b84edbd1",
  "deviceId": "42eaa184-e6cd-42af-aae8-160ecd461157",
  "samples": [{
    "sampleId": "df9dd8e9-470a-477c-b22a-f13fd853ce89",
    "type": "stepCount",
    "value": 412,
    "unit": "count",
    "startAt": "2026-09-18T08:00:00.000Z",
    "endAt": "2026-09-18T09:00:00.000Z",
    "source": { "bundleIdentifier": "test.synthetic", "name": "Synthetic fixture" }
  }]
}
```

Success returns `requestId`, `status` (`accepted` or `replayed`), `inserted`, and
`unchanged`. A request ID can be replayed with the same payload. A changed payload
for the same device/request ID returns 409. Sample IDs are deduplicated per device.

The installed app sends up to 100 recent step samples. V1 accepts at most 64 KiB,
100 unique samples, nonnegative integer step counts, and intervals of up to two
hours. This protocol does not support full-history exports across other types.

## Status

Authenticated `GET` returns `deviceId`, `totalSamples`, and `lastSync` (`null` before
the first upload, otherwise `requestId`, `acceptedSamples`, and `receivedAt`).

Receivers return 401 for invalid credentials and avoid caching health responses.
The personal implementation is owned by the homelab repository.
