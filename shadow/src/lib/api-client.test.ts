import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'
import { makeApiClient } from './api-client'

const task = {
  id: 'task_1',
  title: 'Effect client',
  done: false,
  createdAt: '2026-07-28T00:00:00.000Z',
  updatedAt: '2026-07-28T00:00:00.000Z',
}

describe('Effect API client', () => {
  it('uses the current origin when no API URL is configured', async () => {
    const requests: Array<string> = []
    const fetch: typeof globalThis.fetch = async (input) => {
      requests.push(input instanceof Request ? input.url : input.toString())
      return Response.json({
        data: [],
        meta: {
          page: 1,
          perPage: 10,
          total: 0,
          totalPages: 0,
        },
      })
    }
    const client = makeApiClient({ fetch })

    await Effect.runPromise(
      client.tasks.getTasks({
        query: { page: 1, perPage: 10 },
      }),
    )

    const url = new URL(requests[0] ?? '')
    expect(url.origin).toBe(globalThis.location.origin)
    expect(url.pathname).toBe('/api/tasks')
    expect(url.searchParams.get('page')).toBe('1')
    expect(url.searchParams.get('perPage')).toBe('10')
  })

  it('encodes task list query parameters and decodes dates', async () => {
    const requests: Array<Request> = []
    const fetch: typeof globalThis.fetch = async (input, init) => {
      requests.push(new Request(input, init))
      return Response.json({
        data: [task],
        meta: {
          page: 2,
          perPage: 25,
          total: 1,
          totalPages: 1,
        },
      })
    }
    const client = makeApiClient({
      baseUrl: 'http://shadow.test',
      fetch,
    })

    const response = await Effect.runPromise(
      client.tasks.getTasks({
        query: { page: 2, perPage: 25 },
      }),
    )

    const url = new URL(requests[0]?.url ?? '')
    expect(url.pathname).toBe('/api/tasks')
    expect(url.searchParams.get('page')).toBe('2')
    expect(url.searchParams.get('perPage')).toBe('25')
    expect(response.data[0]?.createdAt).toEqual(new Date(task.createdAt))
  })

  it('sends create payloads with the existing endpoint contract', async () => {
    const requests: Array<Request> = []
    const fetch: typeof globalThis.fetch = async (input, init) => {
      requests.push(new Request(input, init))
      return Response.json(
        {
          data: {
            ...task,
            title: 'Created',
          },
        },
        { status: 201 },
      )
    }
    const client = makeApiClient({
      baseUrl: 'http://shadow.test',
      fetch,
    })

    const response = await Effect.runPromise(
      client.tasks.createTask({
        payload: { title: 'Created' },
      }),
    )

    expect(requests[0]?.method).toBe('POST')
    expect(await requests[0]?.json()).toEqual({
      title: 'Created',
    })
    expect(response.data.title).toBe('Created')
  })

  it('decodes structured non-success responses', async () => {
    const fetch: typeof globalThis.fetch = async () =>
      Response.json(
        {
          code: 'NOT_FOUND',
          message: 'Task with id missing not found',
        },
        { status: 404 },
      )
    const client = makeApiClient({
      baseUrl: 'http://shadow.test',
      fetch,
    })

    const error = await Effect.runPromise(
      client.tasks.getTask({ params: { id: 'missing' } }).pipe(Effect.flip),
    )

    expect(error).toEqual({
      code: 'NOT_FOUND',
      message: 'Task with id missing not found',
    })
  })
})
