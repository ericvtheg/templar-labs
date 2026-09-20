# Upload contract v1

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
