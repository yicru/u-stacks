import { Effect, Layer, Schema } from 'effect'
import { afterAll, describe, expect, it } from 'vite-plus/test'
import {
  TaskService,
  type TaskServiceShape,
} from '@server/modules/task/service'
import {
  InternalError,
  NotFoundError,
  ValidationError,
} from '@shared/api/errors'
import { TaskListResponse } from '@shared/api/task'
import { makeApiHandler } from './handler'
import type { ApiRequestMetrics } from './http-api-handler'

const task = {
  id: 'task_1',
  title: 'Effect API',
  done: false,
  createdAt: new Date('2026-07-28T00:00:00.000Z'),
  updatedAt: new Date('2026-07-28T00:00:00.000Z'),
}

const taskServiceTest = {
  list: ({ page, perPage }) =>
    Effect.succeed({
      data: [task],
      meta: { page, perPage, total: 1, totalPages: 1 },
    }),
  get: (id) =>
    id === task.id
      ? Effect.succeed({ data: task })
      : Effect.fail(NotFoundError.makeNotFound(`Task with id ${id} not found`)),
  create: (body) => Effect.succeed({ data: { ...task, ...body } }),
  update: (id, body) =>
    id === task.id
      ? Effect.succeed({ data: { ...task, ...body } })
      : Effect.fail(NotFoundError.makeNotFound(`Task with id ${id} not found`)),
  remove: (id) =>
    id === task.id
      ? Effect.succeed({ success: true as const })
      : Effect.fail(NotFoundError.makeNotFound(`Task with id ${id} not found`)),
} satisfies TaskServiceShape

const TaskServiceTest = Layer.succeed(TaskService, taskServiceTest)

const taskServiceFailure = {
  list: () => Effect.fail(InternalError.makeInternal()),
  get: () => Effect.fail(InternalError.makeInternal()),
  create: () => Effect.fail(InternalError.makeInternal()),
  update: () => Effect.fail(InternalError.makeInternal()),
  remove: () => Effect.fail(InternalError.makeInternal()),
} satisfies TaskServiceShape

const TaskServiceFailure = Layer.succeed(TaskService, taskServiceFailure)

function makeGate() {
  let resolve = () => {}
  const promise = new Promise<void>((complete) => {
    resolve = () => complete()
  })
  return { promise, resolve }
}

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
    const body = Schema.decodeUnknownSync(ValidationError)(
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

  it('isolates overlapping request metrics and omits IDs and query values', async () => {
    const started = makeGate()
    const release = makeGate()
    const metrics: ApiRequestMetrics[] = []
    const server = makeApiHandler(
      Layer.succeed(TaskService, {
        ...taskServiceTest,
        get: () =>
          Effect.promise(async () => {
            started.resolve()
            await release.promise
            return { data: task }
          }),
      }),
      { onRequest: (metric) => metrics.push(metric) },
    )
    try {
      const slow = server.handler(
        new Request(
          'http://localhost/api/tasks/private-task-id?token=private-query-value',
        ),
      )
      await started.promise
      await server.handler(new Request('http://localhost/api/health-check'))
      await server.handler(new Request('http://localhost/api/private-path'))
      release.resolve()
      await slow

      expect(
        metrics.map(({ route, status, outcome }) => ({
          route,
          status,
          outcome,
        })),
      ).toEqual([
        { route: '/api/health-check', status: 200, outcome: 'success' },
        { route: 'unmatched', status: 404, outcome: 'client_error' },
        { route: '/api/tasks/:id', status: 200, outcome: 'success' },
      ])
      expect(
        metrics.every(
          ({ durationMs }) => Number.isFinite(durationMs) && durationMs >= 0,
        ),
      ).toBe(true)
      expect(JSON.stringify(metrics)).not.toMatch(/private-/)
    } finally {
      release.resolve()
      await server.dispose()
    }
  })

  it('records aborted requests separately from server failures', async () => {
    const started = makeGate()
    const metrics: ApiRequestMetrics[] = []
    const server = makeApiHandler(
      Layer.succeed(TaskService, {
        ...taskServiceFailure,
        list: () =>
          Effect.sync(() => started.resolve()).pipe(
            Effect.andThen(Effect.never),
          ),
      }),
      { onRequest: (metric) => metrics.push(metric) },
    )
    try {
      const controller = new AbortController()
      const request = server.handler(
        new Request('http://localhost/api/tasks', {
          signal: controller.signal,
        }),
      )
      await started.promise
      controller.abort()
      await request.catch(() => undefined)

      await server.handler(new Request('http://localhost/api/tasks/task_1'))
      expect(metrics.map(({ route, outcome }) => ({ route, outcome }))).toEqual(
        [
          { route: '/api/tasks', outcome: 'aborted' },
          { route: '/api/tasks/:id', outcome: 'server_error' },
        ],
      )
      expect(metrics[1]?.status).toBe(500)
    } finally {
      await server.dispose()
    }
  })

  it('preserves HTTP responses when the metrics sink throws', async () => {
    const server = makeApiHandler(TaskServiceTest, {
      onRequest: () => {
        throw new Error('Metrics unavailable')
      },
    })
    try {
      const response = await server.handler(
        new Request('http://localhost/api/health-check'),
      )
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ message: 'ok' })
    } finally {
      await server.dispose()
    }
  })
})
