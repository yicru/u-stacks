import { Effect } from 'effect'
import { describe, expect, it } from 'vite-plus/test'
import { makeApiClient } from './api-client'

describe('shared Effect API client', () => {
  it('uses the current origin when no API URL is configured', async () => {
    const requests: string[] = []
    const fetch: typeof globalThis.fetch = async (input) => {
      requests.push(input instanceof Request ? input.url : input.toString())
      return Response.json({ message: 'ok' })
    }
    const client = makeApiClient({ fetch })
    const response = await Effect.runPromise(client.healthCheck.check())
    const url = new URL(requests[0] ?? '')
    expect(url.origin).toBe(globalThis.location.origin)
    expect(url.pathname).toBe('/api/health-check')
    expect(response).toEqual({ message: 'ok' })
  })

  it('uses the configured API origin and decodes shared validation errors', async () => {
    const requests: string[] = []
    const validationError = {
      code: 'VALIDATION_ERROR',
      message: 'Validation Error',
      detail: [{ kind: 'query', message: 'Invalid query' }],
    }
    const fetch: typeof globalThis.fetch = async (input) => {
      requests.push(input instanceof Request ? input.url : input.toString())
      return Response.json(validationError, { status: 400 })
    }
    const client = makeApiClient({ baseUrl: 'http://shadow.test', fetch })
    const error = await Effect.runPromise(
      client.healthCheck.check().pipe(Effect.flip),
    )
    expect(new URL(requests[0] ?? '').origin).toBe('http://shadow.test')
    expect(error).toEqual(validationError)
  })
})
