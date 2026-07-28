import { HttpApiEndpoint, HttpApiGroup } from '@effect/platform'
import { Schema } from 'effect'
import { ApiError } from './errors'
import { PaginationMeta, PaginationQuery } from './pagination'

export const Task = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  done: Schema.Boolean,
  createdAt: Schema.DateFromString,
  updatedAt: Schema.DateFromString,
})
export type Task = Schema.Schema.Type<typeof Task>

export const TaskListQuery = PaginationQuery
export type TaskListQuery = Schema.Schema.Type<typeof TaskListQuery>

export const TaskListResponse = Schema.Struct({
  data: Schema.Array(Task),
  meta: PaginationMeta,
})
export type TaskListResponse = Schema.Schema.Type<typeof TaskListResponse>

export const TaskPath = Schema.Struct({
  id: Schema.String.pipe(Schema.minLength(1)),
})
export type TaskPath = Schema.Schema.Type<typeof TaskPath>

export const TaskCreateBody = Schema.Struct({
  title: Schema.String.pipe(Schema.minLength(1)),
  done: Schema.optional(Schema.Boolean),
})
export type TaskCreateBody = Schema.Schema.Type<typeof TaskCreateBody>

export const TaskUpdateBody = Schema.Struct({
  title: Schema.optional(Schema.String.pipe(Schema.minLength(1))),
  done: Schema.optional(Schema.Boolean),
})
export type TaskUpdateBody = Schema.Schema.Type<typeof TaskUpdateBody>

export const TaskResponse = Schema.Struct({ data: Task })
export type TaskResponse = Schema.Schema.Type<typeof TaskResponse>

export const TaskDeleteResponse = Schema.Struct({
  success: Schema.Literal(true),
})
export type TaskDeleteResponse = Schema.Schema.Type<typeof TaskDeleteResponse>

export class TaskApi extends HttpApiGroup.make('tasks')
  .add(
    HttpApiEndpoint.get('list', '/tasks')
      .setUrlParams(TaskListQuery)
      .addSuccess(TaskListResponse)
      .addError(ApiError.Internal, { status: 500 }),
  )
  .add(
    HttpApiEndpoint.get('get', '/tasks/:id')
      .setPath(TaskPath)
      .addSuccess(TaskResponse)
      .addError(ApiError.NotFound, { status: 404 })
      .addError(ApiError.Internal, { status: 500 }),
  )
  .add(
    HttpApiEndpoint.post('create', '/tasks')
      .setPayload(TaskCreateBody)
      .addSuccess(TaskResponse, { status: 201 })
      .addError(ApiError.Internal, { status: 500 }),
  )
  .add(
    HttpApiEndpoint.put('update', '/tasks/:id')
      .setPath(TaskPath)
      .setPayload(TaskUpdateBody)
      .addSuccess(TaskResponse)
      .addError(ApiError.NotFound, { status: 404 })
      .addError(ApiError.Internal, { status: 500 }),
  )
  .add(
    HttpApiEndpoint.del('remove', '/tasks/:id')
      .setPath(TaskPath)
      .addSuccess(TaskDeleteResponse)
      .addError(ApiError.NotFound, { status: 404 })
      .addError(ApiError.Internal, { status: 500 }),
  ) {}
