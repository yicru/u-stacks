import { Database } from '@server/db'
import { tasks } from '@server/db/schema'
import { toPaginatedResponse, withPagination } from '@server/lib/pagination'
import { InternalError, NotFoundError } from '@shared/api/errors'
import type {
  TaskCreateBody,
  TaskListQuery,
  TaskListResponse,
  TaskResponse,
  TaskUpdateBody,
} from '@shared/api/task'
import { count, eq, getTableColumns } from 'drizzle-orm'
import { Context, Effect, Layer } from 'effect'

export interface TaskServiceShape {
  readonly list: (
    query: TaskListQuery,
  ) => Effect.Effect<TaskListResponse, InternalError>
  readonly get: (
    id: string,
  ) => Effect.Effect<TaskResponse, NotFoundError | InternalError>
  readonly create: (
    body: TaskCreateBody,
  ) => Effect.Effect<TaskResponse, InternalError>
  readonly update: (
    id: string,
    body: TaskUpdateBody,
  ) => Effect.Effect<TaskResponse, NotFoundError | InternalError>
  readonly remove: (
    id: string,
  ) => Effect.Effect<{ readonly success: true }, NotFoundError | InternalError>
}

export class TaskService extends Context.Service<
  TaskService,
  TaskServiceShape
>()('@server/modules/task/TaskService') {
  static readonly Live = Layer.effect(
    TaskService,
    Effect.gen(function* () {
      const database = yield* Database

      const run = <A>(operation: () => Promise<A>) =>
        Effect.tryPromise(operation).pipe(
          Effect.tapError((cause) => Effect.logError(cause)),
          Effect.mapError(() => InternalError.makeInternal()),
        )

      return {
        list: Effect.fn('TaskService.list')(function* (query: TaskListQuery) {
          return yield* run(async () => {
            const selection = database
              .select({ ...getTableColumns(tasks) })
              .from(tasks)
            const [data, totals] = await Promise.all([
              withPagination(selection.$dynamic(), query),
              database.select({ total: count() }).from(tasks),
            ])
            return toPaginatedResponse(data, {
              page: query.page,
              perPage: query.perPage,
              total: totals[0]?.total ?? 0,
            })
          })
        }),
        get: Effect.fn('TaskService.get')(function* (id: string) {
          const data = yield* run(() =>
            database
              .select({ ...getTableColumns(tasks) })
              .from(tasks)
              .where(eq(tasks.id, id)),
          )
          if (!data[0]) {
            return yield* Effect.fail(
              NotFoundError.makeNotFound(`Task with id ${id} not found`),
            )
          }
          return { data: data[0] }
        }),
        create: Effect.fn('TaskService.create')(function* (
          body: TaskCreateBody,
        ) {
          const data = yield* run(() =>
            database
              .insert(tasks)
              .values(body)
              .returning({ ...getTableColumns(tasks) }),
          )
          if (!data[0]) {
            return yield* Effect.fail(InternalError.makeInternal())
          }
          return { data: data[0] }
        }),
        update: Effect.fn('TaskService.update')(function* (
          id: string,
          body: TaskUpdateBody,
        ) {
          const data = yield* run(() =>
            database
              .update(tasks)
              .set(body)
              .where(eq(tasks.id, id))
              .returning({ ...getTableColumns(tasks) }),
          )
          if (!data[0]) {
            return yield* Effect.fail(
              NotFoundError.makeNotFound(`Task with id ${id} not found`),
            )
          }
          return { data: data[0] }
        }),
        remove: Effect.fn('TaskService.remove')(function* (id: string) {
          const data = yield* run(() =>
            database
              .delete(tasks)
              .where(eq(tasks.id, id))
              .returning({ id: tasks.id }),
          )
          if (!data[0]) {
            return yield* Effect.fail(
              NotFoundError.makeNotFound(`Task with id ${id} not found`),
            )
          }
          return { success: true as const }
        }),
      } satisfies TaskServiceShape
    }),
  )
}

export const TaskServiceLive = TaskService.Live
