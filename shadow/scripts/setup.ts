import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { basename, join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const PACKAGE_JSON_PATH = join(ROOT, 'package.json')
const WRANGLER_CONFIG_PATH = join(ROOT, 'wrangler.jsonc')
const CTA_CONFIG_PATH = join(ROOT, '.cta.json')
const ROOT_ROUTE_PATH = join(ROOT, 'src/routes/__root.tsx')
const README_PATH = join(ROOT, 'README.md')
const DEV_VARS_PATH = join(ROOT, '.dev.vars')
const DEV_VARS_PRODUCTION_PATH = join(ROOT, '.dev.vars.production')

type PackageJson = {
  name?: string
  scripts?: Record<string, string>
  portless?: PortlessConfig
}

type PortlessConfig =
  | string
  | {
      name?: string
      script?: string
      appPort?: number
      proxy?: boolean
    }

const args = process.argv.slice(2).filter((arg) => !arg.endsWith('setup.ts'))
const cliName = args[0]?.trim()
const defaultAppName = toKebabCase(basename(ROOT)) || 'shadow'

const appNameInput = cliName ?? ask(`Enter your app name (${defaultAppName}):`)
const appName = normalizeAppName(appNameInput, defaultAppName)

if (!appName) {
  console.error('App name is required.')
  process.exit(1)
}

renameProject(appName)
ensureSetupScript()
updateReadme(appName)

const tursoConfigured = configureTurso(appName)

console.log(`✨ Project configured as "${appName}"`)
if (tursoConfigured) {
  console.log('✨ Turso environment variables have been set.')
} else {
  console.log(
    'ℹ️ Turso setup was skipped. Before running db commands, configure .dev.vars manually or run `bun run setup` again.',
  )
}

function configureTurso(projectName: string): boolean {
  if (!confirm('Configure Turso now? (y/N):', false)) {
    return false
  }

  if (!hasCommand('turso')) {
    console.log('ℹ️ Turso CLI was not found. Falling back to manual env input.')
    return configureTursoManually()
  }

  if (!ensureTursoLogin()) {
    return configureTursoManually()
  }

  const shouldCreateDatabase = confirm(
    'Create a new Turso database now? (Y/n):',
    true,
  )
  const defaultDatabaseName = toKebabCase(projectName) || 'shadow'
  const databaseName = askRequired(
    `Turso database name (${defaultDatabaseName}):`,
    defaultDatabaseName,
  )

  try {
    if (shouldCreateDatabase) {
      const groupName = selectTursoGroup()
      const createArgs = ['db', 'create', databaseName]

      if (groupName) {
        createArgs.push('--group', groupName)
      }

      createArgs.push('--wait')
      runTursoCommand(createArgs, 'Failed to create Turso database.')
    }

    const databaseUrl = runTursoCommand(
      ['db', 'show', databaseName, '--url'],
      'Failed to fetch Turso database URL.',
    )
    const authToken = runTursoCommand(
      ['db', 'tokens', 'create', databaseName],
      'Failed to create Turso auth token.',
    )

    writeTursoEnv(DEV_VARS_PATH, databaseUrl, authToken)

    if (
      confirm(
        'Also write the same Turso values to .dev.vars.production? This can point deploys at the same DB. (y/N):',
        false,
      )
    ) {
      writeTursoEnv(DEV_VARS_PRODUCTION_PATH, databaseUrl, authToken)
    }

    return true
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Turso setup failed.'
    console.error(message)
    return configureTursoManually()
  }
}

function configureTursoManually(): boolean {
  if (!confirm('Enter Turso URL and token manually? (Y/n):', true)) {
    return false
  }

  const databaseUrl = askRequired('TURSO_DATABASE_URL:', '')
  const authToken = askRequired('TURSO_AUTH_TOKEN:', '')

  writeTursoEnv(DEV_VARS_PATH, databaseUrl, authToken)

  if (
    confirm(
      'Also write the same Turso values to .dev.vars.production? This can point deploys at the same DB. (y/N):',
      false,
    )
  ) {
    writeTursoEnv(DEV_VARS_PRODUCTION_PATH, databaseUrl, authToken)
  }

  return true
}

function selectTursoGroup(): string | null {
  try {
    const groups = getTursoGroups()

    if (groups.length === 0) {
      return askOptionalGroupName()
    }

    console.log('Available Turso groups:')
    groups.forEach((group, index) => {
      console.log(`${index + 1}. ${group}`)
    })

    const manualOption = groups.length + 1
    console.log(`${manualOption}. Enter group manually`)

    return selectGroupFromChoices(groups, manualOption)
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to fetch Turso groups.'
    console.log(`ℹ️ ${message}`)
    return askOptionalGroupName()
  }
}

function selectGroupFromChoices(
  groups: string[],
  manualOption: number,
): string | null {
  const answer = ask(
    `Select a Turso group [1-${manualOption}] or type a group name directly (Enter to skip):`,
  )

  if (!answer) {
    return null
  }

  const selectedIndex = Number(answer)

  if (Number.isInteger(selectedIndex)) {
    if (selectedIndex >= 1 && selectedIndex <= groups.length) {
      return groups[selectedIndex - 1]
    }

    if (selectedIndex === manualOption) {
      return askRequired('Enter Turso group name:', '')
    }

    console.log('Please choose one of the listed options or type a group name.')
    return selectGroupFromChoices(groups, manualOption)
  }

  return answer
}

function askOptionalGroupName(): string | null {
  const groupName = ask(
    'Enter Turso group name (leave blank to use Turso default placement):',
  )

  return groupName || null
}

function getTursoGroups(): string[] {
  const output = runTursoCommand(
    ['group', 'list'],
    'Failed to list Turso groups.',
  )

  const groups = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => !/^name(\s|$)/i.test(line))
    .filter((line) => !/^[-\s]+$/.test(line))
    .map((line) => line.split(/\s+/)[0])
    .filter((line) => line.length > 0)

  return [...new Set(groups)]
}

function ensureTursoLogin(): boolean {
  const whoami = spawnSync('turso', ['auth', 'whoami'], {
    cwd: ROOT,
    encoding: 'utf-8',
  })
  const whoamiOutput = [whoami.stdout, whoami.stderr].join('\n').trim()

  if (whoami.status === 0 && !isTursoAuthMessage(whoamiOutput)) {
    return true
  }

  console.log('ℹ️ You are not logged in to Turso.')

  if (!confirm('Run `turso auth login` now? (Y/n):', true)) {
    return false
  }

  const login = spawnSync('turso', ['auth', 'login'], {
    cwd: ROOT,
    stdio: 'inherit',
  })

  if (login.status !== 0) {
    console.error('Failed to log in to Turso.')
    return false
  }

  const verify = spawnSync('turso', ['auth', 'whoami'], {
    cwd: ROOT,
    encoding: 'utf-8',
  })
  const verifyOutput = [verify.stdout, verify.stderr].join('\n').trim()

  if (verify.status !== 0 || isTursoAuthMessage(verifyOutput)) {
    console.error('Turso login could not be verified.')
    return false
  }

  return true
}

function runTursoCommand(args: string[], errorMessage: string): string {
  const result = spawnSync('turso', args, {
    cwd: ROOT,
    encoding: 'utf-8',
  })
  const detail = [result.stdout, result.stderr].join('\n').trim()

  if (result.status !== 0 || isTursoAuthMessage(detail)) {
    throw new Error(detail || errorMessage)
  }

  return result.stdout.trim()
}

function isTursoAuthMessage(output: string): boolean {
  return output.includes('You are not logged in')
}

function writeTursoEnv(
  filePath: string,
  databaseUrl: string,
  authToken: string,
): void {
  const updated = updateEnvContent(
    existsSync(filePath) ? readFileSync(filePath, 'utf-8') : '',
    {
      TURSO_DATABASE_URL: databaseUrl,
      TURSO_AUTH_TOKEN: authToken,
    },
  )
  writeFileSync(filePath, `${updated}\n`)
}

function updateEnvContent(
  content: string,
  entries: Record<string, string>,
): string {
  const lines = content
    .split(/\r?\n/)
    .filter((line, index, array) => line.length > 0 || index < array.length - 1)
  const keys = new Set(Object.keys(entries))
  const seen = new Set<string>()

  const nextLines = lines.map((line) => {
    const match = line.match(/^([A-Z0-9_]+)=.*$/)
    const key = match?.[1]

    if (!key || !keys.has(key)) {
      return line
    }

    seen.add(key)
    return `${key}=${entries[key]}`
  })

  for (const [key, value] of Object.entries(entries)) {
    if (!seen.has(key)) {
      nextLines.push(`${key}=${value}`)
    }
  }

  return nextLines
    .filter((line, index, array) => line.length > 0 || index < array.length - 1)
    .join('\n')
}

function renameProject(nextAppName: string): void {
  const nextPackageJson = JSON.parse(
    readFileSync(PACKAGE_JSON_PATH, 'utf-8'),
  ) as PackageJson
  nextPackageJson.name = nextAppName
  nextPackageJson.portless = updatePortlessName(
    nextPackageJson.portless,
    nextAppName,
  )
  writeJson(PACKAGE_JSON_PATH, nextPackageJson)

  const nextCtaConfig = JSON.parse(readFileSync(CTA_CONFIG_PATH, 'utf-8')) as {
    projectName?: string
  }
  nextCtaConfig.projectName = nextAppName
  writeJson(CTA_CONFIG_PATH, nextCtaConfig)

  const wranglerConfig = readFileSync(WRANGLER_CONFIG_PATH, 'utf-8').replace(
    /"name":\s*"[^"]+"/,
    `"name": "${nextAppName}"`,
  )
  writeFileSync(WRANGLER_CONFIG_PATH, wranglerConfig)

  const rootRoute = readFileSync(ROOT_ROUTE_PATH, 'utf-8').replace(
    /title:\s*'[^']+'/,
    `title: '${nextAppName}'`,
  )
  writeFileSync(ROOT_ROUTE_PATH, rootRoute)
}

function ensureSetupScript(): void {
  const packageJson = JSON.parse(
    readFileSync(PACKAGE_JSON_PATH, 'utf-8'),
  ) as PackageJson
  packageJson.scripts ??= {}
  packageJson.scripts.setup = 'bun scripts/setup.ts'
  writeJson(PACKAGE_JSON_PATH, packageJson)
}

function updatePortlessName(
  currentConfig: PortlessConfig | undefined,
  appName: string,
): Exclude<PortlessConfig, string> {
  if (!currentConfig || typeof currentConfig === 'string') {
    return {
      name: appName,
    }
  }

  const nextConfig = {
    ...currentConfig,
    name: appName,
  }

  delete nextConfig.script

  return nextConfig
}

function updateReadme(projectName: string): void {
  if (!existsSync(README_PATH)) {
    return
  }

  const currentReadme = readFileSync(README_PATH, 'utf-8')
  const nextReadme = currentReadme.replace(/^#\s+.+$/m, `# ${projectName}`)

  if (nextReadme !== currentReadme) {
    writeFileSync(README_PATH, nextReadme)
  }
}

function writeJson(filePath: string, value: unknown): void {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

function hasCommand(command: string): boolean {
  const result = spawnSync(command, ['--version'], {
    cwd: ROOT,
    encoding: 'utf-8',
  })
  return result.status === 0
}

function normalizeAppName(value: string | null, fallback: string): string {
  const normalized = toKebabCase(value?.trim() || fallback)
  return normalized || fallback
}

function toKebabCase(value: string | null | undefined): string | undefined {
  return value
    ?.trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function ask(question: string): string | null {
  return prompt(question)?.trim() ?? null
}

function askRequired(question: string, fallback: string): string {
  while (true) {
    const answer = ask(question)
    if (answer) {
      return answer
    }
    if (fallback) {
      return fallback
    }
    console.log('This value is required.')
  }
}

function confirm(question: string, defaultValue: boolean): boolean {
  const answer = ask(question)

  if (!answer) {
    return defaultValue
  }

  const normalized = answer.toLowerCase()
  if (['y', 'yes'].includes(normalized)) {
    return true
  }
  if (['n', 'no'].includes(normalized)) {
    return false
  }

  console.log('Please answer with y or n.')
  return confirm(question, defaultValue)
}
