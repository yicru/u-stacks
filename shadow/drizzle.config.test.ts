import { afterEach, describe, expect, test, vi } from 'vite-plus/test'
import { spawnSync } from 'node:child_process'
import { cp, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const ROOT = import.meta.dirname
const originalDatabaseUrl = process.env.TURSO_DATABASE_URL
const originalAuthToken = process.env.TURSO_AUTH_TOKEN
const temporaryDirectories: string[] = []

afterEach(async () => {
  restoreEnv('TURSO_DATABASE_URL', originalDatabaseUrl)
  restoreEnv('TURSO_AUTH_TOKEN', originalAuthToken)
  vi.resetModules()
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  )
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

describe('production Drizzle configuration', () => {
  test.each([
    'libsql://production.turso.io',
    'https://production.turso.io/',
    'libsql://PRODUCTION.TURSO.IO.',
  ])('accepts the pinned authenticated endpoint %s', async (url) => {
    const directory = await createFixture({ hostname: 'production.turso.io' })
    const result = readProductionConfig(directory, {
      TURSO_DATABASE_URL: url,
    })

    expect(result.status, result.stderr).toBe(0)
    expect(JSON.parse(result.stdout)).toEqual({
      url,
      authToken: 'fixture-token',
    })
  })

  test.each([
    [
      'a different database',
      { TURSO_DATABASE_URL: 'libsql://staging.turso.io' },
    ],
    ['a missing URL', { TURSO_DATABASE_URL: '' }],
    ['a missing token', { TURSO_AUTH_TOKEN: '' }],
    ['an invalid URL', { TURSO_DATABASE_URL: 'invalid-fixture-url' }],
    ['a local file', { TURSO_DATABASE_URL: 'file:.turso/dev.db' }],
    [
      'an insecure endpoint',
      { TURSO_DATABASE_URL: 'http://production.turso.io' },
    ],
    ['localhost', { TURSO_DATABASE_URL: 'libsql://LOCALHOST.' }],
    ['a loopback address', { TURSO_DATABASE_URL: 'libsql://127.0.0.1' }],
    ['IPv6 loopback', { TURSO_DATABASE_URL: 'libsql://[::1]' }],
    ['an encoded hostname', { TURSO_DATABASE_URL: 'libsql://%6cocalhost' }],
    ['a port', { TURSO_DATABASE_URL: 'libsql://production.turso.io:8080' }],
    ['a path', { TURSO_DATABASE_URL: 'libsql://production.turso.io/tasks' }],
    [
      'a fragment',
      { TURSO_DATABASE_URL: 'libsql://production.turso.io#tasks' },
    ],
    [
      'a query credential',
      {
        TURSO_DATABASE_URL: 'libsql://production.turso.io?token=fixture-secret',
      },
    ],
    [
      'embedded credentials',
      { TURSO_DATABASE_URL: 'https://user:fixture-secret@production.turso.io' },
    ],
  ])('rejects %s before returning credentials', async (_name, env) => {
    const directory = await createFixture({ hostname: 'production.turso.io' })
    const result = readProductionConfig(directory, env)

    expect(result.status).not.toBe(0)
    expect(result.stdout).toBe('')
    expect(result.stderr).not.toContain('fixture-token')
    expect(result.stderr).not.toContain('fixture-secret')
    const suppliedUrl =
      'TURSO_DATABASE_URL' in env
        ? env.TURSO_DATABASE_URL
        : 'libsql://production.turso.io'
    if (suppliedUrl) {
      expect(result.stderr).not.toContain(suppliedUrl)
    }
  })

  test.each([undefined, { hostname: null }, { hostname: '' }, []])(
    'rejects an unconfigured production target %j',
    async (target) => {
      const directory = await createFixture(target)
      const result = readProductionConfig(directory)

      expect(result.status).not.toBe(0)
      expect(result.stderr).toContain('turso.production.json')
    },
  )
})

async function createFixture(target: unknown): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'shadow-drizzle-'))
  temporaryDirectories.push(directory)
  await mkdir(join(directory, 'scripts'))
  await Promise.all([
    cp(join(ROOT, 'package.json'), join(directory, 'package.json')),
    cp(
      join(ROOT, 'drizzle.production.config.ts'),
      join(directory, 'drizzle.production.config.ts'),
    ),
    cp(
      join(ROOT, 'scripts/production-database.ts'),
      join(directory, 'scripts/production-database.ts'),
    ),
    symlink(join(ROOT, 'node_modules'), join(directory, 'node_modules'), 'dir'),
  ])
  if (target !== undefined) {
    await writeFile(
      join(directory, 'turso.production.json'),
      JSON.stringify(target),
    )
  }
  return directory
}

function readProductionConfig(
  directory: string,
  overrides: NodeJS.ProcessEnv = {},
) {
  return spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      `
const { default: config } = await import('./drizzle.production.config.ts')
console.log(JSON.stringify(config.dbCredentials))
`,
    ],
    {
      cwd: directory,
      encoding: 'utf-8',
      env: {
        ...process.env,
        TURSO_DATABASE_URL: 'libsql://production.turso.io',
        TURSO_AUTH_TOKEN: 'fixture-token',
        ...overrides,
      },
    },
  )
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key]
    return
  }

  process.env[key] = value
}
