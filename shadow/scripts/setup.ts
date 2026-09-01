import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { basename, join, relative, resolve } from 'node:path'
import {
  findCloudflareCredentialEnvironmentVariable,
  isNamedCloudflareProfile,
  parseCloudflareAccounts,
  parseCloudflareConfiguration,
  suppressCloudflareCredentialEnvironmentVariables,
  type CloudflareAccount,
  type CloudflareConfiguration as StoredCloudflareConfiguration,
} from './cloudflare-config'

const ROOT = resolve(import.meta.dirname, '..')
const PACKAGE_JSON_PATH = join(ROOT, 'package.json')
const WRANGLER_CONFIG_PATH = join(ROOT, 'wrangler.jsonc')
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
const T3_WORKTREE_SETUP_SCRIPT_NAME = 'Setup Shadow Worktree'
const LEGACY_T3_WORKTREE_SETUP_SCRIPT_NAME = 'Apply .worktreeinclude'
const LOCAL_WRANGLER_PATH = join(
  ROOT,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'wrangler.cmd' : 'wrangler',
)

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
configureLocalTurso()
const repositoryRoot = findRepositoryRoot()
configureWorktreeIncludes(repositoryRoot)
configureEffectSourceIgnore(repositoryRoot)
configureT3Project(repositoryRoot)

const productionTursoConfigured = configureProductionTurso(appName)
const cloudflareConfiguration = configureCloudflareDeployment()

console.log(`✨ Project configured as "${appName}"`)
console.log('✨ Local Turso dev server variables have been set.')
console.log('✨ Worktree local files have been registered.')
console.log('✨ T3 Code worktree setup has been registered.')
if (productionTursoConfigured) {
  console.log('✨ Production Turso environment variables have been set.')
} else {
  console.log(
    'ℹ️ Production Turso setup was skipped. Configure .dev.vars.production before deploying.',
  )
}
if (cloudflareConfiguration) {
  const { profile, account } = cloudflareConfiguration
  console.log(
    `✨ Cloudflare profile "${profile}" is pinned to ${account.name} (${account.id}).`,
  )
  console.log(
    'ℹ️ Cloudflare resources and API tokens were not created. Add bindings during development, then run `bun run cloudflare -- plan`.',
  )
} else {
  console.log(
    'ℹ️ Cloudflare setup was skipped; any existing deployment configuration was left unchanged.',
  )
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

  if (missingPatterns.length === 0) {
    return
  }

  const prefix =
    currentContent.length === 0 || currentContent.endsWith('\n')
      ? currentContent
      : `${currentContent}\n`
  writeFileSync(worktreeIncludePath, `${prefix}${missingPatterns.join('\n')}\n`)
}

function configureT3Project(repositoryRoot: string): void {
  const t3ProjectPath = join(repositoryRoot, 't3.json')
  const configuration = readT3Project(t3ProjectPath)
  const scripts = readT3Scripts(configuration)
  const worktreeSetupScript = createT3WorktreeSetupScript(repositoryRoot)
  const scriptIndex = scripts.findIndex(
    (script) =>
      script.name === worktreeSetupScript.name ||
      script.name === LEGACY_T3_WORKTREE_SETUP_SCRIPT_NAME ||
      script.command === worktreeSetupScript.command,
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

  if (hasActiveDirectoryPattern(currentContent, EFFECT_SOURCE_IGNORE_PATTERN)) {
    return
  }

  const prefix =
    currentContent.length === 0 || currentContent.endsWith('\n')
      ? currentContent
      : `${currentContent}\n`
  writeFileSync(gitIgnorePath, `${prefix}${EFFECT_SOURCE_IGNORE_PATTERN}\n`)
}

function createT3WorktreeSetupScript(
  repositoryRoot: string,
): Record<string, unknown> {
  const scriptPath = relative(
    repositoryRoot,
    WORKTREE_SETUP_SCRIPT_PATH,
  ).replaceAll('\\', '/')

  return {
    name: T3_WORKTREE_SETUP_SCRIPT_NAME,
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
  const equivalentPatterns = new Set([
    pattern,
    withoutLeadingSlash,
    withoutTrailingSlash,
    withoutLeadingSlash.replace(/\/$/, ''),
  ])
  let active = false

  for (const line of content.split(/\r?\n/)) {
    const candidate = line.trim()
    if (equivalentPatterns.has(candidate)) {
      active = true
    } else if (
      candidate.startsWith('!') &&
      equivalentPatterns.has(candidate.slice(1))
    ) {
      active = false
    }
  }

  return active
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
  const equivalentPatterns = new Set([pattern, pattern.slice(1)])
  let active = false

  for (const line of content.split(/\r?\n/)) {
    const candidate = line.trim()
    if (equivalentPatterns.has(candidate)) {
      active = true
    } else if (
      candidate.startsWith('!') &&
      equivalentPatterns.has(candidate.slice(1))
    ) {
      active = false
    }
  }

  return active
}

function configureProductionTurso(projectName: string): boolean {
  if (!confirm('Configure production Turso now? (y/N):', false)) {
    return false
  }

  if (!canConfigureTursoAutomatically()) {
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

  return configureTursoWithCli(databaseName, shouldCreateDatabase)
}

function canConfigureTursoAutomatically(): boolean {
  if (hasCommand('turso')) {
    return ensureTursoLogin()
  }

  console.log('ℹ️ Turso CLI was not found. Falling back to manual env input.')
  return false
}

function configureTursoWithCli(
  databaseName: string,
  shouldCreateDatabase: boolean,
): boolean {
  try {
    createTursoDatabase(databaseName, shouldCreateDatabase)
    writeTursoCredentials(getTursoCredentials(databaseName))

    return true
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Turso setup failed.'
    console.error(message)
    return configureTursoManually()
  }
}

function createTursoDatabase(
  databaseName: string,
  shouldCreateDatabase: boolean,
): void {
  if (!shouldCreateDatabase) {
    return
  }

  const groupName = selectTursoGroup()
  const groupArgs = groupName ? ['--group', groupName] : []
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
  writeTursoEnv(DEV_VARS_PRODUCTION_PATH, databaseUrl, authToken)
}

function configureTursoManually(): boolean {
  if (!confirm('Enter Turso URL and token manually? (Y/n):', true)) {
    return false
  }

  const databaseUrl = askRequired('TURSO_DATABASE_URL:', '')
  const authToken = askRequired('TURSO_AUTH_TOKEN:', '')

  writeTursoEnv(DEV_VARS_PRODUCTION_PATH, databaseUrl, authToken)

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

  console.log('Please choose one of the listed options or type a group name.')
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
  if (isTursoAuthenticated()) {
    return true
  }

  console.log('ℹ️ You are not logged in to Turso.')

  if (!requestTursoLogin()) {
    return false
  }

  if (!isTursoAuthenticated()) {
    console.error('Turso login could not be verified.')
    return false
  }

  return true
}

function requestTursoLogin(): boolean {
  if (!confirm('Run `turso auth login` now? (Y/n):', true)) {
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

  console.error('Failed to log in to Turso.')
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

function configureCloudflareDeployment(): CloudflareConfiguration | null {
  if (!confirm('Configure Cloudflare deployment now? (y/N):', false)) {
    return null
  }

  const wranglerCommand = prepareWranglerCommand()
  if (!wranglerCommand) {
    return null
  }

  return configureCloudflareWithWrangler(wranglerCommand)
}

function prepareWranglerCommand(): string | null {
  const credentialEnvironmentVariable =
    findCloudflareCredentialEnvironmentVariable(process.env)
  if (credentialEnvironmentVariable) {
    console.error(
      `Unset ${credentialEnvironmentVariable} before configuring a named Cloudflare profile.`,
    )
    return null
  }

  const wranglerCommand = resolveWranglerCommand()
  if (!wranglerCommand) {
    console.error(
      'Wrangler was not found. Run `bun install`, then run `bun run setup` again.',
    )
    return null
  }

  return wranglerCommand
}

function configureCloudflareWithWrangler(
  wranglerCommand: string,
): CloudflareConfiguration | null {
  const configuration = resolveCloudflareConfiguration(wranglerCommand)
  if (!configuration) {
    return null
  }

  persistCloudflareConfiguration(configuration)
  return configuration
}

function resolveCloudflareConfiguration(
  wranglerCommand: string,
): CloudflareConfiguration | null {
  const currentConfiguration = readStoredCloudflareConfiguration()
  const profile = resolveCloudflareProfile(
    wranglerCommand,
    currentConfiguration?.profile,
  )
  if (!profile) {
    return null
  }

  return resolveCloudflareAccount(
    wranglerCommand,
    profile,
    currentConfiguration?.accountId,
  )
}

function resolveCloudflareProfile(
  wranglerCommand: string,
  currentProfile?: string,
): string | null {
  const profile = askCloudflareProfile(currentProfile)
  return ensureCloudflareProfile(wranglerCommand, profile) ? profile : null
}

function resolveCloudflareAccount(
  wranglerCommand: string,
  profile: string,
  currentAccountId?: string,
): CloudflareConfiguration | null {
  const accounts = getCloudflareAccountsWithRecovery(wranglerCommand, profile)
  if (!accounts) {
    return null
  }

  const account = selectCloudflareAccount(accounts, currentAccountId)
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
  updateWranglerAccountId(account.id)
}

function resolveWranglerCommand(): string | null {
  if (existsSync(LOCAL_WRANGLER_PATH)) {
    return LOCAL_WRANGLER_PATH
  }

  return hasCommand('wrangler') ? 'wrangler' : null
}

function askCloudflareProfile(currentProfile?: string): string {
  const profile = askRequired(
    cloudflareProfileQuestion(currentProfile),
    currentProfile || '',
  )
  if (isNamedCloudflareProfile(profile)) {
    return profile
  }

  console.log(
    'Use a named profile containing only letters, numbers, hyphens, or underscores.',
  )
  return askCloudflareProfile(currentProfile)
}

function cloudflareProfileQuestion(currentProfile?: string): string {
  const suffix = currentProfile ? ` (${currentProfile})` : ''
  return `Cloudflare Wrangler profile name${suffix}:`
}

function ensureCloudflareProfile(
  wranglerCommand: string,
  profile: string,
): boolean {
  const activation = activateCloudflareProfile(wranglerCommand, profile)
  if (activation.ok) {
    return true
  }

  console.log(
    `ℹ️ ${activation.detail || `Cloudflare profile "${profile}" is not available.`}`,
  )
  if (
    !confirm(
      `Create or re-authenticate Cloudflare profile "${profile}" now? (Y/n):`,
      true,
    )
  ) {
    return false
  }

  return createAndActivateCloudflareProfile(wranglerCommand, profile)
}

function createAndActivateCloudflareProfile(
  wranglerCommand: string,
  profile: string,
): boolean {
  const created = spawnSync(wranglerCommand, ['auth', 'create', profile], {
    cwd: ROOT,
    env: suppressCloudflareCredentialEnvironmentVariables(process.env),
    stdio: 'inherit',
  })
  if (created.status !== 0) {
    console.error(
      `Failed to create or re-authenticate Cloudflare profile "${profile}".`,
    )
    return false
  }

  const retry = activateCloudflareProfile(wranglerCommand, profile)
  if (retry.ok) {
    return true
  }

  console.error(
    retry.detail || `Failed to activate Cloudflare profile "${profile}".`,
  )
  return false
}

function activateCloudflareProfile(
  wranglerCommand: string,
  profile: string,
): { ok: boolean; detail: string } {
  const result = spawnSync(
    wranglerCommand,
    ['auth', 'activate', profile, ROOT],
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

function getCloudflareAccountsWithRecovery(
  wranglerCommand: string,
  profile: string,
): CloudflareAccount[] | null {
  const accounts = tryGetCloudflareAccounts(wranglerCommand)
  if (accounts) {
    return accounts
  }

  if (
    !confirm(
      `Re-authenticate Cloudflare profile "${profile}" now? (Y/n):`,
      true,
    )
  ) {
    return null
  }

  if (!createAndActivateCloudflareProfile(wranglerCommand, profile)) {
    return null
  }

  return tryGetCloudflareAccounts(wranglerCommand)
}

function tryGetCloudflareAccounts(
  wranglerCommand: string,
): CloudflareAccount[] | null {
  try {
    return getCloudflareAccounts(wranglerCommand)
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Failed to read Cloudflare accounts.'
    console.log(`ℹ️ ${message}`)
    return null
  }
}

function getCloudflareAccounts(wranglerCommand: string): CloudflareAccount[] {
  const result = spawnSync(wranglerCommand, ['whoami', '--json'], {
    cwd: ROOT,
    encoding: 'utf-8',
    env: suppressCloudflareCredentialEnvironmentVariables(process.env),
  })
  const detail = [result.stdout, result.stderr].join('\n').trim()

  if (result.status !== 0) {
    throw new Error(detail || 'Failed to read Cloudflare accounts.')
  }

  const accounts = parseCloudflareAccounts(JSON.parse(result.stdout))
  if (accounts.length === 0) {
    throw new Error('Wrangler returned an invalid account list.')
  }

  return accounts
}

function selectCloudflareAccount(
  accounts: CloudflareAccount[],
  currentAccountId?: string,
): CloudflareAccount {
  console.log('Available Cloudflare accounts:')
  accounts.forEach((account, index) => {
    console.log(`${index + 1}. ${account.name} (${account.id})`)
  })

  const currentIndex = accounts.findIndex(
    (account) => account.id === currentAccountId,
  )
  const defaultIndex = currentIndex >= 0 ? currentIndex + 1 : 1

  while (true) {
    const answer = ask(
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

    console.log('Choose one of the listed accounts.')
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
  console.log(
    'ℹ️ Existing .cloudflare.json could not be read and will be replaced.',
  )
  return null
}

function updateWranglerAccountId(accountId: string): void {
  const currentConfig = readFileSync(WRANGLER_CONFIG_PATH, 'utf-8')
  const accountPattern = /^(\s*"account_id"\s*:\s*)"[^"]*"/m

  if (accountPattern.test(currentConfig)) {
    writeFileSync(
      WRANGLER_CONFIG_PATH,
      currentConfig.replace(accountPattern, `$1"${accountId}"`),
    )
    return
  }

  const nextConfig = currentConfig.replace(
    /^(\s*)("name"\s*:\s*"[^"]+")\s*,?\s*$/m,
    `$1$2,\n$1"account_id": "${accountId}",`,
  )
  if (nextConfig === currentConfig) {
    throw new Error('Could not add account_id to wrangler.jsonc.')
  }

  writeFileSync(WRANGLER_CONFIG_PATH, nextConfig)
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
