import { createClient } from '@libsql/client'
import { env } from 'cloudflare:workers'
import { drizzle } from 'drizzle-orm/libsql'
import { Effect, Layer } from 'effect'
import { Database } from './index'
import * as schema from './schema'

export const DatabaseLive = Layer.effect(
  Database,
  Effect.acquireRelease(
    Effect.sync(() => {
      const client = createClient({
        url: env.TURSO_DATABASE_URL,
        authToken: env.TURSO_AUTH_TOKEN || undefined,
      })
      return {
        client,
        database: drizzle(client, { schema }),
      }
    }),
    ({ client }) => Effect.sync(() => client.close()),
  ).pipe(Effect.map(({ database }) => database)),
)
