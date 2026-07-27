import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { Effect, Layer } from 'effect'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Database } from '@server/db'
import * as schema from '@server/db/schema'
import { TaskService, TaskServiceLive } from './service'

describe('TaskService', () => {
  let close: () => void
  let TestLive: Layer.Layer<TaskService>

  beforeEach(async () => {
    const client = createClient({ url: ':memory:' })
    close = () => client.close()
    await client.execute(`
      CREATE TABLE tasks (
        id TEXT PRIMARY KEY NOT NULL,
        title TEXT NOT NULL,
        done INTEGER DEFAULT 0 NOT NULL,
        created_at INTEGER DEFAULT (unixepoch()) NOT NULL,
        updated_at INTEGER DEFAULT (unixepoch()) NOT NULL
      )
    `)
    const database = drizzle(client, { schema })
    TestLive = TaskServiceLive.pipe(
      Layer.provide(Layer.succeed(Database, database)),
    )
  })

  afterEach(() => close())

  it('creates, lists, updates, gets, and removes a task', async () => {
    const program = Effect.gen(function* () {
      const service = yield* TaskService
      const created = yield* service.create({ title: 'Effect API' })
      const listed = yield* service.list({ page: 1, perPage: 10 })
      const updated = yield* service.update(created.data.id, {
        done: true,
      })
      const found = yield* service.get(created.data.id)
      const removed = yield* service.remove(created.data.id)
      return { created, listed, updated, found, removed }
    }).pipe(Effect.provide(TestLive))

    const result = await Effect.runPromise(program)

    expect(result.listed.meta.total).toBe(1)
    expect(result.updated.data.done).toBe(true)
    expect(result.found.data.id).toBe(result.created.data.id)
    expect(result.removed).toEqual({ success: true })
  })

  it('fails with NOT_FOUND for a missing task', async () => {
    const exit = await Effect.runPromiseExit(
      Effect.flatMap(TaskService, (service) =>
        service.get('missing'),
      ).pipe(Effect.provide(TestLive)),
    )

    expect(exit._tag).toBe('Failure')
    if (exit._tag === 'Failure') {
      expect(String(exit.cause)).toContain('NOT_FOUND')
    }
  })

  it('maps a database rejection to INTERNAL_ERROR', async () => {
    close()
    close = () => undefined

    const exit = await Effect.runPromiseExit(
      Effect.flatMap(TaskService, (service) =>
        service.list({ page: 1, perPage: 10 }),
      ).pipe(Effect.provide(TestLive)),
    )

    expect(exit._tag).toBe('Failure')
    if (exit._tag === 'Failure') {
      expect(String(exit.cause)).toContain('INTERNAL_ERROR')
    }
  })
})
