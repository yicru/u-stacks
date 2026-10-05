import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { eq } from 'drizzle-orm'
import { Effect, Layer } from 'effect'
import { FetchHttpClient } from 'effect/http'
import { HttpApiClient } from 'effect/http-api'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { Database } from '@server/db'
import * as schema from '@server/db/schema'
import { DatabaseTracing } from '@server/db/tracing'
import { ReferenceApi } from '@shared/api/reference'
import { makeReferenceHandler } from './handler'
import { ReferenceService } from './service'

describe('reference data patterns', () => {
  let client: ReturnType<typeof createClient>
  let database: Database['Service']
  let service: Layer.Layer<ReferenceService>

  beforeEach(async () => {
    client = createClient({ url: ':memory:' })
    await client.execute(
      'CREATE TABLE tasks (id TEXT PRIMARY KEY, title TEXT NOT NULL, done INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)',
    )
    database = drizzle(client, { schema })
    const older = new Date('2026-10-01T00:00:00Z')
    const newer = new Date('2026-10-02T00:00:00Z')
    const latest = new Date('2026-10-03T00:00:00Z')
    await database.insert(schema.tasks).values([
      { id: 'older', title: 'Older', createdAt: older, updatedAt: older },
      { id: 'new-a', title: 'New A', createdAt: newer, updatedAt: newer },
      {
        id: 'new-z',
        title: 'New Z',
        done: true,
        createdAt: newer,
        updatedAt: newer,
      },
      { id: 'latest', title: 'Latest', createdAt: latest, updatedAt: latest },
    ])
    service = ReferenceService.Live.pipe(
      Layer.provide(Layer.succeed(Database, database)),
    )
  })

  afterEach(() => client.close())

  it('keeps cursor pages stable across tied timestamps, new tasks and a removed anchor', async () => {
    const execute = vi.spyOn(client, 'execute')
    const first = await Effect.runPromise(
      Effect.flatMap(ReferenceService, (reference) =>
        reference.page({ limit: 2 }),
      ).pipe(Effect.provide(service)),
    )
    expect(execute).toHaveBeenCalledTimes(1)
    expect(first.data.map((task) => task.id)).toEqual(['latest', 'new-z'])
    expect(first.nextCursor).not.toBeNull()

    await database.delete(schema.tasks).where(eq(schema.tasks.id, 'new-z'))
    await database.insert(schema.tasks).values({
      id: 'newest',
      title: 'Newest',
      createdAt: new Date('2026-10-04T00:00:00Z'),
      updatedAt: new Date('2026-10-04T00:00:00Z'),
    })

    const second = await Effect.runPromise(
      Effect.flatMap(ReferenceService, (reference) =>
        reference.page({ limit: 2, cursor: first.nextCursor ?? undefined }),
      ).pipe(Effect.provide(service)),
    )
    expect(second.data.map((task) => task.id)).toEqual(['new-a', 'older'])
    expect(second.nextCursor).toBeNull()
  })

  it('retrieves unique IDs in input order with one database request and reports missing tasks', async () => {
    const execute = vi.spyOn(client, 'execute')
    const result = await Effect.runPromise(
      Effect.flatMap(ReferenceService, (reference) =>
        reference.lookup(['older', 'latest', 'older', 'missing']),
      ).pipe(Effect.provide(service)),
    )
    expect(result.data.map((task) => task.id)).toEqual(['older', 'latest'])
    expect(result.missingIds).toEqual(['missing'])
    expect(execute).toHaveBeenCalledTimes(1)
  })

  it('starts both overview reads before waiting for either one', async () => {
    const started = new Set<string>()
    let release = () => {}
    const bothStarted = new Promise<void>((resolve) => {
      release = resolve
    })
    const concurrent = ReferenceService.Live.pipe(
      Layer.provide(Layer.succeed(Database, database)),
      Layer.provide(
        Layer.succeed(DatabaseTracing, {
          query: async (name, operation) => {
            started.add(name)
            if (started.size === 2) release()
            await bothStarted
            return operation()
          },
        }),
      ),
    )
    const result = await Effect.runPromise(
      Effect.flatMap(ReferenceService, (reference) =>
        reference.overview({ limit: 2 }),
      ).pipe(Effect.provide(concurrent)),
    )
    expect(result.page.data.map((task) => task.id)).toEqual(['latest', 'new-z'])
    expect(result.summary).toEqual({ total: 4, open: 3, done: 1 })
  })

  it('returns zero totals for an empty database', async () => {
    await database.delete(schema.tasks)
    const result = await Effect.runPromise(
      Effect.flatMap(ReferenceService, (reference) => reference.summary()).pipe(
        Effect.provide(service),
      ),
    )
    expect(result).toEqual({ total: 0, open: 0, done: 0 })
  })

  it.each(['invalid', ''])(
    'fails with a typed service error for malformed cursor %j before accessing the database',
    async (cursor) => {
      const execute = vi.spyOn(client, 'execute')
      const error = await Effect.runPromise(
        Effect.flatMap(ReferenceService, (reference) =>
          reference.page({ limit: 2, cursor }),
        ).pipe(Effect.provide(service), Effect.flip),
      )
      expect(error).toMatchObject({ code: 'INTERNAL_ERROR' })
      expect(execute).not.toHaveBeenCalled()
    },
  )

  it('validates cursor, page size and lookup bounds before accessing the database', async () => {
    const api = makeReferenceHandler(service)
    const execute = vi.spyOn(client, 'execute')
    try {
      const requests = [
        new Request('http://localhost/api/reference/tasks?cursor=invalid'),
        new Request('http://localhost/api/reference/tasks?cursor='),
        new Request('http://localhost/api/reference/tasks?limit=0'),
        new Request('http://localhost/api/reference/tasks?limit=21'),
        new Request('http://localhost/api/reference/lookup', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ids: [] }),
        }),
        new Request('http://localhost/api/reference/lookup', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            ids: Array.from({ length: 21 }, (_, index) => `id-${index}`),
          }),
        }),
      ]
      for (const request of requests) {
        const response = await api.handler(request)
        expect(response.status).toBe(400)
        expect(await response.json()).toMatchObject({
          code: 'VALIDATION_ERROR',
        })
      }
      expect(execute).not.toHaveBeenCalled()
    } finally {
      await api.dispose()
    }
  })

  it('round-trips an undefined cursor, cursor pages and dates through the generated HTTP client', async () => {
    const api = makeReferenceHandler(service)
    const fetch: typeof globalThis.fetch = (input, init) =>
      api.handler(new Request(input, init))
    const client = Effect.runSync(
      HttpApiClient.make(ReferenceApi, { baseUrl: 'http://localhost' }).pipe(
        Effect.provide(
          FetchHttpClient.layer.pipe(
            Layer.provide(Layer.succeed(FetchHttpClient.Fetch, fetch)),
          ),
        ),
      ),
    )
    try {
      const first = await Effect.runPromise(
        client.reference.getPage({ query: { cursor: undefined, limit: 2 } }),
      )
      expect(first.data.map((task) => task.id)).toEqual(['latest', 'new-z'])
      expect(first.data[0]?.createdAt).toEqual(new Date('2026-10-03T00:00:00Z'))
      expect(first.nextCursor).not.toBeNull()
      const second = await Effect.runPromise(
        client.reference.getPage({
          query: { cursor: first.nextCursor ?? undefined, limit: 2 },
        }),
      )
      expect(second.data.map((task) => task.id)).toEqual(['new-a', 'older'])
      expect(second.nextCursor).toBeNull()
    } finally {
      await api.dispose()
    }
  })
})
