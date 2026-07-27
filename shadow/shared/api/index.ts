import {
  HttpApi,
  HttpApiEndpoint,
  HttpApiGroup,
} from '@effect/platform'
import { ApiError } from './errors'
import { HealthCheckResponse } from './health-check'
import {
  TaskCreateBody,
  TaskDeleteResponse,
  TaskListQuery,
  TaskListResponse,
  TaskPath,
  TaskResponse,
  TaskUpdateBody,
} from './task'

export class HealthCheckApi extends HttpApiGroup.make(
  'healthCheck',
).add(
  HttpApiEndpoint.get('check', '/health-check').addSuccess(
    HealthCheckResponse,
  ),
) {}

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

export class ShadowApi extends HttpApi.make('shadow')
  .add(HealthCheckApi)
  .add(TaskApi)
  .addError(ApiError.Validation, { status: 400 })
  .prefix('/api') {}
