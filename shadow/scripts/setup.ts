import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { spawnSync } from 'node:child_process'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import * as prompts from '@clack/prompts'
import { pinProductionDatabase } from './production-database.ts'
import {
  findCloudflareCredentialEnvironmentVariable,
  isNamedCloudflareProfile,
  parseCloudflareAccounts,
  parseCloudflareConfiguration,
  resolveCloudflareCommand,
  suppressCloudflareCredentialEnvironmentVariables,
  type CloudflareAccount,
  type CloudflareConfiguration as StoredCloudflareConfiguration,
} from './cloudflare-config.ts'

const ROOT = resolve(import.meta.dirname, '..')
const PACKAGE_JSON_PATH = join(ROOT, 'package.json')
const WORKER_CONFIG_PATH = join(ROOT, 'cloudflare.config.ts')
const CTA_CONFIG_PATH = join(ROOT, '.cta.json')
const ROOT_ROUTE_PATH = join(ROOT, 'src/routes/__root.tsx')
const README_PATH = join(ROOT, 'README.md')
const DEV_VARS_PATH = join(ROOT, '.dev.vars')
const DEV_VARS_PRODUCTION_PATH = join(ROOT, '.dev.vars.production')
const CLOUDFLARE_CONFIG_PATH = join(ROOT, '.cloudflare.json')
const WORKTREE_INCLUDE_FILE_NAMES = [
  '.dev.vars',
  '.cloudflare.json',
  '.dev.vars.production',
]
const WORKTREE_SETUP_SCRIPT_PATH = join(ROOT, 'scripts', 'setup-worktree.mjs')
const EFFECT_SOURCE_IGNORE_PATTERN = '/.repos/effect/'
const T3_SCHEMA_URL = 'https://t3.codes/schema/t3.json'
const LEGACY_T3_WORKTREE_SETUP_SCRIPT_NAME = 'Apply .worktreeinclude'
const DEFAULT_TURSO_LOCATION = 'aws-ap-northeast-1'

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

type GroupSelection =
  | { kind: 'skip' }
  | { kind: 'group'; value: string }
  | { kind: 'manual' }
  | { kind: 'invalid' }

type CloudflareConfiguration = {
  profile: string
  account: CloudflareAccount
}

class SetupCancelled extends Error {}

const args = process.argv.slice(2).filter((arg) => !arg.endsWith('setup.ts'))
const cliName = args[0]?.trim()
const defaultAppName = toKebabCase(basename(ROOT)) || 'shadow'
const interactive = Boolean(
  process.stdin.isTTY && process.stdout.isTTY && process.env.TERM !== 'dumb',
)
const promptInput = interactive
  ? undefined
  : createInterface({
      input: process.stdin,
      terminal: false,
      crlfDelay: Infinity,
    })
const promptLines = promptInput?.[Symbol.asyncIterator]()
promptInput?.pause()
const log = interactive
  ? prompts.log
  : {
      info: console.log,
      success: console.log,
      step: console.log,
      warn: console.warn,
      error: console.error,
    }

try {
  if (interactive) prompts.intro('Shadow · Project setup')
  const appNameInput =
    cliName ?? (await ask('Enter your app name', defaultAppName))
  const appName = normalizeAppName(appNameInput, defaultAppName)

  if (!appName) {
    log.error('App name is required.')
    process.exit(1)
  }

  renameProject(appName)
  ensureSetupScript()
  updateReadme(appName)
  configureLocalTurso()
  const repositoryRoot = findRepositoryRoot()
  configureWorktreeIncludes(repositoryRoot)
  configureEffectSourceIgnore(repositoryRoot)
  configureProjectAgentContext(repositoryRoot)
  configureT3Project(repositoryRoot, appName)
  log.step('Local project, skills and worktree configuration saved.')

  const productionTursoConfigured = await configureProductionTurso(appName)
  const cloudflareConfiguration = await configureCloudflareDeployment()

  log.success('Local Turso dev server variables have been set.')
  log.success('Worktree local files have been registered.')
  log.success('T3 Code worktree setup has been registered.')
  if (productionTursoConfigured) {
    log.success('Production Turso environment variables have been set.')
    log.success(
      'Production database hostname is pinned in turso.production.json.',
    )
  } else {
    log.info(
      'Production Turso setup was skipped. Configure .dev.vars.production before deploying and turso.production.json before migrating.',
    )
  }
  if (cloudflareConfiguration) {
    const { profile, account } = cloudflareConfiguration
    log.success(
      `Cloudflare profile "${profile}" is pinned to ${account.name} (${account.id}).`,
    )
    log.info(
      'Cloudflare resources and API tokens were not created. Add bindings during development, then run `pnpm run cloudflare plan`.',
    )
  } else {
    log.info(
      'Cloudflare setup was skipped; any existing deployment configuration was left unchanged.',
    )
  }
  const completion = `Project configured as "${appName}"`
  if (interactive) prompts.outro(completion)
  else log.success(completion)
} catch (error) {
  if (!(error instanceof SetupCancelled)) throw error
  if (interactive) prompts.cancel(error.message)
  else log.error(error.message)
  process.exitCode = 1
} finally {
  promptInput?.close()
}

function configureLocalTurso(): void {
  writeTursoEnv(DEV_VARS_PATH, 'http://127.0.0.1:8080', '')
}

function configureWorktreeIncludes(repositoryRoot: string): void {
  const worktreeIncludePath = join(repositoryRoot, '.worktreeinclude')
  const patterns = WORKTREE_INCLUDE_FILE_NAMES.map((fileName) => {
    const filePath = join(ROOT, fileName)
    return `/${relative(repositoryRoot, filePath).replaceAll('\\', '/')}`
  })
  const currentContent = existsSync(worktreeIncludePath)
    ? readFileSync(worktreeIncludePath, 'utf-8')
    : ''
  const missingPatterns = patterns.filter(
    (pattern) => !hasActivePattern(currentContent, pattern),
  )
  appendPatterns(worktreeIncludePath, currentContent, missingPatterns)
}

function appendPatterns(
  filePath: string,
  content: string,
  patterns: string[],
): void {
  if (!patterns.length) return
  writeFileSync(
    filePath,
    `${withFinalNewline(content)}${patterns.join('\n')}\n`,
  )
}

function withFinalNewline(content: string): string {
  return content.length === 0 || content.endsWith('\n')
    ? content
    : `${content}\n`
}

function configureProjectAgentContext(repositoryRoot: string): void {
  if (repositoryRoot === ROOT) return
  configureRootSkills(repositoryRoot)
  configureRootAgentInstructions(repositoryRoot)
}

function configureRootSkills(repositoryRoot: string): void {
  const skillDirectory = join(ROOT, '.agents', 'skills')
  if (!existsSync(skillDirectory)) return
  const rootSkillDirectory = join(repositoryRoot, '.agents', 'skills')
  mkdirSync(rootSkillDirectory, { recursive: true })
  const skills = readdirSync(skillDirectory, { withFileTypes: true }).filter(
    (entry) => entry.isDirectory(),
  )
  for (const entry of skills) {
    const source = join(skillDirectory, entry.name)
    if (existsSync(join(source, 'SKILL.md'))) {
      linkRootSkill(
        repositoryRoot,
        source,
        join(rootSkillDirectory, entry.name),
      )
    }
  }
}

function linkRootSkill(
  repositoryRoot: string,
  source: string,
  target: string,
): void {
  const existing = lstatSync(target, { throwIfNoEntry: false })
  if (existing) {
    if (
      !existing.isSymbolicLink() ||
      resolve(dirname(target), readlinkSync(target)) !== source
    ) {
      log.warn(
        `Existing project skill "${relative(repositoryRoot, target)}" was preserved. Use "${relative(repositoryRoot, source)}" for this application.`,
      )
    }
    return
  }
  symlinkSync(relative(dirname(target), source), target, 'dir')
}

function configureRootAgentInstructions(repositoryRoot: string): void {
  if (!existsSync(join(ROOT, 'AGENTS.md'))) return
  const filePath = join(repositoryRoot, 'AGENTS.md')
  const appDirectory = relative(repositoryRoot, ROOT).replaceAll('\\', '/')
  const instruction = `- Before working in \`${appDirectory}/\`, read \`${appDirectory}/AGENTS.md\` and follow its project skill instructions in \`${appDirectory}/.agents/skills/\`. Run application commands from \`${appDirectory}/\`.`
  const content = existsSync(filePath)
    ? readFileSync(filePath, 'utf-8')
    : '# Application instructions\n'
  if (content.includes(instruction)) return
  writeFileSync(filePath, `${withFinalNewline(content)}\n${instruction}\n`)
}

function configureT3Project(repositoryRoot: string, appName: string): void {
  const t3ProjectPath = join(repositoryRoot, 't3.json')
  const configuration = readT3Project(t3ProjectPath)
  const scripts = readT3Scripts(configuration)
  const worktreeSetupScript = createT3WorktreeSetupScript(
    repositoryRoot,
    appName,
  )
  const matchingScriptIndex = scripts.findIndex(
    (script) => script.command === worktreeSetupScript.command,
  )
  const scriptIndex =
    matchingScriptIndex >= 0
      ? matchingScriptIndex
      : scripts.findIndex(
          (script) =>
            script.name === LEGACY_T3_WORKTREE_SETUP_SCRIPT_NAME &&
            script.command === 'git worktreeinclude apply',
        )

  if (scriptIndex === -1) {
    scripts.push(worktreeSetupScript)
  } else {
    scripts[scriptIndex] = {
      ...scripts[scriptIndex],
      ...worktreeSetupScript,
    }
  }

  const { $schema, ...otherConfiguration } = configuration
  writeJson(t3ProjectPath, {
    $schema: typeof $schema === 'string' ? $schema : T3_SCHEMA_URL,
    ...otherConfiguration,
    scripts,
  })
}

function configureEffectSourceIgnore(repositoryRoot: string): void {
  const gitIgnorePath = join(repositoryRoot, '.gitignore')
  const currentContent = existsSync(gitIgnorePath)
    ? readFileSync(gitIgnorePath, 'utf-8')
    : ''
  if (hasActiveDirectoryPattern(currentContent, EFFECT_SOURCE_IGNORE_PATTERN))
    return
  appendPatterns(gitIgnorePath, currentContent, [EFFECT_SOURCE_IGNORE_PATTERN])
}

function createT3WorktreeSetupScript(
  repositoryRoot: string,
  appName: string,
): Record<string, unknown> {
  const appDirectory = relative(repositoryRoot, ROOT).replaceAll('\\', '/')
  const scriptPath = relative(
    repositoryRoot,
    WORKTREE_SETUP_SCRIPT_PATH,
  ).replaceAll('\\', '/')

  return {
    name: `Setup ${appDirectory || appName} Worktree`,
    command: `node ${quoteShellArgument(scriptPath)}`,
    icon: 'configure',
    runOnWorktreeCreate: true,
  }
}

function quoteShellArgument(value: string): string {
  return `'${value.replaceAll("'", "'\"'\"'")}'`
}

function hasActiveDirectoryPattern(content: string, pattern: string): boolean {
  const withoutLeadingSlash = pattern.replace(/^\//, '')
  const withoutTrailingSlash = pattern.replace(/\/$/, '')
  return isActivePattern(
    content,
    new Set([
      pattern,
      withoutLeadingSlash,
      withoutTrailingSlash,
      withoutLeadingSlash.replace(/\/$/, ''),
    ]),
  )
}

function readT3Project(filePath: string): Record<string, unknown> {
  if (!existsSync(filePath)) {
    return {}
  }

  try {
    const parsed: unknown = JSON.parse(readFileSync(filePath, 'utf-8'))
    if (isRecord(parsed)) {
      return parsed
    }
  } catch {
    throw new Error('Existing t3.json is not valid JSON.')
  }

  throw new Error('Existing t3.json must contain a JSON object.')
}

function readT3Scripts(
  configuration: Record<string, unknown>,
): Record<string, unknown>[] {
  if (configuration.scripts === undefined) {
    return []
  }
  if (
    !Array.isArray(configuration.scripts) ||
    !configuration.scripts.every(isRecord)
  ) {
    throw new Error('Existing t3.json scripts must be an array of objects.')
  }

  return configuration.scripts.map((script) => ({ ...script }))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function findRepositoryRoot(): string {
  const result = spawnSync('git', ['rev-parse', '--show-toplevel'], {
    cwd: ROOT,
    encoding: 'utf-8',
  })
  const repositoryRoot = result.stdout.trim()

  return result.status === 0 && repositoryRoot ? resolve(repositoryRoot) : ROOT
}

function hasActivePattern(content: string, pattern: string): boolean {
  return isActivePattern(content, new Set([pattern, pattern.slice(1)]))
}

function isActivePattern(
  content: string,
  equivalentPatterns: ReadonlySet<string>,
): boolean {
  return content.split(/\r?\n/).reduce((active, line) => {
    const candidate = line.trim()
    if (equivalentPatterns.has(candidate)) return true
    if (candidate.startsWith('!') && equivalentPatterns.has(candidate.slice(1)))
      return false
    return active
  }, false)
}

async function configureProductionTurso(projectName: string): Promise<boolean> {
  if (!(await confirm('Configure production Turso now?', false))) {
    return false
  }

  if (!(await canConfigureTursoAutomatically())) {
    return configureTursoManually()
  }

  const shouldCreateDatabase = await confirm(
    'Create a new Turso database now?',
    true,
  )
  const defaultDatabaseName = toKebabCase(projectName) || 'shadow'
  const databaseName = await askRequired(
    'Turso database name',
    defaultDatabaseName,
  )

  return configureTursoWithCli(databaseName, shouldCreateDatabase)
}

async function canConfigureTursoAutomatically(): Promise<boolean> {
  if (hasCommand('turso')) {
    return ensureTursoLogin()
  }

  log.info('Turso CLI was not found. Falling back to manual env input.')
  return false
}

async function configureTursoWithCli(
  databaseName: string,
  shouldCreateDatabase: boolean,
): Promise<boolean> {
  try {
    await createTursoDatabase(databaseName, shouldCreateDatabase)
    writeTursoCredentials(getTursoCredentials(databaseName))

    return true
  } catch (error) {
    if (error instanceof SetupCancelled) throw error
    const message =
      error instanceof Error ? error.message : 'Turso setup failed.'
    log.error(message)
    return configureTursoManually()
  }
}

async function createTursoDatabase(
  databaseName: string,
  shouldCreateDatabase: boolean,
): Promise<void> {
  if (!shouldCreateDatabase) {
    return
  }

  const groupName = await selectTursoGroup()
  const groupArgs = groupName
    ? ['--group', groupName]
    : [
        '--location',
        await askRequired('Turso location', DEFAULT_TURSO_LOCATION),
      ]
  runTursoCommand(
    ['db', 'create', databaseName, ...groupArgs, '--wait'],
    'Failed to create Turso database.',
  )
}

function getTursoCredentials(databaseName: string) {
  return {
    databaseUrl: runTursoCommand(
      ['db', 'show', databaseName, '--url'],
      'Failed to fetch Turso database URL.',
    ),
    authToken: runTursoCommand(
      ['db', 'tokens', 'create', databaseName],
      'Failed to create Turso auth token.',
    ),
  }
}

function writeTursoCredentials({
  databaseUrl,
  authToken,
}: ReturnType<typeof getTursoCredentials>): void {
  pinProductionDatabase(
    databaseUrl,
    new URL('../turso.production.json', import.meta.url),
  )
  writeTursoEnv(DEV_VARS_PRODUCTION_PATH, databaseUrl, authToken)
}

async function configureTursoManually(): Promise<boolean> {
  if (!(await confirm('Enter Turso URL and token manually?', true))) {
    return false
  }

  const databaseUrl = await askRequired('TURSO_DATABASE_URL', '')
  const authToken = await askRequired('TURSO_AUTH_TOKEN', '', true)

  writeTursoCredentials({ databaseUrl, authToken })

  return true
}

async function selectTursoGroup(): Promise<string | null> {
  try {
    const groups = getTursoGroups()

    if (groups.length === 0) {
      return askOptionalGroupName()
    }

    if (interactive) return selectTursoGroupInteractively(groups)

    log.info('Choose a Japan group to match the Worker placement in Tokyo:')
    groups.forEach((group, index) => {
      log.info(`${index + 1}. ${group}`)
    })

    const manualOption = groups.length + 1
    log.info(`${manualOption}. Enter group manually`)

    return selectGroupFromChoices(groups, manualOption)
  } catch (error) {
    log.info(setupErrorMessage(error, 'Failed to fetch Turso groups.'))
    return askOptionalGroupName()
  }
}

function setupErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

async function selectTursoGroupInteractively(
  groups: string[],
): Promise<string | null> {
  const locationSelection: GroupSelection = { kind: 'skip' }
  const selection = unwrapPrompt(
    await prompts.select<GroupSelection>({
      message: 'Select a Turso group (choose Japan to match the Tokyo Worker)',
      initialValue: locationSelection,
      options: [
        ...groups.map((group) => ({
          value: { kind: 'group', value: group } satisfies GroupSelection,
          label: group,
        })),
        { value: { kind: 'manual' }, label: 'Enter group manually' },
        {
          value: locationSelection,
          label: 'Choose a location instead',
          hint: 'Tokyo is the default',
        },
      ],
    }),
  )
  if (selection.kind === 'group') return selection.value
  if (selection.kind === 'manual') {
    return askRequired('Enter Turso group name', '')
  }
  return null
}

async function selectGroupFromChoices(
  groups: string[],
  manualOption: number,
): Promise<string | null> {
  const answer = await ask(
    `Select a Turso group [1-${manualOption}] or type a group name directly (Enter to skip):`,
  )
  const selection = parseGroupSelection(answer, groups, manualOption)

  if (selection.kind === 'skip') {
    return null
  }
  if (selection.kind === 'group') {
    return selection.value
  }
  if (selection.kind === 'manual') {
    return askRequired('Enter Turso group name:', '')
  }

  log.info('Please choose one of the listed options or type a group name.')
  return selectGroupFromChoices(groups, manualOption)
}

function parseGroupSelection(
  answer: string | null,
  groups: string[],
  manualOption: number,
): GroupSelection {
  if (!answer) {
    return { kind: 'skip' }
  }

  const selectedIndex = Number(answer)
  if (!Number.isInteger(selectedIndex)) {
    return { kind: 'group', value: answer }
  }

  return parseGroupIndex(selectedIndex, groups, manualOption)
}

function parseGroupIndex(
  selectedIndex: number,
  groups: string[],
  manualOption: number,
): GroupSelection {
  const selectedGroup = groups[selectedIndex - 1]
  if (selectedGroup) {
    return { kind: 'group', value: selectedGroup }
  }
  if (selectedIndex === manualOption) {
    return { kind: 'manual' }
  }
  return { kind: 'invalid' }
}

async function askOptionalGroupName(): Promise<string | null> {
  const groupName = await ask(
    'Enter Turso group name (leave blank to choose a location; Tokyo is the default):',
  )

  return groupName || null
}

function getTursoGroups(): string[] {
  const output = runTursoCommand(
    ['group', 'list'],
    'Failed to list Turso groups.',
  )
  if (interactive) prompts.note(output, 'Turso groups and locations')
  else log.info(output)

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

async function ensureTursoLogin(): Promise<boolean> {
  if (isTursoAuthenticated()) {
    return true
  }

  log.info('You are not logged in to Turso.')

  if (!(await requestTursoLogin())) {
    return false
  }

  if (!isTursoAuthenticated()) {
    log.error('Turso login could not be verified.')
    return false
  }

  return true
}

async function requestTursoLogin(): Promise<boolean> {
  if (!(await confirm('Run `turso auth login` now?', true))) {
    return false
  }
  return runTursoLogin()
}

function isTursoAuthenticated(): boolean {
  const result = spawnSync('turso', ['auth', 'whoami'], {
    cwd: ROOT,
    encoding: 'utf-8',
  })
  const output = [result.stdout, result.stderr].join('\n').trim()

  return result.status === 0 && !isTursoAuthMessage(output)
}

function runTursoLogin(): boolean {
  const result = spawnSync('turso', ['auth', 'login'], {
    cwd: ROOT,
    stdio: 'inherit',
  })
  if (result.status === 0) {
    return true
  }

  log.error('Failed to log in to Turso.')
  return false
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

async function configureCloudflareDeployment(): Promise<CloudflareConfiguration | null> {
  if (!(await confirm('Configure Cloudflare deployment now?', false))) {
    return null
  }

  const cfCommand = prepareCfCommand()
  if (!cfCommand) {
    return null
  }

  return configureCloudflareWithCf(cfCommand)
}

function prepareCfCommand(): string | null {
  const credentialEnvironmentVariable =
    findCloudflareCredentialEnvironmentVariable(process.env)
  if (credentialEnvironmentVariable) {
    log.error(
      `Unset ${credentialEnvironmentVariable} before configuring a named Cloudflare profile.`,
    )
    return null
  }

  const cfCommand = resolveCfCommand()
  if (!cfCommand) {
    log.error(
      'cf was not found. Run `pnpm install`, then run `pnpm run setup` again.',
    )
    return null
  }

  return cfCommand
}

async function configureCloudflareWithCf(
  cfCommand: string,
): Promise<CloudflareConfiguration | null> {
  const configuration = await resolveCloudflareConfiguration(cfCommand)
  if (!configuration) {
    return null
  }

  persistCloudflareConfiguration(configuration)
  return configuration
}

async function resolveCloudflareConfiguration(
  cfCommand: string,
): Promise<CloudflareConfiguration | null> {
  const currentConfiguration = readStoredCloudflareConfiguration()
  const profile = await resolveCloudflareProfile(
    cfCommand,
    currentConfiguration?.profile,
  )
  if (!profile) {
    return null
  }

  return resolveCloudflareAccount(
    cfCommand,
    profile,
    currentConfiguration?.accountId,
  )
}

async function resolveCloudflareProfile(
  cfCommand: string,
  currentProfile?: string,
): Promise<string | null> {
  const profile = await askCloudflareProfile(currentProfile)
  return (await ensureCloudflareProfile(cfCommand, profile)) ? profile : null
}

async function resolveCloudflareAccount(
  cfCommand: string,
  profile: string,
  currentAccountId?: string,
): Promise<CloudflareConfiguration | null> {
  const accounts = await getCloudflareAccountsWithRecovery(cfCommand, profile)
  if (!accounts) {
    return null
  }

  const account = await selectCloudflareAccount(accounts, currentAccountId)
  return { profile, account }
}

function persistCloudflareConfiguration(
  configuration: CloudflareConfiguration,
): void {
  const { profile, account } = configuration
  const storedConfiguration = {
    profile,
    accountId: account.id,
  } satisfies StoredCloudflareConfiguration

  writeJson(CLOUDFLARE_CONFIG_PATH, storedConfiguration)
  updateCloudflareAccountId(account.id)
}

function resolveCfCommand(): string | null {
  return resolveCloudflareCommand(ROOT)
}

async function askCloudflareProfile(currentProfile?: string): Promise<string> {
  const profile = await askRequired(
    'Cloudflare cf profile name',
    currentProfile || '',
  )
  if (isNamedCloudflareProfile(profile)) {
    return profile
  }

  log.info(
    'Use a named profile containing only letters, numbers, hyphens, or underscores.',
  )
  return askCloudflareProfile(currentProfile)
}

async function ensureCloudflareProfile(
  cfCommand: string,
  profile: string,
): Promise<boolean> {
  const activation = activateCloudflareProfile(cfCommand, profile)
  if (activation.ok) {
    return true
  }

  log.info(
    `${activation.detail || `Cloudflare profile "${profile}" is not available.`}`,
  )
  if (
    !(await confirm(
      `Create or re-authenticate Cloudflare profile "${profile}" now?`,
      true,
    ))
  ) {
    return false
  }

  return createAndActivateCloudflareProfile(cfCommand, profile)
}

function createAndActivateCloudflareProfile(
  cfCommand: string,
  profile: string,
): boolean {
  const created = spawnSync('node', [cfCommand, 'auth', 'create', profile], {
    cwd: ROOT,
    env: suppressCloudflareCredentialEnvironmentVariables(process.env),
    stdio: 'inherit',
  })
  if (created.status !== 0) {
    log.error(
      `Failed to create or re-authenticate Cloudflare profile "${profile}".`,
    )
    return false
  }

  const retry = activateCloudflareProfile(cfCommand, profile)
  if (retry.ok) {
    return true
  }

  log.error(
    retry.detail || `Failed to activate Cloudflare profile "${profile}".`,
  )
  return false
}

function activateCloudflareProfile(
  cfCommand: string,
  profile: string,
): { ok: boolean; detail: string } {
  const result = spawnSync(
    'node',
    [cfCommand, 'auth', 'activate', profile, ROOT],
    {
      cwd: ROOT,
      encoding: 'utf-8',
      env: suppressCloudflareCredentialEnvironmentVariables(process.env),
    },
  )

  return {
    ok: result.status === 0,
    detail: [result.stdout, result.stderr].join('\n').trim(),
  }
}

async function getCloudflareAccountsWithRecovery(
  cfCommand: string,
  profile: string,
): Promise<CloudflareAccount[] | null> {
  const accounts = tryGetCloudflareAccounts(cfCommand, profile)
  if (accounts) {
    return accounts
  }

  if (
    !(await confirm(
      `Re-authenticate Cloudflare profile "${profile}" now?`,
      true,
    ))
  ) {
    return null
  }

  if (!createAndActivateCloudflareProfile(cfCommand, profile)) {
    return null
  }

  return tryGetCloudflareAccounts(cfCommand, profile)
}

function tryGetCloudflareAccounts(
  cfCommand: string,
  profile: string,
): CloudflareAccount[] | null {
  try {
    return getCloudflareAccounts(cfCommand, profile)
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Failed to read Cloudflare accounts.'
    log.info(`${message}`)
    return null
  }
}

function getCloudflareAccounts(
  cfCommand: string,
  profile: string,
): CloudflareAccount[] {
  const identity = readCloudflareIdentity(cfCommand, profile)
  if (!isAuthenticatedCloudflareIdentity(identity)) {
    throw new Error(
      'cf authentication is unavailable. cf uses a separate credential store from Wrangler.',
    )
  }
  const accounts = parseCloudflareAccounts(identity)
  if (accounts.length === 0) {
    throw new Error('cf returned an invalid account list.')
  }

  return accounts
}

async function selectCloudflareAccount(
  accounts: CloudflareAccount[],
  currentAccountId?: string,
): Promise<CloudflareAccount> {
  const currentIndex = accounts.findIndex(
    (account) => account.id === currentAccountId,
  )
  const defaultIndex = currentIndex >= 0 ? currentIndex + 1 : 1

  if (interactive) {
    return unwrapPrompt(
      await prompts.select({
        message: 'Select a Cloudflare account',
        initialValue: accounts[defaultIndex - 1],
        options: accounts.map((account) => ({
          value: account,
          label: account.name,
          hint: account.id,
        })),
      }),
    )
  }

  return selectCloudflareAccountFromInput(accounts, defaultIndex)
}

async function selectCloudflareAccountFromInput(
  accounts: CloudflareAccount[],
  defaultIndex: number,
): Promise<CloudflareAccount> {
  log.info('Available Cloudflare accounts:')
  accounts.forEach((account, index) => {
    log.info(`${index + 1}. ${account.name} (${account.id})`)
  })

  while (true) {
    const answer = await ask(
      `Select a Cloudflare account [1-${accounts.length}] (${defaultIndex}):`,
    )
    const selectedAccount = resolveCloudflareAccountSelection(
      accounts,
      answer,
      defaultIndex,
    )
    if (selectedAccount) {
      return selectedAccount
    }

    log.info('Choose one of the listed accounts.')
  }
}

function resolveCloudflareAccountSelection(
  accounts: CloudflareAccount[],
  answer: string | null,
  defaultIndex: number,
): CloudflareAccount | null {
  const indexedAccount = findCloudflareAccountByIndex(
    accounts,
    answer,
    defaultIndex,
  )
  if (indexedAccount) {
    return indexedAccount
  }

  return (
    accounts.find((account) => matchesCloudflareAccount(account, answer)) ??
    null
  )
}

function findCloudflareAccountByIndex(
  accounts: CloudflareAccount[],
  answer: string | null,
  defaultIndex: number,
): CloudflareAccount | null {
  const selectedIndex = Number(answer ?? defaultIndex)
  if (Number.isInteger(selectedIndex)) {
    return accounts[selectedIndex - 1] ?? null
  }

  return null
}

function matchesCloudflareAccount(
  account: CloudflareAccount,
  answer: string | null,
): boolean {
  return account.id === answer || account.name === answer
}

function readStoredCloudflareConfiguration(): StoredCloudflareConfiguration | null {
  if (!existsSync(CLOUDFLARE_CONFIG_PATH)) {
    return null
  }

  try {
    const parsed = parseCloudflareConfiguration(
      JSON.parse(readFileSync(CLOUDFLARE_CONFIG_PATH, 'utf-8')),
    )
    if (parsed) {
      return parsed
    }
  } catch {
    return reportUnreadableCloudflareConfiguration()
  }

  return reportUnreadableCloudflareConfiguration()
}

function reportUnreadableCloudflareConfiguration(): null {
  log.info('Existing .cloudflare.json could not be read and will be replaced.')
  return null
}

function updateCloudflareAccountId(accountId: string): void {
  const currentConfig = readFileSync(WORKER_CONFIG_PATH, 'utf-8')
  const nextConfig = currentConfig.replace(
    /^const accountId: string \| undefined = .*$/m,
    `const accountId: string | undefined = '${accountId}'`,
  )
  if (
    nextConfig === currentConfig &&
    !currentConfig.includes(
      `const accountId: string | undefined = '${accountId}'`,
    )
  ) {
    throw new Error('Could not set accountId in cloudflare.config.ts.')
  }
  writeFileSync(WORKER_CONFIG_PATH, nextConfig)
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

  const ctaConfig = readFileSync(CTA_CONFIG_PATH, 'utf-8').replace(
    /"projectName":\s*"[^"]+"/,
    `"projectName": "${nextAppName}"`,
  )
  writeFileSync(CTA_CONFIG_PATH, ctaConfig)

  const workerConfig = readFileSync(WORKER_CONFIG_PATH, 'utf-8').replace(
    /name:\s*'[^']+'/,
    `name: '${nextAppName}'`,
  )
  writeFileSync(WORKER_CONFIG_PATH, workerConfig)

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
  packageJson.scripts.setup = 'node scripts/setup.ts'
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

function unwrapPrompt<Value>(
  value: Value | typeof prompts.CANCEL_SYMBOL,
): Value {
  if (prompts.isCancel(value)) throw new SetupCancelled('Setup cancelled.')
  return value
}

async function ask(question: string, fallback = ''): Promise<string | null> {
  const defaultHint = fallback ? ` (${fallback}):` : ''
  const answer = interactive
    ? unwrapPrompt(
        await prompts.text({
          message: question,
          placeholder: fallback,
          defaultValue: fallback,
        }),
      )
    : await readPlainLine(`${question}${defaultHint}`)
  return normalizeAnswer(answer, fallback)
}

function normalizeAnswer(answer: string, fallback: string): string | null {
  return answer.trim() || fallback || null
}

async function readPlainLine(question: string): Promise<string> {
  if (!promptInput || !promptLines) {
    throw new SetupCancelled('Setup input is unavailable.')
  }
  process.stdout.write(`${question} `)
  promptInput.resume()
  const line = await promptLines.next()
  promptInput.pause()
  if (line.done) {
    throw new SetupCancelled('Input ended before setup completed.')
  }
  return line.value
}

async function askRequired(
  question: string,
  fallback: string,
  secret = false,
): Promise<string> {
  if (interactive) {
    return askRequiredInteractively(question, fallback, secret)
  }

  while (true) {
    const answer = await ask(question, fallback)
    if (answer) {
      return answer
    }
    log.info('This value is required.')
  }
}

async function askRequiredInteractively(
  question: string,
  fallback: string,
  secret: boolean,
): Promise<string> {
  const options = {
    message: question,
    validate: (value: string | undefined) =>
      value?.trim() || fallback ? undefined : 'This value is required.',
  }
  const answer = unwrapPrompt(
    await (secret
      ? prompts.password(options)
      : prompts.text({
          ...options,
          placeholder: fallback,
          defaultValue: fallback,
        })),
  )
  return answer.trim() || fallback
}

async function confirm(
  question: string,
  defaultValue: boolean,
): Promise<boolean> {
  if (interactive) {
    return unwrapPrompt(
      await prompts.confirm({ message: question, initialValue: defaultValue }),
    )
  }
  const hint = defaultValue ? 'Y/n' : 'y/N'
  return confirmFromInput(`${question} (${hint}):`, defaultValue)
}

async function confirmFromInput(
  question: string,
  defaultValue: boolean,
): Promise<boolean> {
  const answer = await ask(question)

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

  log.info('Please answer with y or n.')
  return confirmFromInput(question, defaultValue)
}

function isAuthenticatedCloudflareIdentity(value: unknown): boolean {
  return (
    isRecord(value) && value.authenticated === true && value.tokenValid === true
  )
}

function readCloudflareIdentity(cfCommand: string, profile: string): unknown {
  const result = spawnSync(
    'node',
    [cfCommand, 'auth', 'whoami', '--profile', profile],
    {
      cwd: ROOT,
      encoding: 'utf-8',
      env: suppressCloudflareCredentialEnvironmentVariables(process.env),
    },
  )
  const detail = [result.stdout, result.stderr].join('\n').trim()

  if (result.status !== 0) {
    throw new Error(detail || 'Failed to read Cloudflare accounts.')
  }

  return JSON.parse(result.stdout)
}
