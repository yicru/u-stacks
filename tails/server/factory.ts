import { Hono } from 'hono'

export const createApp = () => {
  return new Hono<{ Bindings: CloudflareEnv }>()
}
