import { execFileSync, spawn } from 'node:child_process'
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
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'

const ROOT = resolve(import.meta.dirname, '..')
const BUN = execFileSync('which', ['bun'], { encoding: 'utf-8' }).trim()
const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  )
})

describe('local development', () => {
  test('runs the app against a persistent Turso dev server and stops it afterward', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'shadow-dev-'))
    temporaryDirectories.push(directory)

    const { binDirectory, logPath } = await createFakeCommands(directory)
    const databasePath = join(directory, 'dev.db')
    const port = await findAvailablePort()

    const child = spawn(BUN, ['scripts/dev.ts'], {
      cwd: ROOT,
      env: {
        ...process.env,
        PATH: `${binDirectory}:${process.env.PATH}`,
        SHADOW_DEV_TEST_LOG: logPath,
        TURSO_DEV_DB_FILE: databasePath,
        TURSO_DEV_PORT: String(port),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const stderr: Buffer[] = []
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk))

    const [exitCode] = (await once(child, 'exit')) as [number | null]
    const processLog = await readFile(logPath, 'utf-8')

    expect(Buffer.concat(stderr).toString()).toBe('')
    expect(exitCode).toBe(0)
    expect(processLog).toContain(
      `turso dev --port ${port} --db-file ${databasePath}`,
    )
    expect(processLog).toContain('portless run vp dev')
    expect(processLog).toContain(`database http://127.0.0.1:${port}`)
    expect(processLog).toContain(`local http://127.0.0.1:${port}`)
    expect(processLog).toContain('turso stopped')
  })

  test('does not start the app when the requested Turso port is occupied', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'shadow-dev-'))
    temporaryDirectories.push(directory)

    const { binDirectory, logPath } = await createFakeCommands(directory)
    const databasePath = join(directory, 'dev.db')
    const occupiedServer = createServer()
    occupiedServer.listen(0, '127.0.0.1')
    await once(occupiedServer, 'listening')
    const address = occupiedServer.address()
    const port = typeof address === 'object' && address ? address.port : 0

    const child = spawn(BUN, ['scripts/dev.ts'], {
      cwd: ROOT,
      env: {
        ...process.env,
        PATH: `${binDirectory}:${process.env.PATH}`,
        SHADOW_DEV_TEST_LOG: logPath,
        TURSO_DEV_DB_FILE: databasePath,
        TURSO_DEV_PORT: String(port),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const stderr: Buffer[] = []
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk))

    const [exitCode] = (await once(child, 'exit')) as [number | null]
    occupiedServer.close()
    await once(occupiedServer, 'close')
    const processLog = await readFile(logPath, 'utf-8')

    expect(exitCode).toBe(1)
    expect(Buffer.concat(stderr).toString()).toContain(
      `Turso dev port ${port} is already in use.`,
    )
    expect(processLog).not.toContain('portless')
  })

  test('builds and previews against the supervised Turso server', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'shadow-dev-'))
    temporaryDirectories.push(directory)

    const { binDirectory, logPath } = await createFakeCommands(directory)
    const runtimeRoot = await createRuntimeFixture(directory)
    const databasePath = join(directory, 'dev.db')
    const port = await findAvailablePort()

    const child = spawn(BUN, ['scripts/dev.ts', 'preview'], {
      cwd: runtimeRoot,
      env: {
        ...process.env,
        PATH: `${binDirectory}:${process.env.PATH}`,
        SHADOW_DEV_TEST_CREATE_PREVIEW_ENV: '1',
        SHADOW_DEV_TEST_LOG: logPath,
        TURSO_DEV_DB_FILE: databasePath,
        TURSO_DEV_PORT: String(port),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const stderr: Buffer[] = []
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk))

    const [exitCode] = (await once(child, 'exit')) as [number | null]
    const processLog = await readFile(logPath, 'utf-8')

    expect(Buffer.concat(stderr).toString()).toBe('')
    expect(exitCode).toBe(0)
    expect(processLog).toContain('bun run build')
    expect(processLog).toContain('vp preview')
    expect(processLog).not.toContain('portless')
    expect(processLog).toContain(`database http://127.0.0.1:${port}`)
    expect(processLog).toContain(`local http://127.0.0.1:${port}`)
    expect(processLog).toContain(
      `preview-env TURSO_DATABASE_URL='http://127.0.0.1:${port}'`,
    )
    expect(processLog).toContain("CUSTOM_VALUE='keep'")
    expect(processLog).toContain('turso stopped')
  })

  test('retries with a different port when Turso loses the startup race', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'shadow-dev-'))
    temporaryDirectories.push(directory)

    const { binDirectory, logPath } = await createFakeCommands(directory)
    const databasePath = join(directory, 'dev.db')

    const child = spawn(BUN, ['scripts/dev.ts'], {
      cwd: ROOT,
      env: {
        ...process.env,
        PATH: `${binDirectory}:${process.env.PATH}`,
        SHADOW_DEV_TEST_FAIL_FIRST_TURSO: '1',
        SHADOW_DEV_TEST_LOG: logPath,
        TURSO_DEV_DB_FILE: databasePath,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const stderr: Buffer[] = []
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk))

    const [exitCode] = (await once(child, 'exit')) as [number | null]
    const processLog = await readFile(logPath, 'utf-8')
    const starts = processLog.match(/^turso dev /gm) ?? []

    expect(Buffer.concat(stderr).toString()).toBe('')
    expect(exitCode).toBe(0)
    expect(starts).toHaveLength(2)
    expect(processLog).toContain('portless run vp dev')
  })

  test('stops the app when Turso exits unexpectedly', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'shadow-dev-'))
    temporaryDirectories.push(directory)

    const { binDirectory, logPath } = await createFakeCommands(directory)
    const databasePath = join(directory, 'dev.db')
    const port = await findAvailablePort()

    const child = spawn(BUN, ['scripts/dev.ts'], {
      cwd: ROOT,
      env: {
        ...process.env,
        PATH: `${binDirectory}:${process.env.PATH}`,
        SHADOW_DEV_TEST_APP_EXIT_AFTER: '2000',
        SHADOW_DEV_TEST_LOG: logPath,
        SHADOW_DEV_TEST_TURSO_EXIT_AFTER: '800',
        TURSO_DEV_DB_FILE: databasePath,
        TURSO_DEV_PORT: String(port),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const stderr: Buffer[] = []
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk))

    const [exitCode] = (await once(child, 'exit')) as [number | null]
    const processLog = await readFile(logPath, 'utf-8')

    expect(exitCode).toBe(1)
    expect(Buffer.concat(stderr).toString()).toContain(
      'Turso dev server exited unexpectedly.',
    )
    expect(processLog).toContain('app stopped')
  })

  test('uses a unique Portless name in a detached worktree', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'shadow-dev-'))
    temporaryDirectories.push(directory)

    const { binDirectory, logPath } = await createFakeCommands(directory, {
      detachedWorktreeId: '35a1',
    })
    const databasePath = join(directory, 'dev.db')
    const port = await findAvailablePort()

    const child = spawn(BUN, ['scripts/dev.ts'], {
      cwd: ROOT,
      env: {
        ...process.env,
        PATH: `${binDirectory}:${process.env.PATH}`,
        SHADOW_DEV_TEST_LOG: logPath,
        TURSO_DEV_DB_FILE: databasePath,
        TURSO_DEV_PORT: String(port),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    const [exitCode] = (await once(child, 'exit')) as [number | null]
    const processLog = await readFile(logPath, 'utf-8')
    const packageJson = JSON.parse(
      await readFile(join(ROOT, 'package.json'), 'utf-8'),
    ) as { name: string }

    expect(exitCode).toBe(0)
    expect(processLog).toContain(
      `portless run --name ${packageJson.name}-35a1 vp dev`,
    )
  })

  test('reports a missing Turso CLI immediately', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'shadow-dev-'))
    temporaryDirectories.push(directory)

    const { binDirectory, logPath } = await createFakeCommands(directory, {
      includeTurso: false,
    })
    const startedAt = Date.now()
    const child = spawn(BUN, ['scripts/dev.ts'], {
      cwd: ROOT,
      env: {
        ...process.env,
        PATH: `${binDirectory}:/usr/bin:/bin`,
        SHADOW_DEV_TEST_LOG: logPath,
        TURSO_DEV_DB_FILE: join(directory, 'dev.db'),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const stderr: Buffer[] = []
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk))

    const [exitCode] = (await once(child, 'exit')) as [number | null]

    expect(exitCode).toBe(1)
    expect(Date.now() - startedAt).toBeLessThan(1000)
    expect(Buffer.concat(stderr).toString()).toContain(
      'Turso CLI is required. Install it before running local development.',
    )
  })
})

async function createFakeCommands(
  directory: string,
  options: { detachedWorktreeId?: string; includeTurso?: boolean } = {},
): Promise<{
  binDirectory: string
  logPath: string
}> {
  const binDirectory = join(directory, 'bin')
  const logPath = join(directory, 'processes.log')
  await mkdir(binDirectory)
  await writeFile(logPath, '')
  if (options.includeTurso !== false) {
    await writeExecutable(
      join(binDirectory, 'turso'),
      `#!/usr/bin/env node
const fs = require('node:fs')
const net = require('node:net')
const args = process.argv.slice(2)
const port = Number(args[args.indexOf('--port') + 1])
fs.appendFileSync(process.env.SHADOW_DEV_TEST_LOG, \`turso \${args.join(' ')}\\n\`)
const firstAttemptPath = \`\${process.env.SHADOW_DEV_TEST_LOG}.attempted\`
if (process.env.SHADOW_DEV_TEST_FAIL_FIRST_TURSO && !fs.existsSync(firstAttemptPath)) {
  fs.writeFileSync(firstAttemptPath, '')
  process.exit(1)
}
const server = net.createServer((socket) => socket.end())
server.listen(port, '127.0.0.1', () => {
  const exitAfter = Number(process.env.SHADOW_DEV_TEST_TURSO_EXIT_AFTER)
  if (exitAfter > 0) {
    setTimeout(() => server.close(() => process.exit(2)), exitAfter)
  }
})
const stop = () => server.close(() => {
  fs.appendFileSync(process.env.SHADOW_DEV_TEST_LOG, 'turso stopped\\n')
  process.exit(0)
})
process.on('SIGTERM', stop)
process.on('SIGINT', stop)
`,
    )
  }
  await writeExecutable(
    join(binDirectory, 'portless'),
    `#!/usr/bin/env node
const fs = require('node:fs')
fs.appendFileSync(process.env.SHADOW_DEV_TEST_LOG, \`portless \${process.argv.slice(2).join(' ')}\\n\`)
fs.appendFileSync(process.env.SHADOW_DEV_TEST_LOG, \`database \${process.env.TURSO_DATABASE_URL}\\n\`)
fs.appendFileSync(process.env.SHADOW_DEV_TEST_LOG, \`local \${process.env.SHADOW_LOCAL_TURSO_URL}\\n\`)
const stop = () => {
  fs.appendFileSync(process.env.SHADOW_DEV_TEST_LOG, 'app stopped\\n')
  process.exit(0)
}
process.on('SIGTERM', stop)
process.on('SIGINT', stop)
setTimeout(() => process.exit(0), Number(process.env.SHADOW_DEV_TEST_APP_EXIT_AFTER) || 50)
`,
  )
  await writeExecutable(
    join(binDirectory, 'bun'),
    `#!/usr/bin/env node
const fs = require('node:fs')
const path = require('node:path')
fs.appendFileSync(process.env.SHADOW_DEV_TEST_LOG, \`bun \${process.argv.slice(2).join(' ')}\\n\`)
fs.appendFileSync(process.env.SHADOW_DEV_TEST_LOG, \`database \${process.env.TURSO_DATABASE_URL}\\n\`)
fs.appendFileSync(process.env.SHADOW_DEV_TEST_LOG, \`local \${process.env.SHADOW_LOCAL_TURSO_URL}\\n\`)
if (process.env.SHADOW_DEV_TEST_CREATE_PREVIEW_ENV) {
  const previewEnvPath = path.resolve('dist/server/.dev.vars')
  fs.mkdirSync(path.dirname(previewEnvPath), { recursive: true })
  fs.writeFileSync(previewEnvPath, "TURSO_DATABASE_URL='http://127.0.0.1:8080'\\nTURSO_AUTH_TOKEN=''\\nCUSTOM_VALUE='keep'\\n")
}
`,
  )
  await writeExecutable(
    join(binDirectory, 'vp'),
    `#!/usr/bin/env node
const fs = require('node:fs')
const path = require('node:path')
fs.appendFileSync(process.env.SHADOW_DEV_TEST_LOG, \`vp \${process.argv.slice(2).join(' ')}\\n\`)
fs.appendFileSync(process.env.SHADOW_DEV_TEST_LOG, \`database \${process.env.TURSO_DATABASE_URL}\\n\`)
fs.appendFileSync(process.env.SHADOW_DEV_TEST_LOG, \`local \${process.env.SHADOW_LOCAL_TURSO_URL}\\n\`)
const previewEnvPath = path.resolve('dist/server/.dev.vars')
if (fs.existsSync(previewEnvPath)) {
  fs.appendFileSync(process.env.SHADOW_DEV_TEST_LOG, \`preview-env \${fs.readFileSync(previewEnvPath, 'utf-8')}\`)
}
`,
  )
  if (options.detachedWorktreeId) {
    await writeExecutable(
      join(binDirectory, 'git'),
      `#!/usr/bin/env node
const args = process.argv.slice(2).join(' ')
if (args === 'rev-parse --abbrev-ref HEAD') console.log('HEAD')
if (args === 'rev-parse --git-dir') console.log('/tmp/repo/.git/worktrees/${options.detachedWorktreeId}')
if (args === 'rev-parse --git-common-dir') console.log('/tmp/repo/.git')
`,
    )
  }
  return { binDirectory, logPath }
}

async function createRuntimeFixture(directory: string): Promise<string> {
  const runtimeRoot = join(directory, 'project')
  await mkdir(join(runtimeRoot, 'scripts'), { recursive: true })
  await copyFile(join(ROOT, 'package.json'), join(runtimeRoot, 'package.json'))
  await copyFile(
    join(ROOT, 'scripts/dev.ts'),
    join(runtimeRoot, 'scripts/dev.ts'),
  )
  return runtimeRoot
}

async function findAvailablePort(): Promise<number> {
  const server = createServer()
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  server.close()
  await once(server, 'close')
  return port
}

async function writeExecutable(path: string, content: string): Promise<void> {
  await writeFile(path, content)
  await chmod(path, 0o755)
}
