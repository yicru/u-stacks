import { hc } from 'hono/client'
import { clientEnv } from '../lib/env'
import type { AppType } from '../types/server'

type ClientParams = {
  token?: string | null
}

export const createClient = (params: ClientParams = {}) => {
  return hc<AppType>(clientEnv.VITE_API_URL, {
    headers: {
      Authorization: params.token ? `Bearer ${params.token}` : '',
    },
  })
}
