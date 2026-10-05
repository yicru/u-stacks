import { readFileSync, writeFileSync } from 'node:fs'
import { Schema, SchemaTransformation } from 'effect'

const productionTarget = Schema.fromJsonString(
  Schema.Struct({ hostname: Schema.NonEmptyString }),
)
const remoteEndpoint = Schema.Struct({
  protocol: Schema.Literals(['libsql:', 'https:']),
  hostname: Schema.String.pipe(
    Schema.decodeTo(
      Schema.NonEmptyString.check(
        Schema.makeFilter(
          (hostname) =>
            !/^(localhost|.*\.localhost|\[::1\]|127\..*|0\.0\.0\.0)$/.test(
              hostname,
            ) && !hostname.includes('%'),
        ),
      ),
      SchemaTransformation.transform({
        decode: (hostname) => hostname.toLowerCase().replace(/\.$/, ''),
        encode: (hostname) => hostname,
      }),
    ),
  ),
  username: Schema.Literal(''),
  password: Schema.Literal(''),
  port: Schema.Literal(''),
  pathname: Schema.Literals(['', '/']),
  search: Schema.Literal(''),
  hash: Schema.Literal(''),
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
    return Schema.decodeUnknownSync(productionTarget)(
      readFileSync(targetPath, 'utf-8'),
    ).hostname
  } catch {
    throw new Error(
      'Pin a valid production database hostname in turso.production.json before migrating.',
    )
  }
}

function remoteDatabaseHostname(databaseUrl: string): string {
  try {
    const endpoint = Schema.decodeUnknownSync(Schema.URLFromString)(databaseUrl)
    return Schema.decodeUnknownSync(remoteEndpoint)(endpoint).hostname
  } catch {
    throw new Error(
      'Production Turso URL must be a remote libsql:// or https:// endpoint without credentials, port, path, query, or fragment.',
    )
  }
}
