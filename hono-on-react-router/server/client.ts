import { hc } from 'hono/client'
import { clientEnv } from '../lib/env'
import type { AppType } from '../types/server'

export const client = hc<AppType>(clientEnv.VITE_API_URL)
