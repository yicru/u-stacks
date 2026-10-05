import { readFileSync, writeFileSync } from 'node:fs'
import { z } from 'zod'

const productionTarget = z.object({ hostname: z.string().min(1) })
const remoteEndpoint = z.object({
  protocol: z.enum(['libsql:', 'https:']),
  hostname: z
    .string()
    .min(1)
    .toLowerCase()
    .transform((hostname) => hostname.replace(/\.$/, ''))
    .refine(
      (hostname) =>
        !/^(localhost|.*\.localhost|\[::1\]|127\..*|0\.0\.0\.0)$/.test(
          hostname,
        ),
    )
    .refine((hostname) => !hostname.includes('%')),
  username: z.literal(''),
  password: z.literal(''),
  port: z.literal(''),
  pathname: z.enum(['', '/']),
  search: z.literal(''),
  hash: z.literal(''),
})

export function pinProductionDatabase(
  databaseUrl: string,
  targetPath: URL,
): void {
  const hostname = remoteDatabaseHostname(databaseUrl)
  writeFileSync(targetPath, `${JSON.stringify({ hostname }, null, 2)}\n`)
}

export function productionDatabaseCredentials(targetPath: URL): {
  url: string
  authToken: string
} {
  const url = process.env.TURSO_DATABASE_URL?.trim()
  const authToken = process.env.TURSO_AUTH_TOKEN?.trim()

  if (!url || !authToken) {
    throw new Error(
      'TURSO_DATABASE_URL and TURSO_AUTH_TOKEN are required for production migrations.',
    )
  }

  const hostname = remoteDatabaseHostname(url)
  if (hostname !== readProductionDatabaseHostname(targetPath)) {
    throw new Error(
      'Production database does not match turso.production.json. Review the pinned target before migrating.',
    )
  }

  return { url, authToken }
}

function readProductionDatabaseHostname(targetPath: URL): string {
  try {
    return productionTarget.parse(JSON.parse(readFileSync(targetPath, 'utf-8')))
      .hostname
  } catch {
    throw new Error(
      'Pin a valid production database hostname in turso.production.json before migrating.',
    )
  }
}

function remoteDatabaseHostname(databaseUrl: string): string {
  try {
    return remoteEndpoint.parse(new URL(databaseUrl)).hostname
  } catch {
    throw new Error(
      'Production Turso URL must be a remote libsql:// or https:// endpoint without credentials, port, path, query, or fragment.',
    )
  }
}
