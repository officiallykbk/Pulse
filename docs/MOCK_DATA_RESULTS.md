# Mock-data resilience baseline

Measured on 9 November 2026 against [https://pulse-ghana.pages.dev](https://pulse-ghana.pages.dev) and Supabase project `qpfikeadhisvkzlodwij`.

## Loaded dataset

The `medium` profile is active:

| Entity | Rows |
|---|---:|
| Synthetic Auth users / profiles | 250 |
| Videos | 5,000 |
| Comments | 50,000 |
| Likes | 100,000 |
| Comment likes | 50,000 |
| Follows | 8,000 |
| Saved videos | 20,000 |
| Watch progress rows | 20,000 |
| Unique video views | 50,000 |
| Reports | 1,000 |
| Feedback | 500 |
| Subscriptions | 50 |

Video workflow coverage includes 4,450 published, 250 ready, 200 pending-review, and 100 rejected records. Visibility coverage includes 4,800 public, 100 private, and 100 age-restricted records. Five profiles are banned; admin and moderator roles are represented.

Forty generated media objects are uploaded: 12 MP4 clips, 12 WebP posters, and 16 WebP avatars. Mock database URLs use the same-origin `/media/` edge route.

## Database execution baseline

`EXPLAIN ANALYZE` on the loaded project:

| Query | Database execution time |
|---|---:|
| Feed first page | 0.18 ms |
| Feed offset 4,000 | 5.19 ms |
| Full-text search, 30 results | 28.16 ms |
| Profile enrichment, 25 profiles | 9.77 ms |

The database indexes are functioning. The measured end-to-end latency is dominated by network/edge delivery rather than PostgreSQL execution.

## Load-test observations

Initial test: 300 requests per scenario, concurrency 20.

- All non-media scenarios returned zero HTTP errors.
- Direct Supabase media had 1.33% transport errors and an 18.37 s p95.
- The executor network showed high variance across otherwise fast database queries.

After adding the cached same-origin media route, a bounded comparison used 80 requests per scenario, concurrency 10, and a 10 s request timeout:

| Scenario | Error rate | p95 |
|---|---:|---:|
| Pages homepage | 0% | 1.27 s |
| Session Function | 0% | 7.55 s |
| Feed first page | 0% | 1.24 s |
| Feed offset 4,000 | 0% | 2.76 s |
| Profile enrichment | 0% | 1.81 s |
| Full-text search | 0% | 2.02 s |
| Cached edge media range | 0% | 2.26 s |
| Direct Supabase media range | 11.25% | 10.02 s timeout ceiling |

The edge media route returned `206 Partial Content`, `CF-Cache-Status: HIT`, and `Cache-Control: public, max-age=31536000, immutable`. It eliminated the observed media errors, though the strict 2 s p95 budget was still narrowly missed from this executor.

## Current conclusion

- Functional resilience is good at the tested dataset size: feeds, deep pagination, search, profiles, Functions, and media continued to return valid responses.
- Database execution is not the present bottleneck.
- Direct Supabase public-object delivery is unsuitable as the final high-volume video path for this deployment.
- The Cloudflare media route is a strong staging improvement, but production should still move video delivery to the planned dedicated CDN and be measured from Ghanaian mobile networks.
- The benchmark intentionally exits non-zero while latency/error budgets are missed; it should remain a regression signal rather than having its thresholds loosened to make runs pass.

## Verification

- Mock password login succeeds for the generated test account stored in `.mock-data/credentials.json`.
- TypeScript typecheck passes.
- Production build passes.
- 329 tests across 46 files pass.
