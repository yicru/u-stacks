import { Effect } from 'effect'
import { count, desc, getTableColumns, inArray, sql } from 'drizzle-orm'
import type { Database } from '@server/db'
import { tasks } from './schema'
import { InternalError } from '@shared/api/errors'
import {
  decodeCursor,
  encodeCursor,
  type TaskPageQuery,
} from '@shared/api/examples/task'

export function makeTaskQueries(
  database: Database['Service'],
  run: <A>(
    name: string,
    operation: () => Promise<A>,
  ) => Effect.Effect<A, InternalError>,
) {
  const page = Effect.fn('TaskService.page')(function* (query: TaskPageQuery) {
    const cursor =
      query.cursor !== undefined
        ? yield* decodeCursor(query.cursor).pipe(
            Effect.tapError((cause) => Effect.logError(cause)),
            Effect.mapError(() => InternalError.makeInternal()),
          )
        : undefined
    const rows = yield* run('tasks.page', () =>
      database
        .select({ ...getTableColumns(tasks) })
        .from(tasks)
        .where(
          cursor
            ? sql`(${tasks.createdAt}, ${tasks.id}) < (${Math.floor(cursor.createdAt.getTime() / 1000)}, ${cursor.id})`
            : undefined,
        )
        .orderBy(desc(tasks.createdAt), desc(tasks.id))
        .limit(query.limit + 1),
    )
    const data = rows.slice(0, query.limit)
    const last = data.at(-1)
    return {
      data,
      nextCursor:
        rows.length > query.limit && last
          ? encodeCursor({ createdAt: last.createdAt, id: last.id })
          : null,
    }
  })

  const summary = Effect.fn('TaskService.summary')(function* () {
    const rows = yield* run('tasks.summary', () =>
      database
        .select({
          total: count(),
          done: sql<number>`coalesce(sum(case when ${tasks.done} then 1 else 0 end), 0)`.mapWith(
            Number,
          ),
        })
        .from(tasks),
    )
    const { total, done } = rows[0]
    return { total, done, open: total - done }
  })

  return {
    page,
    summary,
    overview: Effect.fn('TaskService.overview')(function* (
      query: TaskPageQuery,
    ) {
      return yield* Effect.all(
        { page: page(query), summary: summary() },
        { concurrency: 2 },
      )
    }),
    lookup: Effect.fn('TaskService.lookup')(function* (
      ids: ReadonlyArray<string>,
    ) {
      const uniqueIds = [...new Set(ids)]
      if (uniqueIds.length === 0) return { data: [], missingIds: [] }
      const rows = yield* run('tasks.lookup', () =>
        database
          .select({ ...getTableColumns(tasks) })
          .from(tasks)
          .where(inArray(tasks.id, uniqueIds)),
      )
      const byId = new Map(rows.map((task) => [task.id, task]))
      return {
        data: uniqueIds.flatMap((id) => {
          const task = byId.get(id)
          return task ? [task] : []
        }),
        missingIds: uniqueIds.filter((id) => !byId.has(id)),
      }
    }),
  }
}
