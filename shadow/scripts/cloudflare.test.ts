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
  symlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { afterEach, describe, expect, test } from 'vite-plus/test'

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
  test('deploys the validated build with the pinned profile and account', async () => {
    const directory = await createFixture()
    const { exitCode, stderr } = await runCommand(directory, [
      'deploy',
      '--dry-run',
    ])
    const [invocation] = await readInvocations(directory)

    expect(exitCode, stderr).toBe(0)
    expect(invocation).toEqual({
      args: [
        'deploy',
        '--prebuilt',
        '--dry-run',
        '--profile',
        'client-profile',
        '--mode',
        'production',
      ],
      accountId: ACCOUNT_ID,
      apiToken: '',
      runtime: 'node',
    })
    expect(
      await fileExists(
        join(
          directory,
          '.cloudflare/output/v0/workers/default/worker.config.json',
        ),
      ),
    ).toBe(true)
  })

  test('stops when the local and programmatic account IDs disagree', async () => {
    const directory = await createFixture()
    await writeConfig(directory, {}, 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')
    const { exitCode, stderr } = await runCommand(directory, [
      'deploy',
      '--dry-run',
    ])
    expect(exitCode).toBe(1)
    expect(stderr).toContain(
      'Cloudflare account mismatch between .cloudflare.json and cloudflare.config.ts.',
    )
    expect(await fileExists(join(directory, 'cf.log'))).toBe(false)
  })

  test('rejects credentials and profile overrides before invoking cf', async () => {
    const directory = await createFixture()
    const credential = await runCommand(directory, ['plan'], {
      CF_API_TOKEN: 'test-token',
    })
    const profile = await runCommand(directory, ['deploy', '--profile=other'])
    expect(credential.exitCode).toBe(1)
    expect(credential.stderr).toContain(
      'CF_API_TOKEN overrides named Cloudflare profiles.',
    )
    expect(profile.exitCode).toBe(1)
    expect(profile.stderr).toContain('The Cloudflare profile is pinned')
    expect(await fileExists(join(directory, 'cf.log'))).toBe(false)
  })

  test('plans KV, D1, and R2 creates locally', async () => {
    const directory = await createFixture()
    await writeConfig(directory, unresolvedResources())
    const { exitCode, stdout, stderr } = await runCommand(directory, ['plan'])
    expect(exitCode, stderr).toBe(0)
    expect(stdout).toContain(
      'kv "test-worker-cache" for worker.env.CACHE (CACHE)',
    )
    expect(stdout).toContain('d1 "application-db" for worker.env.DB (DB)')
    expect(stdout).toContain(
      'r2 "test-worker-assets" for worker.env.ASSETS (ASSETS)',
    )
    expect(stdout).toContain('Permission: Workers KV Storage write')
    expect(stdout).toContain('- Deletes: none')
    expect(await fileExists(join(directory, 'cf.log'))).toBe(false)
  })

  test('requires explicit confirmation before creating resources', async () => {
    const directory = await createFixture()
    await writeConfig(directory, unresolvedResources())
    const { exitCode, stderr } = await runCommand(directory, ['apply'])
    expect(exitCode).toBe(1)
    expect(stderr).toContain('No remote changes were made.')
    expect(await fileExists(join(directory, 'cf.log'))).toBe(false)
  })

  test('creates planned resources, saves identifiers, and reuses them on the next plan', async () => {
    const directory = await createFixture()
    await writeConfig(directory, unresolvedResources())
    const applied = await runCommand(directory, ['apply', '--yes'])
    const invocations = await readInvocations(directory)
    const identifiers = JSON.parse(
      await readFile(join(directory, 'cloudflare.resources.json'), 'utf-8'),
    )
    expect(applied.exitCode, applied.stderr).toBe(0)
    expect(invocations.map(({ args }) => args.slice(0, -4))).toEqual([
      ['auth', 'whoami'],
      ['kv', 'namespaces', 'create', '--title', 'test-worker-cache'],
      ['d1', 'create', '--name', 'application-db'],
      [
        'r2',
        'buckets',
        'create',
        '--name',
        'test-worker-assets',
        '--cf-r2-jurisdiction',
        'eu',
      ],
    ])
    expect(
      invocations.every(
        ({ accountId, apiToken, runtime, args }) =>
          accountId === ACCOUNT_ID &&
          apiToken === '' &&
          runtime === 'node' &&
          args.includes('client-profile'),
      ),
    ).toBe(true)
    expect(identifiers[ACCOUNT_ID]['test-worker']).toEqual({
      CACHE: { type: 'kv', id: '11111111111111111111111111111111' },
      DB: { type: 'd1', id: '22222222-2222-2222-2222-222222222222' },
      ASSETS: { type: 'r2', id: 'test-worker-assets' },
    })
    const nextPlan = await runCommand(directory, ['plan'])
    expect(nextPlan.exitCode, nextPlan.stderr).toBe(0)
    expect(nextPlan.stdout).not.toContain('- Create')
  })

  test('preserves completed resource identifiers if a later creation fails', async () => {
    const directory = await createFixture()
    await writeConfig(directory, unresolvedResources())
    const { exitCode, stderr } = await runCommand(
      directory,
      ['apply', '--yes'],
      { SHADOW_CF_FAIL_D1: '1' },
    )
    const saved = JSON.parse(
      await readFile(join(directory, 'cloudflare.resources.json'), 'utf-8'),
    )
    expect(exitCode).toBe(1)
    expect(stderr).toContain('no rollback or delete was attempted')
    expect(Object.keys(saved[ACCOUNT_ID]['test-worker'])).toEqual(['CACHE'])
    expect(
      (await readInvocations(directory)).some(
        ({ args }) => args.includes('delete') || args.includes('r2'),
      ),
    ).toBe(false)
  })

  test('reports authentication and configured resource readiness', async () => {
    const directory = await createFixture()
    const { exitCode, stdout, stderr } = await runCommand(directory, ['status'])
    expect(exitCode, stderr).toBe(0)
    expect(stdout).toContain('- Authentication: ready')
    expect(stdout).toContain('- Pending creates: 0')
    expect((await readInvocations(directory))[0]?.args).toEqual([
      'auth',
      'whoami',
      '--profile',
      'client-profile',
      '--mode',
      'production',
    ])
  })

  test.each(['expired', 'wrong-account'])(
    'rejects %s authentication even when cf exits successfully',
    async (failure) => {
      const directory = await createFixture()
      await writeConfig(directory, unresolvedResources())
      const { exitCode, stderr } = await runCommand(
        directory,
        ['apply', '--yes'],
        { SHADOW_CF_AUTH_FAILURE: failure },
      )
      expect(exitCode).toBe(1)
      expect(stderr).toContain(
        failure === 'expired'
          ? 'Authentication unavailable'
          : 'cannot access the pinned account',
      )
      expect(await readInvocations(directory)).toHaveLength(1)
    },
  )

  test('blocks unsupported draft resources and deployment', async () => {
    const directory = await createFixture()
    await writeConfig(directory, { EVENTS: { type: 'queue' } })
    const plan = await runCommand(directory, ['plan'])
    const deploy = await runCommand(directory, ['deploy', '--dry-run'])
    expect(plan.exitCode).toBe(1)
    expect(plan.stdout).toContain('worker.env.EVENTS: Missing name.')
    expect(deploy.exitCode).toBe(1)
    expect(deploy.stderr).toContain(
      'Deployment stopped because Cloudflare resources are unresolved.',
    )
    expect(await fileExists(join(directory, 'cf.log'))).toBe(false)
  })

  test('evaluates the selected mode before planning and guarding deployment', async () => {
    const directory = await createFixture()
    await writeConfig(
      directory,
      { CACHE: { type: 'kv' } },
      ACCOUNT_ID,
      'staging',
    )
    const plan = await runCommand(directory, ['plan', '--mode', 'staging'])
    const deploy = await runCommand(directory, [
      'deploy',
      '-m',
      'staging',
      '--dry-run',
    ])
    expect(plan.exitCode, plan.stderr).toBe(0)
    expect(plan.stdout).toContain('- Mode: staging')
    expect(plan.stdout).toContain('kv "test-worker-staging-cache"')
    expect(deploy.exitCode).toBe(1)
    expect(await fileExists(join(directory, 'cf.log'))).toBe(false)
  })

  test('rejects prebuilt output with a different account or unresolved bindings', async () => {
    const directory = await createFixture()
    const built = await runCommand(directory, ['deploy', '--dry-run'])
    expect(built.exitCode, built.stderr).toBe(0)
    const rootPath = join(directory, '.cloudflare/output/v0/config.json')
    const root = JSON.parse(await readFile(rootPath, 'utf-8'))
    await writeFile(
      rootPath,
      JSON.stringify({
        ...root,
        accountId: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      }),
    )
    const wrongAccount = await runCommand(directory, [
      'deploy',
      '--prebuilt',
      '--dry-run',
    ])
    expect(wrongAccount.exitCode).toBe(1)
    expect(wrongAccount.stderr).toContain(
      'Build Output account, Worker, or mode differs',
    )
    await writeFile(rootPath, JSON.stringify(root))
    const workerPath = join(
      directory,
      '.cloudflare/output/v0/workers/default/worker.config.json',
    )
    const worker = JSON.parse(await readFile(workerPath, 'utf-8'))
    await writeFile(
      workerPath,
      JSON.stringify({ ...worker, env: { CACHE: { type: 'kv' } } }),
    )
    const unresolved = await runCommand(directory, [
      'deploy',
      '--prebuilt',
      '--dry-run',
    ])
    expect(unresolved.exitCode).toBe(1)
    expect(unresolved.stderr).toContain('resources are unresolved')
    expect(await readInvocations(directory)).toHaveLength(1)
  })

  test.each([
    { label: 'normal deploy', options: [] },
    { label: 'explicit false dry-run', options: ['--dry-run', 'false'] },
  ])('checks existing R2 resources before $label', async ({ options }) => {
    const directory = await createFixture()
    await writeConfig(directory, {
      ASSETS: { type: 'r2', name: 'existing-bucket' },
    })
    const { exitCode, stderr } = await runCommand(
      directory,
      ['deploy', ...options],
      {
        SHADOW_CF_MISSING_BUCKET: '1',
      },
    )
    expect(exitCode).toBe(1)
    expect(stderr).toContain(
      'Resource verification failed for worker.env.ASSETS',
    )
    expect(
      (await readInvocations(directory)).map(({ args }) => args.slice(0, -4)),
    ).toEqual([
      ['auth', 'whoami'],
      ['r2', 'buckets', 'get', 'existing-bucket'],
    ])
  })

  test('rejects legacy automatic provisioning and environment flags', async () => {
    const directory = await createFixture()
    const provisioning = await runCommand(directory, [
      'deploy',
      '--x-provision',
    ])
    const environment = await runCommand(directory, [
      'plan',
      '--env',
      'staging',
    ])
    expect(provisioning.exitCode).toBe(1)
    expect(provisioning.stderr).toContain('bypasses the reviewed resource plan')
    expect(environment.exitCode).toBe(1)
    expect(environment.stderr).toContain('cf uses --mode')
    expect(await fileExists(join(directory, 'cf.log'))).toBe(false)
  })
})

type Invocation = {
  args: string[]
  accountId?: string
  apiToken?: string
  runtime: string
}

async function runCommand(
  directory: string,
  args: string[],
  environment: NodeJS.ProcessEnv = {},
) {
  const child = spawn('bun', ['run', 'cloudflare', '--', ...args], {
    cwd: directory,
    env: {
      ...withoutCredentials(process.env),
      ...environment,
      SHADOW_CF_TEST_LOG: join(directory, 'cf.log'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const stdout: Buffer[] = []
  const stderr: Buffer[] = []
  child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk))
  child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk))
  const [exitCode] = await once(child, 'exit')
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
    'cloudflare-resource-ids.ts',
  ]) {
    await copyFile(
      join(ROOT, 'scripts', file),
      join(directory, 'scripts', file),
    )
  }
  await mkdir(join(directory, 'node_modules/.bin'), { recursive: true })
  for (const dependency of ['@cloudflare']) {
    await symlink(
      join(ROOT, 'node_modules', dependency),
      join(directory, 'node_modules', dependency),
      'dir',
    )
  }
  await mkdir(join(directory, 'node_modules/cf'), { recursive: true })
  await copyFile(
    join(ROOT, 'node_modules/cf/package.json'),
    join(directory, 'node_modules/cf/package.json'),
  )
  await symlink(
    join(ROOT, 'node_modules/cf/dist'),
    join(directory, 'node_modules/cf/dist'),
    'dir',
  )
  await writeFile(
    join(directory, '.cloudflare.json'),
    JSON.stringify({ profile: 'client-profile', accountId: ACCOUNT_ID }),
  )
  await writeFile(
    join(directory, 'package.json'),
    JSON.stringify({
      type: 'module',
      scripts: {
        cloudflare: 'node scripts/cloudflare.ts',
        build: 'node scripts/build-fixture.mjs',
      },
    }),
  )
  await writeFile(
    join(directory, 'scripts/build-fixture.mjs'),
    `
import { loadAndParseConfig } from '@cloudflare/config'
import { getWorkerBundleDir, writeRootConfig, writeWorkerConfig } from '@cloudflare/build-output-utils'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
const root = process.cwd()
const mode = process.argv[process.argv.indexOf('--mode') + 1]
const { result } = await loadAndParseConfig(join(root, 'cloudflare.config.ts'), { mode, isPreview: false })
if (!result.success) throw result.error
await writeRootConfig(root, { accountId: result.data.accountId }, { mode, isPreview: false })
await mkdir(getWorkerBundleDir(root), { recursive: true })
await writeFile(join(getWorkerBundleDir(root), 'index.js'), 'export default { fetch() { return new Response("OK") } }')
await writeWorkerConfig({ root, config: result.data.worker, manifest: { type: 'complete', mainModule: 'index.js', modules: { 'index.js': { type: 'esm' } } } })
`,
  )
  await writeConfig(directory, {})
  await writeCfStub(directory)
  return directory
}

async function writeConfig(
  directory: string,
  env: Record<string, unknown>,
  accountId = ACCOUNT_ID,
  selectedMode?: string,
): Promise<void> {
  await writeFile(
    join(directory, 'cloudflare.config.ts'),
    `
import { defineConfig } from 'cf/config'
import { withCloudflareResourceIds } from './scripts/cloudflare-resource-ids.ts'
export default defineConfig(({ mode }) => ({
  accountId: '${accountId}',
  worker: withCloudflareResourceIds({
    name: ${selectedMode ? `mode === '${selectedMode}' ? 'test-worker-${selectedMode}' : 'test-worker'` : "'test-worker'"},
    compatibilityDate: '2025-09-02',
    entrypoint: './index.ts',
    env: ${selectedMode ? `mode === '${selectedMode}' ? ${JSON.stringify(env)} : {}` : JSON.stringify(env)},
  }, '${accountId}'),
}))
`,
  )
}

async function writeCfStub(directory: string): Promise<void> {
  const binaryPath = join(directory, 'node_modules/cf/bin/cf')
  await mkdir(dirname(binaryPath), { recursive: true })
  await writeFile(
    binaryPath,
    `#!/usr/bin/env node
import { appendFileSync } from 'node:fs'
const args = process.argv.slice(2)
appendFileSync(process.env.SHADOW_CF_TEST_LOG, JSON.stringify({ args, accountId: process.env.CLOUDFLARE_ACCOUNT_ID, apiToken: process.env.CLOUDFLARE_API_TOKEN, runtime: process.versions.bun ? 'bun' : 'node' }) + '\\n')
if (args[0] === 'auth' && args[1] === 'whoami') {
  console.log(JSON.stringify({ authenticated: true, tokenValid: process.env.SHADOW_CF_AUTH_FAILURE !== 'expired', accounts: [{ id: process.env.SHADOW_CF_AUTH_FAILURE === 'wrong-account' ? 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' : '${ACCOUNT_ID}', name: 'Test Account' }] }))
} else if (args[0] === 'kv') {
  console.log(JSON.stringify({ id: '11111111111111111111111111111111' }))
} else if (args[0] === 'd1') {
  if (process.env.SHADOW_CF_FAIL_D1) { console.error('D1 permission denied'); process.exit(1) }
  console.log(JSON.stringify({ uuid: '22222222-2222-2222-2222-222222222222' }))
} else if (args[0] === 'r2') {
  if (args[2] === 'get' && process.env.SHADOW_CF_MISSING_BUCKET) { console.error('Bucket does not exist'); process.exit(1) }
  console.log(JSON.stringify({ name: args[2] === 'get' ? args[3] : args[args.indexOf('--name') + 1] }))
} else console.log('{}')
`,
  )
  await chmod(binaryPath, 0o755)
}

async function readInvocations(directory: string): Promise<Invocation[]> {
  const source = await readFile(join(directory, 'cf.log'), 'utf-8')
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
    CACHE: { type: 'kv', dev: { remote: true } },
    DB: { type: 'd1', name: 'application-db' },
    ASSETS: { type: 'r2', jurisdiction: 'eu' },
  }
}

function withoutCredentials(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const result = { ...env }
  for (const key of [
    'CLOUDFLARE_API_TOKEN',
    'CLOUDFLARE_API_KEY',
    'CLOUDFLARE_EMAIL',
    'CF_API_TOKEN',
    'CF_API_KEY',
    'CF_EMAIL',
  ])
    delete result[key]
  return result
}
