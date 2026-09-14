# ADR 0001: Apple Health exporter foundation

- Status: Accepted
- Date: 2026-07-25

## Context

Eric needs a private exporter for Apple Health data, initially body-mass samples that may have
originated in Weight Gurus. HealthKit and its authorization, anchored queries, protected-data
availability, and background-delivery behavior are Apple-platform concerns. Templar's ingestion,
normalization, persistence, and reconciliation are backend/domain concerns.

## Decision

The collector boundary is native Swift. Swift owns HealthKit authorization and querying, conversion
to canonical units, source-revision extraction, anchor serialization, secure token storage, and HTTP
requests to versioned `/api/v1` TanStack Server Routes. It must not call TanStack Server Functions,
which are internal application RPC rather than a stable native-client API.

TypeScript owns versioned Zod contracts, authentication, domain rules, and persistence. Route code
only extracts transport data and maps errors to HTTP. An Effect service performs authentication and
ingestion against a repository; the production repository uses Drizzle for device lookup and the D1
binding directly for atomic ingestion batches.

Body mass is normalized to integer grams to avoid floating-point equality ambiguity. HealthKit UUID
becomes `sampleId`. Source bundle identifier, display name, version, product type, and an allowlisted
metadata map are preserved. Source provenance is descriptive, not proof: Weight Gurus attribution
comes from HealthKit's source revision and must not be inferred merely from the sample type.

### Verification tiers

1. Linux verifies TypeScript contracts/domain/HTTP behavior and the platform-independent Swift
   package where a Swift toolchain happens to exist. It cannot validate HealthKit or Xcode behavior.
2. macOS CI runs `swift test` and compiles code inside `canImport(HealthKit)`. This catches Apple SDK
   API/compiler drift but does not prove authorization or background delivery.
3. Xcode on a signed app and physical iPhone verifies entitlements, Health permission copy,
   authorization UX, Weight Gurus samples, protected-data transitions, anchor persistence,
   background delivery, networking, and token storage in Keychain.

No Linux result will be described as validating Apple behavior.

### Authentication and privacy

V1 uses one opaque high-entropy bearer token per provisioned device. Only its SHA-256 hash and a
non-secret hint are stored in D1. The clear token is shown once during provisioning and belongs in
the iOS Keychain. Tokens travel only over HTTPS, are never logged, and can be revoked with
`revoked_at`. Device ID and installation ID must both match the authenticated device record.

Health data is sensitive. Collect only explicitly supported types, keep source metadata allowlisted,
avoid request-body logging and analytics, restrict D1/operator access, encrypt transport and device
storage, and define retention/export/erasure policy before production. This slice has no user-facing
consent flow and is not production approval.

### Idempotency, deletion, and reconciliation

`(device_id, request_id)` uniquely identifies an upload replay; the stored result is returned with
`status: replayed`. `(device_id, sample_id)` uniquely identifies a sample. Re-uploading a sample
does not duplicate or overwrite it.

HealthKit deleted-object UUIDs create durable tombstones and soft-delete an existing sample. A
tombstone arriving before its sample prevents later reconciliation from resurrecting it. This is
deliberately conservative: correction is represented as deletion plus a new HealthKit UUID.
Tombstones must outlive the maximum reconciliation window. A later maintenance policy may hard-delete
sample payloads while retaining the minimal tombstone.

An ingestion request records the opaque HealthKit anchor for observability only. The Apple client
must advance its locally persisted anchor only after a successful response. The server does not
interpret anchors.

### Eventual background sync

The first app integration will wrap `HKAnchoredObjectQuery` behind `AnchoredBodyMassReading`, upload
batches of at most 500 changes, then commit the new anchor. Foreground manual sync comes first.
Background delivery is a later device-verified enhancement using HealthKit background delivery and
`BGProcessingTask`; it must tolerate coalescing, cancellation, locked protected data, expiration,
offline retries, and token revocation. No guarantee of immediate background execution is made.

### D1 atomicity boundary

D1 does not expose an interactive transaction through this adapter. Ingestion therefore uses one
bounded `D1Database.batch()` containing the request claim, per-item outcome staging, mutations,
counter persistence, and final read. D1 executes a batch sequentially and rolls the entire batch
back if any statement fails. Every mutation is also gated by the freshly generated sync-run ID, so
only the winner of the unique `(device_id, request_id)` claim can mutate data. A concurrent loser
reads the winner's durable counters as a replay. JSON table functions keep the batch to a small,
constant number of statements instead of one query per payload item.

This invariant depends specifically on D1 batch atomicity; the repository must not be ported to an
adapter whose `batch` is merely pipelining. Miniflare adapter tests exercise concurrent claims,
deletion/sample serialization, exact replay counters, and monotonic tombstones against a real D1
binding implementation.

## Consequences

The API is small, stable, replay-safe, and testable without Apple tooling. Request item outcomes are
retained as a minimal audit trail beneath each sync run; retention/erasure policy must cover them.

V1 supports body mass only. Adding quantity types requires an explicit contract/unit migration,
rather than accepting arbitrary HealthKit identifiers or units.
