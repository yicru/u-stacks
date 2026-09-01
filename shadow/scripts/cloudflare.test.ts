import { spawn } from 'node:child_process'
import { once } from 'node:events'
import {
  access,
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'

const ROOT = resolve(import.meta.dirname, '..')
const ACCOUNT_ID = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  )
})

describe('Cloudflare command wrapper', () => {
  test('passes the pinned profile and account while disabling automatic provisioning', async () => {
    const directory = await createFixture()
    const { exitCode, stderr } = await runCloudflareCommand(directory, [
      'deploy',
      '--dry-run',
    ])
    const [invocation] = await readInvocations(directory)

    expect(stderr).toBe('$ bun scripts/cloudflare.ts deploy --dry-run\n')
    expect(exitCode).toBe(0)
    expect(invocation).toEqual({
      args: [
        'deploy',
        '--dry-run',
        '--no-experimental-provision',
        '--no-experimental-auto-create',
        '--profile',
        'client-profile',
      ],
      accountId: ACCOUNT_ID,
      apiToken: '',
    })
  })

  test('stops when the local and Wrangler account IDs disagree', async () => {
    const directory = await createFixture()
    await writeWranglerConfig(directory, {
      name: 'test-worker',
      account_id: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    })

    const { exitCode, stderr } = await runCloudflareCommand(directory, [
      'deploy',
      '--dry-run',
    ])

    expect(exitCode).toBe(1)
    expect(stderr).toContain(
      'Cloudflare account mismatch between .cloudflare.json and wrangler.jsonc.',
    )
  })

  test('rejects legacy credential environment variables', async () => {
    const directory = await createFixture()
    const { exitCode, stderr } = await runCloudflareCommand(
      directory,
      ['plan'],
      { CF_API_TOKEN: 'test-token' },
    )

    expect(exitCode).toBe(1)
    expect(stderr).toContain(
      'CF_API_TOKEN overrides named Cloudflare profiles.',
    )
  })

  test('plans KV, D1, and R2 creates without calling Wrangler', async () => {
    const directory = await createFixture()
    await writeWranglerConfig(directory, unresolvedResources())

    const { exitCode, stdout } = await runCloudflareCommand(directory, ['plan'])

    expect(exitCode).toBe(0)
    expect(stdout).toContain(
      'KV namespace "test-worker-cache" for kv_namespaces[0] (CACHE)',
    )
    expect(stdout).toContain(
      'D1 database "application-db" for d1_databases[0] (DB)',
    )
    expect(stdout).toContain(
      'R2 bucket "test-worker-assets" for r2_buckets[0] (ASSETS)',
    )
    expect(stdout).toContain('Permission: Workers KV Storage write')
    expect(stdout).toContain('- Deletes: none')
    await expect(fileExists(join(directory, 'wrangler.log'))).resolves.toBe(
      false,
    )
  })

  test('requires explicit confirmation before creating resources', async () => {
    const directory = await createFixture()
    await writeWranglerConfig(directory, unresolvedResources())

    const { exitCode, stderr } = await runCloudflareCommand(directory, [
      'apply',
    ])

    expect(exitCode).toBe(1)
    expect(stderr).toContain('No remote changes were made.')
    await expect(fileExists(join(directory, 'wrangler.log'))).resolves.toBe(
      false,
    )
  })

  test('creates planned resources and persists their identifiers', async () => {
    const directory = await createFixture()
    await writeWranglerConfig(directory, unresolvedResources())

    const { exitCode, stdout } = await runCloudflareCommand(directory, [
      'apply',
      '--yes',
    ])
    const invocations = await readInvocations(directory)
    const wranglerConfig = JSON.parse(
      await readFile(join(directory, 'wrangler.jsonc'), 'utf-8'),
    ) as {
      kv_namespaces: Array<{ id?: string }>
      d1_databases: Array<{ database_id?: string; database_name?: string }>
      r2_buckets: Array<{ bucket_name?: string }>
    }

    expect(exitCode).toBe(0)
    expect(invocations.map(({ args }) => args)).toEqual([
      ['whoami', '--json'],
      [
        'kv',
        'namespace',
        'create',
        'test-worker-cache',
        '--binding',
        'CACHE',
        '--update-config',
        '--use-remote',
        '--no-experimental-provision',
        '--no-experimental-auto-create',
        '--profile',
        'client-profile',
      ],
      [
        'd1',
        'create',
        'application-db',
        '--binding',
        'DB',
        '--update-config',
        '--no-experimental-provision',
        '--no-experimental-auto-create',
        '--profile',
        'client-profile',
      ],
      [
        'r2',
        'bucket',
        'create',
        'test-worker-assets',
        '--binding',
        'ASSETS',
        '--update-config',
        '--jurisdiction',
        'eu',
        '--no-experimental-provision',
        '--no-experimental-auto-create',
        '--profile',
        'client-profile',
      ],
    ])
    expect(
      invocations.every(
        ({ accountId, apiToken }) =>
          accountId === ACCOUNT_ID && apiToken === '',
      ),
    ).toBe(true)
    expect(wranglerConfig.kv_namespaces[0]?.id).toBe(
      '11111111111111111111111111111111',
    )
    expect(wranglerConfig.d1_databases[0]).toMatchObject({
      database_id: '22222222-2222-2222-2222-222222222222',
      database_name: 'application-db',
    })
    expect(wranglerConfig.r2_buckets[0]?.bucket_name).toBe('test-worker-assets')
    expect(stdout).toContain(
      'Cloudflare resources were created and wrangler.jsonc was updated.',
    )
  })

  test('reports authentication and resource readiness', async () => {
    const directory = await createFixture()

    const { exitCode, stdout } = await runCloudflareCommand(directory, [
      'status',
    ])
    const [invocation] = await readInvocations(directory)

    expect(exitCode).toBe(0)
    expect(stdout).toContain('- Authentication: ready')
    expect(stdout).toContain('- Pending creates: 0')
    expect(invocation?.args).toEqual(['whoami', '--json'])
  })

  test('reports expired authentication without attempting a mutation', async () => {
    const directory = await createFixture()

    const { exitCode, stdout, stderr } = await runCloudflareCommand(
      directory,
      ['status'],
      { SHADOW_CLOUDFLARE_AUTH_FAIL: '1' },
    )

    expect(exitCode).toBe(1)
    expect(stdout).toContain('- Authentication: unavailable')
    expect(stderr).toContain('OAuth token expired')
    expect((await readInvocations(directory)).map(({ args }) => args)).toEqual([
      ['whoami', '--json'],
    ])
  })

  test('blocks unsupported draft resources and deployment', async () => {
    const directory = await createFixture()
    await writeWranglerConfig(directory, {
      name: 'test-worker',
      account_id: ACCOUNT_ID,
      queues: {
        producers: [{ binding: 'EVENTS' }],
      },
    })

    const plan = await runCloudflareCommand(directory, ['plan'])
    const deploy = await runCloudflareCommand(directory, [
      'deploy',
      '--dry-run',
    ])

    expect(plan.exitCode).toBe(1)
    expect(plan.stdout).toContain('queues.producers[0]: Missing queue.')
    expect(deploy.exitCode).toBe(1)
    expect(deploy.stderr).toContain(
      'Deployment stopped because Cloudflare resources are unresolved.',
    )
    await expect(fileExists(join(directory, 'wrangler.log'))).resolves.toBe(
      false,
    )
  })

  test('plans and guards a selected Wrangler environment', async () => {
    const directory = await createFixture()
    await writeWranglerConfig(directory, {
      name: 'test-worker',
      account_id: ACCOUNT_ID,
      env: {
        staging: {
          name: 'test-worker-staging',
          kv_namespaces: [{ binding: 'CACHE' }],
        },
      },
    })

    const plan = await runCloudflareCommand(directory, [
      'plan',
      '--env',
      'staging',
    ])
    const deploy = await runCloudflareCommand(directory, [
      'deploy',
      '--env',
      'staging',
      '--dry-run',
    ])

    expect(plan.exitCode).toBe(0)
    expect(plan.stdout).toContain('- Environment: staging')
    expect(plan.stdout).toContain('KV namespace "test-worker-staging-cache"')
    expect(deploy.exitCode).toBe(1)
    expect(deploy.stderr).toContain(
      'Deployment stopped because Cloudflare resources are unresolved.',
    )
    await expect(fileExists(join(directory, 'wrangler.log'))).resolves.toBe(
      false,
    )
  })

  test('rejects flags that re-enable automatic provisioning', async () => {
    const directory = await createFixture()

    const { exitCode, stderr } = await runCloudflareCommand(directory, [
      'deploy',
      '--x-provision',
    ])

    expect(exitCode).toBe(1)
    expect(stderr).toContain(
      '--x-provision bypasses the reviewed resource plan',
    )
  })
})

type Invocation = {
  args: string[]
  accountId?: string
  apiToken?: string
}

async function runCloudflareCommand(
  directory: string,
  args: string[],
  environment: NodeJS.ProcessEnv = {},
): Promise<{
  exitCode: number | null
  stdout: string
  stderr: string
}> {
  const child = spawn('bun', ['run', 'cloudflare', '--', ...args], {
    cwd: directory,
    env: {
      ...withoutCloudflareCredentials(process.env),
      ...environment,
      SHADOW_CLOUDFLARE_TEST_LOG: join(directory, 'wrangler.log'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const stdout: Buffer[] = []
  const stderr: Buffer[] = []
  child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk))
  child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk))

  const [exitCode] = (await once(child, 'exit')) as [number | null]
  return {
    exitCode,
    stdout: Buffer.concat(stdout).toString(),
    stderr: Buffer.concat(stderr).toString(),
  }
}

async function createFixture(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'shadow-cloudflare-'))
  temporaryDirectories.push(directory)

  await mkdir(join(directory, 'scripts'), { recursive: true })
  for (const file of [
    'cloudflare.ts',
    'cloudflare-config.ts',
    'cloudflare-resources.ts',
  ]) {
    await copyFile(
      join(ROOT, 'scripts', file),
      join(directory, 'scripts', file),
    )
  }
  await writeFile(
    join(directory, '.cloudflare.json'),
    `${JSON.stringify(
      {
        profile: 'client-profile',
        accountId: ACCOUNT_ID,
      },
      null,
      2,
    )}\n`,
  )
  await writeFile(
    join(directory, 'package.json'),
    `${JSON.stringify({ scripts: { cloudflare: 'bun scripts/cloudflare.ts' } })}\n`,
  )
  await writeWranglerConfig(directory, {
    name: 'test-worker',
    account_id: ACCOUNT_ID,
  })
  await writeWranglerStub(directory)

  return directory
}

async function writeWranglerConfig(
  directory: string,
  configuration: Record<string, unknown>,
): Promise<void> {
  await writeFile(
    join(directory, 'wrangler.jsonc'),
    `${JSON.stringify(configuration, null, 2)}\n`,
  )
}

async function writeWranglerStub(directory: string): Promise<void> {
  const binaryPath = join(directory, 'node_modules/.bin/wrangler')
  await mkdir(dirname(binaryPath), { recursive: true })
  await writeFile(
    binaryPath,
    `#!/usr/bin/env bun
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const args = process.argv.slice(2)
appendFileSync(
  process.env.SHADOW_CLOUDFLARE_TEST_LOG,
  JSON.stringify({
    args,
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    apiToken: process.env.CLOUDFLARE_API_TOKEN,
  }) + '\\n',
)

if (args[0] === 'whoami' && args[1] === '--json') {
  if (process.env.SHADOW_CLOUDFLARE_AUTH_FAIL) {
    console.error('OAuth token expired')
    process.exit(1)
  }
  console.log(JSON.stringify({
    loggedIn: true,
    accounts: [{ id: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', name: 'Test Account' }],
  }))
  process.exit(0)
}

const configPath = join(process.cwd(), 'wrangler.jsonc')
const config = JSON.parse(readFileSync(configPath, 'utf-8'))
const bindingIndex = args.indexOf('--binding')
const binding = args[bindingIndex + 1]

if (args[0] === 'kv' && args[1] === 'namespace' && args[2] === 'create') {
  const resource = config.kv_namespaces.find((item) => item.binding === binding)
  resource.id = '11111111111111111111111111111111'
}

if (args[0] === 'd1' && args[1] === 'create') {
  const resource = config.d1_databases.find((item) => item.binding === binding)
  resource.database_name = args[2]
  resource.database_id = '22222222-2222-2222-2222-222222222222'
}

if (args[0] === 'r2' && args[1] === 'bucket' && args[2] === 'create') {
  const resource = config.r2_buckets.find((item) => item.binding === binding)
  resource.bucket_name = args[3]
}

writeFileSync(configPath, JSON.stringify(config, null, 2) + '\\n')
`,
  )
  await chmod(binaryPath, 0o755)
}

async function readInvocations(directory: string): Promise<Invocation[]> {
  const source = await readFile(join(directory, 'wrangler.log'), 'utf-8')
  return source
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Invocation)
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

function unresolvedResources(): Record<string, unknown> {
  return {
    name: 'test-worker',
    account_id: ACCOUNT_ID,
    kv_namespaces: [{ binding: 'CACHE', remote: true }],
    d1_databases: [{ binding: 'DB', database_name: 'application-db' }],
    r2_buckets: [{ binding: 'ASSETS', jurisdiction: 'eu' }],
  }
}

function withoutCloudflareCredentials(
  env: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
  const nextEnv = { ...env }
  delete nextEnv.CLOUDFLARE_API_TOKEN
  delete nextEnv.CLOUDFLARE_API_KEY
  delete nextEnv.CLOUDFLARE_EMAIL
  delete nextEnv.CF_API_TOKEN
  delete nextEnv.CF_API_KEY
  delete nextEnv.CF_EMAIL
  return nextEnv
}
