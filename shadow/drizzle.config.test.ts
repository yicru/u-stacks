import { afterEach, describe, expect, test, vi } from 'vitest'

const originalDatabaseUrl = process.env.TURSO_DATABASE_URL
const originalAuthToken = process.env.TURSO_AUTH_TOKEN

afterEach(() => {
  restoreEnv('TURSO_DATABASE_URL', originalDatabaseUrl)
  restoreEnv('TURSO_AUTH_TOKEN', originalAuthToken)
  vi.resetModules()
})

describe('local Drizzle configuration', () => {
  test('ignores ambient Turso credentials', async () => {
    process.env.TURSO_DATABASE_URL = 'libsql://production.example.com'
    process.env.TURSO_AUTH_TOKEN = 'production-token'
    vi.resetModules()

    const { default: config } = await import('./drizzle.config')

    expect('dbCredentials' in config).toBe(true)
    if (!('dbCredentials' in config)) {
      throw new Error('Local Drizzle credentials are missing.')
    }
    expect(config.dbCredentials).toEqual({
      url: 'file:.turso/dev.db',
      authToken: undefined,
    })
  })
})

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key]
    return
  }

  process.env[key] = value
}
