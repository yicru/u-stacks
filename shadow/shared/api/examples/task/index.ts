import { Effect, Result, Schema } from 'effect'
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from 'effect/http-api'
import { InternalError, NotFoundError } from '../../errors'
import { PaginationMeta, PaginationQuery } from '../../pagination'

export const Task = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  done: Schema.Boolean,
  createdAt: Schema.DateFromString,
  updatedAt: Schema.DateFromString,
})
export type Task = typeof Task.Type

const TaskListQuery = PaginationQuery
export type TaskListQuery = typeof TaskListQuery.Type

export const TaskListResponse = Schema.Struct({
  data: Schema.Array(Task),
  meta: PaginationMeta,
})
export type TaskListResponse = typeof TaskListResponse.Type

const TaskPath = Schema.Struct({
  id: Schema.String.check(Schema.isMinLength(1)),
})

export const TaskCreateBody = Schema.Struct({
  title: Schema.String.check(
    Schema.isMinLength(1, { message: 'Title is required' }),
  ),
  done: Schema.optionalKey(Schema.Boolean),
})
export type TaskCreateBody = typeof TaskCreateBody.Type

export const TaskUpdateBody = Schema.Struct({
  title: Schema.optionalKey(Schema.String.check(Schema.isMinLength(1))),
  done: Schema.optionalKey(Schema.Boolean),
})
export type TaskUpdateBody = typeof TaskUpdateBody.Type

const TaskResponse = Schema.Struct({
  data: Task,
})
export type TaskResponse = typeof TaskResponse.Type

const TaskDeleteResponse = Schema.Struct({
  success: Schema.Literal(true),
})

const Cursor = Schema.StringFromBase64Url.pipe(
  Schema.decodeTo(
    Schema.fromJsonString(
      Schema.Struct({
        createdAt: Schema.DateFromString,
        id: Schema.String.check(Schema.isMinLength(1)),
      }),
    ),
  ),
)

export const decodeCursor = Schema.decodeUnknownEffect(Cursor)
export const encodeCursor = Schema.encodeSync(Cursor)

const CursorToken = Schema.String.check(
  Schema.isMaxLength(512),
  Schema.makeFilter(
    (value) => Result.isSuccess(Schema.decodeUnknownResult(Cursor)(value)),
    { message: 'Invalid task cursor' },
  ),
)

export const TaskSearch = Schema.Struct({
  cursor: Schema.optional(CursorToken),
  mode: Schema.Literals(['basic', 'stream', 'parallel']).pipe(
    Schema.withDecodingDefaultTypeKey(Effect.succeed('basic')),
  ),
})

const TaskPageQuery = Schema.Struct({
  cursor: Schema.optional(CursorToken),
  limit: Schema.NumberFromString.check(
    Schema.isInt(),
    Schema.isBetween({ minimum: 1, maximum: 20 }),
  ).pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(10))),
})
export type TaskPageQuery = typeof TaskPageQuery.Type

const TaskPage = Schema.Struct({
  data: Schema.Array(Task),
  nextCursor: Schema.NullOr(CursorToken),
})
export type TaskPage = typeof TaskPage.Type

const TaskSummary = Schema.Struct({
  total: Schema.Natural,
  open: Schema.Natural,
  done: Schema.Natural,
})
export type TaskSummary = typeof TaskSummary.Type

const TaskOverview = Schema.Struct({
  page: TaskPage,
  summary: TaskSummary,
})
export type TaskOverview = typeof TaskOverview.Type

const TaskLookupBody = Schema.Struct({
  ids: Schema.Array(Schema.String.check(Schema.isMinLength(1))).check(
    Schema.isMinLength(1),
    Schema.isMaxLength(20),
  ),
})

const TaskLookup = Schema.Struct({
  data: Schema.Array(Task),
  missingIds: Schema.Array(Schema.String),
})
export type TaskLookup = typeof TaskLookup.Type

export class TaskApi extends HttpApiGroup.make('tasks')
  .add(
    HttpApiEndpoint.get('getTasks', '/tasks', {
      query: TaskListQuery,
      success: TaskListResponse,
      error: InternalError,
    }),
  )
  .add(
    HttpApiEndpoint.get('getTaskPage', '/tasks/page', {
      query: TaskPageQuery,
      success: TaskPage,
      error: InternalError,
    }),
  )
  .add(
    HttpApiEndpoint.get('getTaskSummary', '/tasks/summary', {
      success: TaskSummary,
      error: InternalError,
    }),
  )
  .add(
    HttpApiEndpoint.get('getTaskOverview', '/tasks/overview', {
      query: TaskPageQuery,
      success: TaskOverview,
      error: InternalError,
    }),
  )
  .add(
    HttpApiEndpoint.post('lookupTasks', '/tasks/lookup', {
      payload: TaskLookupBody,
      success: TaskLookup,
      error: InternalError,
    }),
  )
  .add(
    HttpApiEndpoint.get('getTask', '/tasks/:id', {
      params: TaskPath,
      success: TaskResponse,
      error: [NotFoundError, InternalError],
    }),
  )
  .add(
    HttpApiEndpoint.post('createTask', '/tasks', {
      payload: TaskCreateBody,
      success: TaskResponse.pipe(HttpApiSchema.status(201)),
      error: InternalError,
    }),
  )
  .add(
    HttpApiEndpoint.put('updateTask', '/tasks/:id', {
      params: TaskPath,
      payload: TaskUpdateBody,
      success: TaskResponse,
      error: [NotFoundError, InternalError],
    }),
  )
  .add(
    HttpApiEndpoint.delete('deleteTask', '/tasks/:id', {
      params: TaskPath,
      success: TaskDeleteResponse,
      error: [NotFoundError, InternalError],
    }),
  ) {}
