import { spawn } from 'node:child_process'
import { once } from 'node:events'
import {
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
const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  )
})

describe('template setup', () => {
  test('keeps the CTA config formatter-compatible after renaming', async () => {
    const directory = await createSetupFixture()
    const child = spawn('bun', ['scripts/setup.ts', 'consumer-app'], {
      cwd: directory,
      env: withoutCloudflareCredentials(process.env),
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    const stderr: Buffer[] = []
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk))
    child.stdin.end('n\nn\n')

    const [exitCode] = (await once(child, 'exit')) as [number | null]
    const ctaConfig = await readFile(join(directory, '.cta.json'), 'utf-8')

    expect(Buffer.concat(stderr).toString()).toBe('')
    expect(exitCode).toBe(0)
    expect(ctaConfig).toContain('"projectName": "consumer-app"')
    expect(ctaConfig).toContain('"chosenAddOns": ["cloudflare"]')
  })

  test('pins the selected Cloudflare profile and account', async () => {
    const directory = await createSetupFixture()
    const logPath = join(directory, 'wrangler.log')
    await writeWranglerStub(directory)

    const child = spawn('bun', ['scripts/setup.ts', 'consumer-app'], {
      cwd: directory,
      env: withoutCloudflareCredentials({
        ...process.env,
        SHADOW_SETUP_TEST_LOG: logPath,
      }),
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk))
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk))
    child.stdin.end('n\ny\nclient-profile\n2\n')

    const [exitCode] = (await once(child, 'exit')) as [number | null]
    const cloudflareConfig = JSON.parse(
      await readFile(join(directory, '.cloudflare.json'), 'utf-8'),
    ) as { profile: string; accountId: string }
    const wranglerConfig = await readFile(
      join(directory, 'wrangler.jsonc'),
      'utf-8',
    )
    const wranglerLog = await readFile(logPath, 'utf-8')

    expect(Buffer.concat(stderr).toString()).toBe('')
    expect(exitCode).toBe(0)
    expect(cloudflareConfig).toEqual({
      profile: 'client-profile',
      accountId: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    })
    expect(wranglerConfig).toContain(
      '"account_id": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"',
    )
    expect(wranglerLog).toContain('auth activate client-profile ')
    expect(wranglerLog).toContain('whoami --json')
    expect(Buffer.concat(stdout).toString()).toContain(
      'Cloudflare profile "client-profile" is pinned to Beta Account',
    )
    expect(Buffer.concat(stdout).toString()).toContain(
      'Cloudflare resources and API tokens were not created.',
    )
  })
})

async function createSetupFixture(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'shadow-setup-'))
  temporaryDirectories.push(directory)

  const files = [
    '.cta.json',
    'README.md',
    'package.json',
    'scripts/cloudflare-config.ts',
    'scripts/setup.ts',
    'src/routes/__root.tsx',
    'wrangler.jsonc',
  ]

  for (const file of files) {
    const target = join(directory, file)
    await mkdir(dirname(target), { recursive: true })
    await copyFile(join(ROOT, file), target)
  }

  return directory
}

async function writeWranglerStub(directory: string): Promise<void> {
  const binaryPath = join(directory, 'node_modules/.bin/wrangler')
  await mkdir(dirname(binaryPath), { recursive: true })
  await writeFile(
    binaryPath,
    `#!/usr/bin/env bun
import { appendFileSync } from 'node:fs'

const args = process.argv.slice(2)
appendFileSync(process.env.SHADOW_SETUP_TEST_LOG, \`${"${args.join(' ')}"}\\n\`)

if (args[0] === 'auth' && args[1] === 'activate') {
  process.exit(0)
}

if (args[0] === 'whoami' && args[1] === '--json') {
  console.log(JSON.stringify({
    loggedIn: true,
    accounts: [
      { id: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', name: 'Alpha Account' },
      { id: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', name: 'Beta Account' },
    ],
  }))
  process.exit(0)
}

process.exit(1)
`,
  )
  await chmod(binaryPath, 0o755)
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
