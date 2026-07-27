import { Database } from '@server/db'
import { tasks } from '@server/db/schema'
import { toPaginatedResponse, withPagination } from '@server/lib/pagination'
import { ApiError } from '@shared/api/errors'
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
  ) => Effect.Effect<TaskListResponse, ApiError.Internal>
  readonly get: (
    id: string,
  ) => Effect.Effect<
    TaskResponse,
    ApiError.NotFound | ApiError.Internal
  >
  readonly create: (
    body: TaskCreateBody,
  ) => Effect.Effect<TaskResponse, ApiError.Internal>
  readonly update: (
    id: string,
    body: TaskUpdateBody,
  ) => Effect.Effect<
    TaskResponse,
    ApiError.NotFound | ApiError.Internal
  >
  readonly remove: (
    id: string,
  ) => Effect.Effect<
    { readonly success: true },
    ApiError.NotFound | ApiError.Internal
  >
}

export class TaskService extends Context.Tag(
  '@server/modules/task/TaskService',
)<TaskService, TaskServiceShape>() {}

export const TaskServiceLive = Layer.effect(
  TaskService,
  Effect.gen(function* () {
    const database = yield* Database
    const run = <A>(operation: () => Promise<A>) =>
      Effect.tryPromise(operation).pipe(
        Effect.tapError((cause) => Effect.logError(cause)),
        Effect.mapError(() => ApiError.internal()),
      )

    return {
      list: (query) =>
        run(async () => {
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
        }),
      get: (id) =>
        run(() =>
          database
            .select({ ...getTableColumns(tasks) })
            .from(tasks)
            .where(eq(tasks.id, id)),
        ).pipe(
          Effect.flatMap((data) =>
            data[0]
              ? Effect.succeed({ data: data[0] })
              : Effect.fail(
                  ApiError.notFound(`Task with id ${id} not found`),
                ),
          ),
        ),
      create: (body) =>
        run(() =>
          database
            .insert(tasks)
            .values(body)
            .returning({ ...getTableColumns(tasks) }),
        ).pipe(
          Effect.flatMap((data) =>
            data[0]
              ? Effect.succeed({ data: data[0] })
              : Effect.fail(ApiError.internal()),
          ),
        ),
      update: (id, body) =>
        run(() =>
          database
            .update(tasks)
            .set(body)
            .where(eq(tasks.id, id))
            .returning({ ...getTableColumns(tasks) }),
        ).pipe(
          Effect.flatMap((data) =>
            data[0]
              ? Effect.succeed({ data: data[0] })
              : Effect.fail(
                  ApiError.notFound(`Task with id ${id} not found`),
                ),
          ),
        ),
      remove: (id) =>
        run(() =>
          database
            .delete(tasks)
            .where(eq(tasks.id, id))
            .returning({ id: tasks.id }),
        ).pipe(
          Effect.flatMap((data) =>
            data[0]
              ? Effect.succeed({ success: true as const })
              : Effect.fail(
                  ApiError.notFound(`Task with id ${id} not found`),
                ),
          ),
        ),
    } satisfies TaskServiceShape
  }),
)
