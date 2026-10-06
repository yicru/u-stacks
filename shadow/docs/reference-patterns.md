# Task reference implementation

The task module is the template's single disposable reference implementation. Open `/` to create, complete and delete tasks. Its Data loading control switches between **Basic list**, **List first** and **Wait for both** on the same page and database. The latter two modes also show cursor navigation, exact totals and grouped retrieval. Selecting a task does not change it.

The shared contract lives in `shared/api/examples/task/`, its server implementation and table in `server/examples/task/`, and its browser UI and loaders in `src/examples/task/`. Each `examples` directory owns disposable implementations and their tests. Application modules use `shared/api/{name}.ts`, `server/modules/{name}/` and `src/features/{name}/`; the module generator keeps those application paths. `TaskApi`, `TaskService` and `src/lib/api-client.ts` serve every mode through the same `/api/*` bridge.

| Mode          | URL               | Initial browser requests                           | Database behavior                                                 |
| ------------- | ----------------- | -------------------------------------------------- | ----------------------------------------------------------------- |
| Basic list    | `/`               | `GET /api/tasks`                                   | Page-number list and total count in one transactional batch       |
| List first    | `/?mode=stream`   | `GET /api/tasks/page` and `GET /api/tasks/summary` | Independent reads; the list can render before the summary         |
| Wait for both | `/?mode=parallel` | `GET /api/tasks/overview`                          | Independent reads with concurrency 2; the response waits for both |

All modes use the same create and update endpoints. Delete is available in Basic list. Grouped lookup uses `POST /api/tasks/lookup`; IDs are not individual HTTP requests.

## Data loading

**List first** starts the page and summary independently in the browser. The route awaits only the page, returning the summary Promise to TanStack Router's `Await` component. The client renders the list before the summary resolves. A summary failure displays an inline error without hiding the list; a page failure uses the route error UI. Navigation cancellation has its own summary state. When returning to cached list data, the canceled summary shows the loading placeholder until the refreshed loader replaces it. There is no synthetic delay or request timeout. With small data, both reads may finish before any placeholder is visible.

**Wait for both** uses the overview endpoint. `TaskService.overview` runs page and summary reads with `Effect.all` and concurrency 2. They use two database requests, without a dependency between them; this is different from the sequential transaction inside libSQL `batch`. Browser navigation makes one aggregate HTTP API request. These independent reads are not a transaction and can observe different database states during concurrent writes. Use a transaction or batch when consistency between the results matters.

Pages remain client-rendered. Loaders use `createClientOnlyFn` and the shared Effect HTTP client; API handlers use the existing Database Layer and shared memo map. Loader abort signals propagate to the Effect runner; obsolete browser reads are canceled. Already-submitted SQL is not rolled back by cancellation. No results are cached globally across users or requests.

## Cursor pagination and grouped retrieval

The page endpoint fetches at most `limit + 1` rows and returns a next cursor only when another row exists. It does not calculate total counts or use OFFSET. The existing `(created_at, id)` index supports the descending order and tuple comparison. The cursor contains both values, so timestamp ties and deletion of the anchor do not require an extra lookup. It is URL-safe base64 JSON validated by Effect Schema, not a signed credential or a snapshot of the database. Keep the sort values immutable and include any filters or sort version in the cursor when extending this pattern.

The cursor fields use `Schema.optional`: both an absent property and an explicit `undefined` represent the first page, and the HTTP client omits the query parameter. The API rejects invalid supplied strings with 400 before any database access. The service uses an Effect-returning decoder so a malformed cursor from a direct service caller is logged and becomes a typed `InternalError` instead of an unhandled defect.

The lookup endpoint accepts at most 20 IDs, deduplicates them, retrieves them with one `IN` query, and restores requested order. Missing IDs are reported separately. This is the same bulk-fetch pattern to use before joining parent results to related rows, instead of issuing one query per displayed item. The limits bound response and parameter sizes; they do not impose a waiting-time ceiling.

The summary intentionally scans the task population to compute exact totals; it illustrates secondary data whose cost grows with the database. The cursor page stays bounded, but this aggregate does not. Check `db.tasks.page`, `db.tasks.summary`, and `db.tasks.lookup` spans, plus `db.query` logs. Compare request counts, data size, CPU and latency before choosing an aggregate endpoint, streaming, or batching. Small local fixtures do not establish production latency gains.

## Mutation refresh

After a create, update or delete, the task screen awaits `router.invalidate({ sync: true, filter })`. The filter includes `/`, which owns every task loading mode, and excludes unrelated routes. `sync` waits for the critical loader data; deferred summary data may still be pending. Keep dependent summary/detail routes in the filter as the application grows. Independent page state is reset by the cursor key instead of a synchronization effect.

State updates after an awaited action are wrapped in another `startTransition`, following [React's async Transition guidance](https://react.dev/reference/react/useTransition#react-doesnt-treat-my-state-update-after-await-as-a-transition).

## Contract tests

Service tests use an actual in-memory SQLite database. The HTTP round-trip test connects `HttpApiClient` to the real Web handler through `FetchHttpClient.Fetch`, exercising query encoding, middleware, SQL and response decoding together. It covers an explicit `undefined` cursor, the next page and decoded dates without a test-only production wrapper. Incoming invalid-request tests use raw HTTP requests because a generated client rejects invalid input before sending it.

## Remove the reference implementation

Remove the complete task example when starting your application, including the CRUD that was present before the advanced patterns:

```text
src/examples/
server/examples/
shared/api/examples/
```

Replace `src/routes/index.tsx` with your own landing page. For a minimal SPA placeholder, use:

```tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: () => <main>Ready for your application</main>,
})
```

Remove the task registration at these four composition points:

1. `shared/api/index.ts`: remove the `TaskApi` import and `.add(TaskApi)`; keep the health check and schema-error middleware.
2. `server/handler.ts`: remove the `TaskHandlersLive` import and make `ApiHandlersLive` use only `HealthCheckHandlersLive`. The factory derives its service requirements from this Layer, so its signature needs no task-specific edit.
3. `server/runtime.ts`: remove the task and database imports, keep the shared memo map, and set `ApiServicesProduction = Layer.empty`. Keep `server/index.ts` and its request metrics unchanged.
4. `server/db/schema.ts`: remove the task table re-export. Use `export {}` until your own module exports a table here.

Task-specific contract, HTTP, client and loader tests are inside the three `examples` directories and are removed with them. Shared HTTP and client tests stay in `server/http-api-handler.test.ts` and `src/lib/api-client.test.ts`; they cover response normalization, metrics isolation and privacy, cancellation, failing metrics sinks, and client URL/error behavior without task dependencies. The generated route tree is regenerated by `pnpm run build`; do not edit it manually. Keep `src/start.ts`, the root route's `ssr: false` and `noindex`, the normal `/api/*` bridge, and the shared HTTP handler and observability code.

For a fresh application that has never applied migrations, remove `drizzle/` as well and generate the initial migrations after defining your own tables. The included SQL and snapshots belong to the task example. For a database that has already applied them, preserve its migration history and data; generate and review an additive migration when replacing its tables. Removing source files does not authorize dropping production tables. See [database migration procedures](database-migrations.md).

Run `pnpm run build`, `pnpm run lint` and `pnpm run test` after removing the example. The shared database Layer, pagination and date helpers remain available for your own modules; Fallow can report them as unused until the replacement modules consume them. Remove unused infrastructure and dependencies if your application does not need them, then run `pnpm run quality`. Remove the README's reference section and this guide once they no longer apply.

See [TanStack deferred data loading](https://tanstack.com/router/latest/docs/guide/deferred-data-loading), [SQLite cursor queries](https://www.sqlite.org/rowvalue.html#scrolling_window_queries), and [Drizzle IN queries](https://orm.drizzle.team/docs/operators#inarray).
