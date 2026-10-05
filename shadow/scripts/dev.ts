import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { connect, createServer } from 'node:net'
import { basename, dirname, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const DEFAULT_DATABASE_FILE = '.turso/dev.db'
const DEFAULT_PORT = 8080
const DEFAULT_PORTLESS_PROXY_PORT = '1355'
const STARTUP_TIMEOUT_MS = 10_000
const STARTUP_STABILITY_MS = 50

const mode = readMode(process.argv[2])
const databaseFile = process.env.TURSO_DEV_DB_FILE || DEFAULT_DATABASE_FILE
const databasePath = resolve(ROOT, databaseFile)

mkdirSync(dirname(databasePath), { recursive: true })

let turso: ChildProcess | undefined
let app: ChildProcess | undefined
let receivedSignal: NodeJS.Signals | undefined

process.once('SIGINT', () => stopForSignal('SIGINT'))
process.once('SIGTERM', () => stopForSignal('SIGTERM'))

try {
  const configuredPort = readPort(process.env.TURSO_DEV_PORT)
  const startedTurso = await startTurso(configuredPort)
  turso = startedTurso.child

  const runtimeEnv = {
    ...process.env,
    SHADOW_LOCAL_TURSO_URL: `http://127.0.0.1:${startedTurso.port}`,
    TURSO_AUTH_TOKEN: '',
    TURSO_DATABASE_URL: `http://127.0.0.1:${startedTurso.port}`,
  }

  if (mode === 'preview') {
    app = spawn('pnpm', ['run', 'build'], {
      cwd: ROOT,
      env: runtimeEnv,
      stdio: 'inherit',
    })
    const buildResult = await waitForExit(app)
    if (buildResult.code !== 0) {
      throw new Error('Preview build failed.')
    }
    updatePreviewEnv(startedTurso.port)
  }

  app = spawnApp(mode, runtimeEnv)
  const outcome = await Promise.race([
    waitForExit(app).then((result) => ({ kind: 'app' as const, result })),
    waitForExit(turso).then((result) => ({ kind: 'turso' as const, result })),
  ])

  if (outcome.kind === 'turso') {
    await stopProcess(app)
    if (!receivedSignal) {
      throw new Error('Turso dev server exited unexpectedly.')
    }
  } else {
    await stopProcess(turso)
  }

  process.exitCode = receivedSignal
    ? signalExitCode(receivedSignal)
    : (outcome.result.code ?? 1)
} catch (error) {
  stopChildren('SIGTERM')
  const message = error instanceof Error ? error.message : String(error)
  console.error(message)
  process.exitCode = 1
}

type Mode = 'dev' | 'preview'

function readMode(value: string | undefined): Mode {
  if (!value || value === 'dev') {
    return 'dev'
  }
  if (value === 'preview') {
    return 'preview'
  }
  throw new Error(`Unknown local runtime mode: ${value}`)
}

async function startTurso(
  configuredPort: number | undefined,
): Promise<{ child: ChildProcess; port: number }> {
  const initial = await startTursoOnPort(await selectPort(configuredPort))
  if (initial.success) return initial.value
  if (configuredPort) throw initial.error
  const retry = await startTursoOnPort(await findAvailablePort())
  if (!retry.success) throw retry.error
  return retry.value
}

async function startTursoOnPort(port: number) {
  const child = spawn(
    'turso',
    ['dev', '--port', String(port), '--db-file', databasePath],
    { cwd: ROOT, stdio: 'inherit' },
  )
  try {
    await waitForPort(child, port)
    return { success: true as const, value: { child, port } }
  } catch (error) {
    if (isMissingExecutable(error))
      throw new Error(
        'Turso CLI is required. Install it before running local development.',
      )
    await stopProcess(child)
    return { success: false as const, error }
  }
}

function spawnApp(runtimeMode: Mode, env: NodeJS.ProcessEnv): ChildProcess {
  if (runtimeMode === 'preview') {
    return spawn('vp', ['preview'], {
      cwd: ROOT,
      env,
      stdio: 'inherit',
    })
  }

  const detachedName = getDetachedWorktreeName()
  const args = [
    'run',
    ...(detachedName ? ['--name', detachedName] : []),
    'vp',
    'dev',
  ]

  return spawn('portless', args, {
    cwd: ROOT,
    env: {
      ...env,
      PORTLESS_PORT: env.PORTLESS_PORT || DEFAULT_PORTLESS_PROXY_PORT,
    },
    stdio: 'inherit',
  })
}

function updatePreviewEnv(port: number): void {
  const previewEnvPath = resolve(
    ROOT,
    '.cloudflare/output/v0/workers/default/.dev.vars',
  )
  if (!existsSync(previewEnvPath)) {
    return
  }

  const databaseUrl = `http://127.0.0.1:${port}`
  const content = readFileSync(previewEnvPath, 'utf-8')
    .replace(/^TURSO_DATABASE_URL=.*$/m, `TURSO_DATABASE_URL='${databaseUrl}'`)
    .replace(/^TURSO_AUTH_TOKEN=.*$/m, "TURSO_AUTH_TOKEN=''")
  writeFileSync(previewEnvPath, content)
}

function getDetachedWorktreeName(): string | undefined {
  if (runGit(['rev-parse', '--abbrev-ref', 'HEAD']) !== 'HEAD') return undefined
  const gitDirectory = getLinkedWorktreeDirectory()
  if (!gitDirectory) return undefined
  const worktreeId = toHostnamePart(basename(gitDirectory))
  return worktreeId ? `${getPortlessName()}-${worktreeId}` : undefined
}

function getLinkedWorktreeDirectory(): string | undefined {
  const gitDirectory = runGit(['rev-parse', '--git-dir'])
  const commonDirectory = runGit(['rev-parse', '--git-common-dir'])
  if (!gitDirectory || !commonDirectory) return undefined
  if (resolve(ROOT, gitDirectory) === resolve(ROOT, commonDirectory))
    return undefined
  return gitDirectory
}

function getPortlessName(): string {
  const packageJson = JSON.parse(
    readFileSync(resolve(ROOT, 'package.json'), 'utf-8'),
  ) as { name?: string; portless?: string | { name?: string } }
  return (
    getConfiguredPortlessName(packageJson.portless) ||
    packageJson.name ||
    basename(ROOT)
  )
}

function getConfiguredPortlessName(
  value: string | { name?: string } | undefined,
): string | undefined {
  return typeof value === 'string' ? value : value?.name
}

function runGit(args: string[]): string | undefined {
  try {
    return execFileSync('git', args, {
      cwd: ROOT,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return undefined
  }
}

function toHostnamePart(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function readPort(value: string | undefined): number | undefined {
  if (!value) {
    return undefined
  }

  const parsed = Number(value)
  if (!isValidPort(parsed)) {
    throw new Error(`Invalid TURSO_DEV_PORT: ${value}`)
  }
  return parsed
}

async function selectPort(configuredPort: number | undefined): Promise<number> {
  if (configuredPort) {
    if (await canConnect(configuredPort)) {
      throw new Error(`Turso dev port ${configuredPort} is already in use.`)
    }
    return configuredPort
  }

  if (!(await canConnect(DEFAULT_PORT))) {
    return DEFAULT_PORT
  }

  const availablePort = await findAvailablePort()
  console.log(
    `Port ${DEFAULT_PORT} is in use. Turso dev will use port ${availablePort}.`,
  )
  return availablePort
}

async function waitForPort(child: ChildProcess, targetPort: number) {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS
  let spawnError: Error | undefined
  const captureSpawnError = (error: Error) => {
    spawnError = error
  }
  child.once('error', captureSpawnError)
  try {
    while (Date.now() < deadline) {
      assertTursoRunning(child, spawnError)
      if (await canConnect(targetPort)) {
        await delay(STARTUP_STABILITY_MS)
        assertTursoRunning(child, spawnError)
        return
      }
      await delay(50)
    }
  } finally {
    child.off('error', captureSpawnError)
  }
  throw new Error(
    `Turso dev server did not become ready on port ${targetPort}.`,
  )
}

function assertTursoRunning(
  child: ChildProcess,
  spawnError: Error | undefined,
): void {
  if (spawnError) throw spawnError
  if (!isRunning(child))
    throw new Error('Turso dev server exited before it became ready.')
}

function isRunning(child: ChildProcess): boolean {
  return child.exitCode === null && child.signalCode === null
}

function isValidPort(port: number): boolean {
  return Number.isInteger(port) && port >= 1 && port <= 65_535
}

function isMissingExecutable(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as Error & { code?: string }).code === 'ENOENT'
  )
}

function canConnect(targetPort: number): Promise<boolean> {
  return new Promise((resolveConnection) => {
    const socket = connect({ host: '127.0.0.1', port: targetPort })
    socket.once('connect', () => {
      socket.destroy()
      resolveConnection(true)
    })
    socket.once('error', () => resolveConnection(false))
  })
}

function findAvailablePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close()
        reject(new Error('Failed to find an available Turso dev port.'))
        return
      }
      server.close((error) => {
        if (error) {
          reject(error)
          return
        }
        resolvePort(address.port)
      })
    })
  })
}

function waitForExit(
  child: ChildProcess,
): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
  return new Promise((resolveExit, reject) => {
    child.once('error', reject)
    child.once('exit', (code, signal) => resolveExit({ code, signal }))
  })
}

async function stopProcess(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return
  }

  const exit = waitForExit(child)
  if (!child.kill('SIGTERM')) {
    return
  }
  await exit
}

function stopForSignal(signal: NodeJS.Signals): void {
  receivedSignal = signal
  stopChildren(signal)
}

function stopChildren(signal: NodeJS.Signals): void {
  for (const child of [app, turso]) {
    if (child && isRunning(child)) child.kill(signal)
  }
}

function signalExitCode(signal: NodeJS.Signals): number {
  return signal === 'SIGINT' ? 130 : 143
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds))
}
