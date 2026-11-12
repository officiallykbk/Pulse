# Mock data and resilience testing

The mock-data tooling creates clearly marked synthetic records in a selected Supabase project. It is intended for staging and load testing, not for a database containing real users.

## Safety model

- Every run requires `--apply`, `--yes`, and the exact Supabase project reference.
- Synthetic emails use the reserved `example.test` domain.
- Synthetic titles, comments, reports, feedback, and profile bios are marked `[MOCK]`.
- Cleanup targets only marked records and mock identities.
- Generated credentials and media are stored under ignored `.mock-data/`.
- Supabase secrets are read from `.env` and are never printed.

## Dataset profiles

| Profile | Users | Videos | Comments | Likes | Purpose |
|---|---:|---:|---:|---:|---|
| `smoke` | 25 | 200 | 800 | 1,500 | Fast functional checks |
| `medium` | 250 | 5,000 | 50,000 | 100,000 | Default staging resilience test |
| `large` | 1,000 | 25,000 | 250,000 | 500,000 | Explicit capacity test |

Each profile also creates follows, comment reactions, saves, watch progress, viewing insights, unique views, reports, feedback, and subscriptions. The video population includes published, ready, pending-review, rejected, private, and age-restricted cases.

## Seed

Preview the operation without writing:

```powershell
npm.cmd run seed:mock -- --scale medium
```

Apply it to the configured project:

```powershell
npm.cmd run seed:mock -- --scale medium --project-ref <project-ref> --apply --yes
```

The first run generates small vertical MP4 clips, posters, and avatars with FFmpeg, uploads them to the existing mock folders in Supabase Storage, and records one reusable test login in `.mock-data/credentials.json`.

Refresh only the generated media and its long-lived cache metadata:

```powershell
npm.cmd run seed:mock -- --media-only --project-ref <project-ref> --apply --yes
```

## Benchmark

Run the read-only concurrency benchmark against the deployed app and Supabase public APIs:

```powershell
npm.cmd run benchmark:platform -- --target https://pulse-ghana.pages.dev --requests 300 --concurrency 20
```

Use `--timeout-ms 15000` (the default) to bound stalled network requests during saturation tests.

The benchmark measures the Pages homepage, session Function, feed pagination, deep offsets, profile enrichment, full-text search, cached edge media ranges, and direct-origin media ranges. It reports error rate, p50, p95, p99, throughput, and status distribution, and exits non-zero when thresholds are exceeded.

## Cleanup

Remove synthetic database records and Auth users while keeping reusable media:

```powershell
npm.cmd run seed:mock -- --cleanup --project-ref <project-ref> --apply --yes
```

Add `--purge-media` to remove the mock Storage objects as well.
