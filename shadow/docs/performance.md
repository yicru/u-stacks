# Performance conventions

## Japan placement

`cloudflare.config.ts` places the Worker near Tokyo with `placement.region = 'aws:ap-northeast-1'`. This is a Cloudflare execution hint, not an AWS deployment or a strict data residency guarantee. Static assets continue to be served near the visitor.

Setup prints the Turso group table, including locations. Select a Japan group. Without an explicit group, database creation prompts for a location and defaults to `aws-ap-northeast-1`; legacy Tokyo groups can use `nrt`. An existing group's primary location is preserved. Check existing or manually configured databases with `turso db show <database-name>` and keep the database and Worker near each other. Setup does not relocate an existing database.

See [Workers placement](https://developers.cloudflare.com/workers/configuration/placement/) and [Turso regions](https://turso.tech/blog/turso-cloud-new-regions).

## Worker build

`vite.config.ts` enables Oxc minification only for the `ssr` build environment. This reduces Worker output without changing development transforms or browser asset settings. Oxc is included in Vite, so no additional minifier dependency is required.

A local comparison on 2026-10-05 used the same source and dependencies, changing only this build setting. Across the 11 Worker JavaScript files, output decreased from 2,667,240 to 985,096 bytes (63.1%). The sum of individually gzipped files at compression level 6 decreased from 600,051 to 309,387 bytes (48.4%). All 143 browser asset files, including fonts, had identical paths and SHA-256 hashes.

The build used for this comparison passed local Worker preview checks for page rendering, task CRUD, invalid input (400), and missing tasks (404). Pages now remain client-rendered. Bundle size is not a startup-time measurement; compare cold and warm production requests in Cloudflare Observability before claiming a latency improvement. See [Vite build minification](https://vite.dev/config/build-options#build-minify).

## Cloudflare Observability

Workers Logs and Traces are enabled. Traces sample 1% of requests. Cloudflare automatically traces outbound fetches, including libSQL HTTP requests; no additional observability SDK or export service is required.

Logs explicitly sample 100% of requests. Each API call emits one `api.request` JSON summary with `method`, the matched `route` template, `status`, `outcome`, and `durationMs`. The Effect router supplies the template, so IDs and query values are omitted; unknown endpoints use `unmatched`. Outcomes distinguish success, HTTP client errors, server failures, and requests whose signal was aborted. A thrown request without a response has no HTTP status. Logging failures do not change the response.

Use [Query Builder](https://developers.cloudflare.com/workers/observability/query-builder/) to filter `event = api.request`, group by `method` and `route`, and display Count, P50, and P95 of `durationMs`. Compute HTTP 5xx rates from summary statuses, and inspect `server_error` and `aborted` separately. Include sample counts and compare the same routes and deployment versions. Do not calculate whole-application error rates from 1% traces, and defer P99 until enough observations are available. Logs remain subject to Cloudflare's retention and collection limits.

`durationMs` measures API handling through creation of the Web Response, including initial API Layer setup. It does not measure delivery of a streaming body or browser paint. Native Workers Metrics and invocation logs already provide CPU time, wall time, runtime outcomes, and deployment metadata. Compare HTML shell requests separately from API requests. Wall time can include post-response work, and a successful Worker invocation can still return HTTP 500. Workers clocks may report zero for CPU-only spans because they advance around I/O; use native CPU metrics for computation costs.

`server/observability.ts` uses the native [Custom spans API](https://developers.cloudflare.com/workers/observability/traces/custom-spans/). API requests have an `api.handle` span. Database operations have `db.tasks.list`, `db.tasks.get`, and corresponding write spans. New modules use `DatabaseTracing` and receive the Cloudflare implementation through their production Layer. Keep SQL parameters, tokens, record contents, and raw database exceptions out of custom span attributes and exception events.

Each database operation also emits one `db.query` JSON summary with its fixed `operation`, `outcome`, and `durationMs`. This covers API service calls. Group these logs by operation to compare latency without depending on trace sampling. The duration includes Drizzle work, network round trips, database execution, and result mapping; it is not SQL engine time. Use sampled fetch spans to inspect HTTP round-trip counts. A single database operation can contain multiple SQL statements or fetches, so counting `db.query` events is not a SQL or HTTP request counter. Do not subtract overlapping child spans to infer CPU costs.

After deployment, open the Worker's Observability traces in the Cloudflare dashboard. Compare cold and warm requests separately. Expand a database span to inspect outbound request count and duration. Long network spans with short query execution point to placement or round trips; repeated spans suggest duplicate fetches or N+1 queries. Temporarily raise the sampling rate when diagnosing low-traffic applications, then restore the normal setting. Local execution validates the API integration, but does not prove dashboard ingestion or production latency.

## Initial data and navigation

The task reference page and all its loading modes stay client-rendered. `src/start.ts` disables SSR by default, and the root route explicitly sets `ssr: false` for all child pages. The HTML shell renders only metadata, styles, and bootstrap scripts on the server; it does not run page loaders or query the database. Keep the `noindex` meta tag in that shell.

Page loaders use `createClientOnlyFn` and the Effect HTTP client in the browser. Do not opt pages into SSR or introduce server-side page data loading. API handlers reuse the production Layers and memo map in `server/runtime.ts`, including the database client. Pass `abortController.signal` to the Effect runner so interrupted navigation cancels client fetches. Cancellation does not roll back a database operation already submitted to libSQL.

Completed intent preloads are reused for 30 seconds. After a mutation, await `router.invalidate({ sync: true })` to refresh the visible data even during that interval. Keep user-specific data in the router/request scope rather than a module-global result cache. When adding authentication, route changes between users must clear cached loader data.

## Browser operation timing

Task mutations create native User Timing measures named `task.create.refresh`, `task.update.refresh`, and `task.delete.refresh`. Each starts immediately before the mutation and ends after the awaited router invalidation; failures carry `detail.outcome = error`. This measures mutation plus loader refresh, not the exact React commit or paint time. Only the latest entry for each operation is retained, and unsupported or failing timing APIs do not change mutation behavior.

Record a Performance trace in browser DevTools and inspect its User Timing tracks, or run `performance.getEntriesByType('measure').filter(entry => entry.name.startsWith('task.'))` in the console. The measures contain no task IDs or content and are not uploaded. This provides local diagnostics without a telemetry endpoint or background exporter.

When a deployed application needs real-user page performance, enable [Cloudflare Web Analytics](https://developers.cloudflare.com/web-analytics/data-metrics/core-web-vitals/) for that site's LCP, INP, and CLS. The starter does not hardcode a site's analytics token or add a browser SDK. INP measures the next paint after an interaction, not the complete network and loader-refresh wait measured above. Add custom RUM delivery or isolated runtime-initialization instrumentation only when those diagnostics are needed.

## Database and concurrency

Task lists use one `database.batch` for the bounded page and total count. The libSQL driver sends both statements in one HTTP request and maps their results through Drizzle. Batch statements execute sequentially within a transaction; this reduces requests and keeps the page and count consistent, but does not make SQL execute in parallel. Benchmark workloads before replacing expensive independent queries with a batch.

The `(created_at, id)` index supports the newest-first order by scanning backwards. The additive migration preserves existing tasks. Add an equivalent index when defining tables for generated modules. For large histories, choose cursor pagination and an extra row for `hasNext` when an exact total is unnecessary; the starter's page-number contract remains unchanged.

Fetch related rows with joins or bulk `IN` queries before introducing per-item requests. For independent external operations, use `Effect.all` or `Effect.forEach` with an explicit concurrency limit. Choose the limit from the upstream service and measured workload. Reuse repeated lookups within one request; cross-request caches need explicit expiry and mutation invalidation. Poll only active data, pause while hidden, and abort obsolete requests.
