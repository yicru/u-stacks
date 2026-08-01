import { Schema } from 'effect'
import {
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiSchema,
} from 'effect/unstable/httpapi'
import { InternalError, NotFoundError } from './errors'
import { PaginationMeta, PaginationQuery } from './pagination'

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
  title: Schema.String.check(Schema.isMinLength(1)),
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

export class TaskApi extends HttpApiGroup.make('tasks')
  .add(
    HttpApiEndpoint.get('getTasks', '/tasks', {
      query: TaskListQuery,
      success: TaskListResponse,
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
