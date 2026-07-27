import { Effect, Layer, Schema } from 'effect'
import { afterAll, describe, expect, it } from 'vitest'
import {
  TaskService,
  type TaskServiceShape,
} from '@server/modules/task/service'
import { ApiError } from '@shared/api/errors'
import { TaskListResponse } from '@shared/api/task'
import { makeApiHandler } from './handler'

const task = {
  id: 'task_1',
  title: 'Effect API',
  done: false,
  createdAt: new Date('2026-07-28T00:00:00.000Z'),
  updatedAt: new Date('2026-07-28T00:00:00.000Z'),
}

const TaskServiceTest = Layer.succeed(TaskService, {
  list: ({ page, perPage }) =>
    Effect.succeed({
      data: [task],
      meta: { page, perPage, total: 1, totalPages: 1 },
    }),
  get: (id) =>
    id === task.id
      ? Effect.succeed({ data: task })
      : Effect.fail(ApiError.notFound(`Task with id ${id} not found`)),
  create: (body) => Effect.succeed({ data: { ...task, ...body } }),
  update: (id, body) =>
    id === task.id
      ? Effect.succeed({ data: { ...task, ...body } })
      : Effect.fail(ApiError.notFound(`Task with id ${id} not found`)),
  remove: (id) =>
    id === task.id
      ? Effect.succeed({ success: true })
      : Effect.fail(ApiError.notFound(`Task with id ${id} not found`)),
} satisfies TaskServiceShape)

const TaskServiceFailure = Layer.succeed(TaskService, {
  list: () => Effect.fail(ApiError.internal()),
  get: () => Effect.fail(ApiError.internal()),
  create: () => Effect.fail(ApiError.internal()),
  update: () => Effect.fail(ApiError.internal()),
  remove: () => Effect.fail(ApiError.internal()),
} satisfies TaskServiceShape)

describe('Effect API handler', () => {
  const { handler, dispose } = makeApiHandler(TaskServiceTest)

  afterAll(() => dispose())

  it('serves the existing health check endpoint', async () => {
    const response = await handler(
      new Request('http://localhost/api/health-check'),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ message: 'ok' })
  })

  it('serves the existing task list contract', async () => {
    const response = await handler(
      new Request('http://localhost/api/tasks?page=2&perPage=25'),
    )
    const body = Schema.decodeUnknownSync(TaskListResponse)(
      await response.json(),
    )

    expect(response.status).toBe(200)
    expect(body.meta).toEqual({
      page: 2,
      perPage: 25,
      total: 1,
      totalPages: 1,
    })
  })

  it('returns 201 for task creation', async () => {
    const response = await handler(
      new Request('http://localhost/api/tasks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'Created' }),
      }),
    )

    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({
      data: { title: 'Created' },
    })
  })

  it('gets a task by id', async () => {
    const response = await handler(
      new Request('http://localhost/api/tasks/task_1'),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      data: { id: 'task_1' },
    })
  })

  it('updates a task by id', async () => {
    const response = await handler(
      new Request('http://localhost/api/tasks/task_1', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ done: true }),
      }),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      data: { id: 'task_1', done: true },
    })
  })

  it('removes a task by id', async () => {
    const response = await handler(
      new Request('http://localhost/api/tasks/task_1', {
        method: 'DELETE',
      }),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true })
  })

  it('normalizes request decode failures', async () => {
    const response = await handler(
      new Request('http://localhost/api/tasks?page=0'),
    )
    const body = Schema.decodeUnknownSync(ApiError.Validation)(
      await response.json(),
    )

    expect(response.status).toBe(400)
    expect(body).toMatchObject({
      code: 'VALIDATION_ERROR',
      message: 'Validation Error',
    })
    expect(Array.isArray(body.detail)).toBe(true)
  })

  it('returns the existing not found envelope', async () => {
    const response = await handler(
      new Request('http://localhost/api/tasks/missing'),
    )

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({
      code: 'NOT_FOUND',
      message: 'Task with id missing not found',
    })
  })

  it('normalizes an unknown endpoint', async () => {
    const response = await handler(new Request('http://localhost/api/unknown'))

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({
      code: 'NOT_FOUND',
      message: 'The requested endpoint /api/unknown was not found',
    })
  })

  it('returns the existing internal error envelope', async () => {
    const failureServer = makeApiHandler(TaskServiceFailure)
    const response = await failureServer.handler(
      new Request('http://localhost/api/tasks'),
    )

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'Internal Server Error',
    })
    await failureServer.dispose()
  })
})
