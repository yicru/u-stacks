import { hc } from 'hono/client'
import type { AppType } from '../../server'

export const apiClient = hc<AppType>('', {
  fetch: ((input, init) => {
    return fetch(input, {
      ...init,
      credentials: 'include',
    })
  }) satisfies typeof fetch,
})
