import type { AppType } from '@server/index'
import { hc } from 'hono/client'

export const apiClient = hc<AppType>(import.meta.env.VITE_API_URL ?? '')
