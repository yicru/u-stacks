# Disposable reference patterns

Open `/reference` after starting the app. It reads the existing tasks table; add tasks on `/` when the database is empty. Selecting a task does not change it. Complete and Reopen update the same tasks shown on `/`.

## Data loading

**List first** starts the page and summary independently in the browser. The route awaits only the page, returning the summary Promise to TanStack Router's `Await` component. The client renders the list before the summary resolves. A summary failure displays an inline error without hiding the list; a page failure uses the route error UI. There is no synthetic delay or request timeout. With small data, both reads may finish before any placeholder is visible.

**Wait for both** uses the overview endpoint. `ReferenceService.overview` runs page and summary reads with `Effect.all` and concurrency 2. They use two database requests, without a dependency between them; this is different from the sequential transaction inside libSQL `batch`. Browser navigation makes one aggregate HTTP API request. These independent reads are not a transaction and can observe different database states during concurrent writes. Use a transaction or batch when consistency between the results matters.

Pages remain client-rendered. Loaders use `createClientOnlyFn` and the private Effect HTTP client; API handlers use the existing Database Layer and shared memo map. Loader abort signals propagate to the Effect runner; obsolete browser reads are canceled. Already-submitted SQL is not rolled back by cancellation. No results are cached globally across users or requests.

## Cursor pagination and grouped retrieval

The page endpoint fetches at most `limit + 1` rows and returns a next cursor only when another row exists. It does not calculate total counts or use OFFSET. The existing `(created_at, id)` index supports the descending order and tuple comparison. The cursor contains both values, so timestamp ties and deletion of the anchor do not require an extra lookup. It is URL-safe base64 JSON validated by Effect Schema, not a signed credential or a snapshot of the database. Keep the sort values immutable and include any filters or sort version in the cursor when extending this pattern.

The cursor fields use `Schema.optional`: both an absent property and an explicit `undefined` represent the first page, and the HTTP client omits the query parameter. The API rejects invalid supplied strings with 400 before any database access. The service uses an Effect-returning decoder so a malformed cursor from a direct service caller is logged and becomes a typed `InternalError` instead of an unhandled defect.

The lookup endpoint accepts at most 20 IDs, deduplicates them, retrieves them with one `IN` query, and restores requested order. Missing IDs are reported separately. This is the same bulk-fetch pattern to use before joining parent results to related rows, instead of issuing one query per displayed item. The limits bound response and parameter sizes; they do not impose a waiting-time ceiling.

The summary intentionally scans the task population to compute exact totals; it illustrates secondary data whose cost grows with the database. The cursor page stays bounded, but this aggregate does not. Check `db.reference.page`, `db.reference.summary`, and `db.reference.lookup` spans, plus `db.query` logs. Compare request counts, data size, CPU and latency before choosing an aggregate endpoint, streaming, or batching. Small local fixtures do not establish production latency gains.

## Mutation refresh

After an update, the reference screen awaits `router.invalidate({ sync: true, filter })`. The filter includes both `/reference` and `/`, since both own task data, while excluding unrelated routes. `sync` waits for the critical loader data; deferred summary data may still be pending. Keep dependent summary/detail routes in the filter as the application grows. Independent page state is reset by the cursor key instead of a synchronization effect.

State updates after an awaited action are wrapped in another `startTransition`, following [React's async Transition guidance](https://react.dev/reference/react/useTransition#react-doesnt-treat-my-state-update-after-await-as-a-transition).

## Contract tests

Service tests use an actual in-memory SQLite database. The HTTP round-trip test connects `HttpApiClient` to the real Web handler through `FetchHttpClient.Fetch`, exercising query encoding, middleware, SQL and response decoding together. It covers an explicit `undefined` cursor, the next page and decoded dates without a test-only production wrapper. Incoming invalid-request tests use raw HTTP requests because a generated client rejects invalid input before sending it.

## Remove the reference implementation

Delete these five paths from the application directory:

```text
src/routes/reference.tsx
src/routes/api/reference/
src/features/reference/
server/modules/reference/
shared/api/reference/
```

Then run `pnpm run build` to regenerate the route tree and `pnpm run quality`. No API registry, runtime registration, package dependency, environment binding or database migration needs to be removed. Keep `server/handler.ts` and `server/http-api-handler.ts`: they still serve the original application and own shared API composition and metrics/error handling. The optional README section and this guide can also be deleted.

The reference uses a compiler-separated server implementation in its own API route. Server imports do not reach browser code. The normal `/api/*` bridge, AppApi, existing task services and database schema remain independent of the reference.

See [TanStack deferred data loading](https://tanstack.com/router/latest/docs/guide/deferred-data-loading), [SQLite cursor queries](https://www.sqlite.org/rowvalue.html#scrolling_window_queries), and [Drizzle IN queries](https://orm.drizzle.team/docs/operators#inarray).
