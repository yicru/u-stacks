import { hc } from 'hono/client'
import { env } from '@/lib/env'
import type { AppType } from '../../server'

export const apiClient = hc<AppType>(env.NEXT_PUBLIC_APP_URL, {
  fetch: ((input, init) => {
    return fetch(input, {
      ...init,
      credentials: 'include',
    })
  }) satisfies typeof fetch,
})
