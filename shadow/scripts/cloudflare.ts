import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import {
  findCloudflareCredentialEnvironmentVariable,
  parseCloudflareAccounts,
  parseCloudflareConfiguration,
  suppressCloudflareCredentialEnvironmentVariables,
  type CloudflareConfiguration,
} from './cloudflare-config'
import {
  createCloudflareResourcePlan,
  type CloudflareResourcePlan,
} from './cloudflare-resources'

const ROOT = resolve(import.meta.dirname, '..')
const CLOUDFLARE_CONFIG_PATH = join(ROOT, '.cloudflare.json')
const WRANGLER_CONFIG_PATH = join(ROOT, 'wrangler.jsonc')
const LOCAL_WRANGLER_PATH = join(
  ROOT,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'wrangler.cmd' : 'wrangler',
)
const AUTOMATIC_PROVISIONING_FLAGS = [
  '--experimental-provision',
  '--x-provision',
  '--experimental-auto-create',
  '--x-auto-create',
]
const DISABLED_AUTOMATIC_PROVISIONING_FLAGS = [
  '--no-experimental-provision',
  '--no-experimental-auto-create',
]
const ENVIRONMENT_VALUE_FLAGS = new Set(['--env', '-e'])

type ProjectCommandOptions = {
  environment?: string
  yes: boolean
}

type WranglerResult = {
  status: number
  detail: string
}

type EnvironmentOption = {
  environment: string
  lastIndex: number
}

const args = process.argv.slice(2).filter((arg, index) => {
  return !(index === 0 && arg === '--')
})

if (args.length === 0) {
  fail('Usage: bun run cloudflare -- <status|plan|apply|wrangler command>')
}

if (args.some((arg) => arg === '--profile' || arg.startsWith('--profile='))) {
  fail('The Cloudflare profile is pinned by .cloudflare.json.')
}

const automaticProvisioningFlag = AUTOMATIC_PROVISIONING_FLAGS.find((flag) =>
  args.some((arg) => arg === flag || arg.startsWith(`${flag}=`)),
)
if (automaticProvisioningFlag) {
  fail(
    `${automaticProvisioningFlag} bypasses the reviewed resource plan. Use cloudflare plan and cloudflare apply instead.`,
  )
}

const credentialEnvironmentVariable =
  findCloudflareCredentialEnvironmentVariable(process.env)
if (credentialEnvironmentVariable) {
  fail(
    `${credentialEnvironmentVariable} overrides named Cloudflare profiles. Unset it before using this command.`,
  )
}

const configuration = readCloudflareConfiguration()
const wranglerAccountId = readWranglerAccountId()

if (configuration.accountId !== wranglerAccountId) {
  fail(
    'Cloudflare account mismatch between .cloudflare.json and wrangler.jsonc. Run `bun run setup` again.',
  )
}

const [command, ...commandArgs] = args

if (command === 'status') {
  const options = parseProjectCommandOptions(commandArgs, false)
  process.exit(runStatus(configuration, options.environment))
}

if (command === 'plan') {
  const options = parseProjectCommandOptions(commandArgs, false)
  const plan = readCloudflareResourcePlan(options.environment)
  printPlan(configuration, plan)
  process.exit(plan.blockers.length === 0 ? 0 : 1)
}

if (command === 'apply') {
  const options = parseProjectCommandOptions(commandArgs, true)
  process.exit(runApply(configuration, options))
}

if (command === 'deploy') {
  assertResourcesReady(readWranglerEnvironment(commandArgs))
}

const result = runWrangler(args, configuration)
if (result.detail) {
  console.error(result.detail)
}
process.exit(result.status)

function runStatus(
  configuration: CloudflareConfiguration,
  environment?: string,
): number {
  const plan = readCloudflareResourcePlan(environment)
  console.log('Cloudflare status')
  printTarget(configuration, plan)

  const authenticationReady = printAuthenticationStatus(
    checkCloudflareAuthentication(configuration),
  )
  printResourceSummary(plan)
  return authenticationReady && isPlanReady(plan) ? 0 : 1
}

function runApply(
  configuration: CloudflareConfiguration,
  options: ProjectCommandOptions,
): number {
  const plan = readCloudflareResourcePlan(options.environment)
  printPlan(configuration, plan)

  const preflightStatus = checkApplyPreflight(plan, options.yes)
  if (preflightStatus !== null) return preflightStatus

  return executeResourcePlan(configuration, plan, options.environment)
}

function checkApplyPreflight(
  plan: CloudflareResourcePlan,
  confirmed: boolean,
): number | null {
  if (plan.blockers.length > 0) {
    console.error('Resolve every blocker before applying resource changes.')
    return 1
  }
  if (plan.actions.length === 0) {
    console.log('Cloudflare resources are already resolved.')
    return 0
  }
  if (confirmed) return null

  console.error(
    'No remote changes were made. Review the plan, then run `bun run cloudflare -- apply --yes`.',
  )
  return 1
}

function executeResourcePlan(
  configuration: CloudflareConfiguration,
  plan: CloudflareResourcePlan,
  environment?: string,
): number {
  const authentication = checkCloudflareAuthentication(configuration)
  if (authentication.status !== 0) {
    console.error(authentication.detail || 'Cloudflare authentication failed.')
    return 1
  }

  const creationStatus = createPlannedResources(configuration, plan)
  if (creationStatus !== 0) return creationStatus

  return verifyAppliedPlan(environment)
}

function createPlannedResources(
  configuration: CloudflareConfiguration,
  plan: CloudflareResourcePlan,
): number {
  for (const action of plan.actions) {
    console.log(
      `Creating ${resourceKindLabel(action.kind)} "${action.name}" for ${action.binding}...`,
    )
    const result = runWrangler(action.wranglerArgs, configuration)
    if (result.status !== 0) {
      return reportCreationFailure(result)
    }
  }
  return 0
}

function verifyAppliedPlan(environment?: string): number {
  const remainingPlan = readCloudflareResourcePlan(environment)
  if (!isPlanReady(remainingPlan)) {
    console.error(
      'Wrangler finished, but unresolved resource configuration remains. No resources were deleted; rerun plan before continuing.',
    )
    return 1
  }

  console.log(
    'Cloudflare resources were created and wrangler.jsonc was updated.',
  )
  return 0
}

function reportCreationFailure(result: WranglerResult): number {
  if (result.detail) console.error(result.detail)
  console.error(
    'Apply stopped. Completed creations were kept and were not rolled back or deleted; rerun plan before continuing.',
  )
  return result.status
}

function assertResourcesReady(environment?: string): void {
  const plan = readCloudflareResourcePlan(environment)
  if (isPlanReady(plan)) {
    return
  }

  printResourceSummary(plan)
  fail(
    'Deployment stopped because Cloudflare resources are unresolved. Run `bun run cloudflare -- plan`, then `bun run cloudflare -- apply --yes`.',
  )
}

function printPlan(
  configuration: CloudflareConfiguration,
  plan: CloudflareResourcePlan,
): void {
  console.log('Cloudflare resource plan')
  printTarget(configuration, plan)

  if (plan.actions.length === 0) {
    console.log('- Creates: none')
  } else {
    console.log('- Creates:')
    for (const action of plan.actions) {
      console.log(
        `  - ${resourceKindLabel(action.kind)} "${action.name}" for ${action.configPath} (${action.binding})`,
      )
      console.log(`    Permission: ${action.permission}`)
    }
  }

  printBlockers(plan)
  console.log('- Deletes: none')
  console.log('- Deploy permission when automated: Workers Scripts write')
  console.log('No remote changes were made.')
}

function printTarget(
  configuration: CloudflareConfiguration,
  plan: CloudflareResourcePlan,
): void {
  console.log(`- Profile: ${configuration.profile}`)
  console.log(`- Account: ${configuration.accountId}`)
  console.log(`- Worker: ${plan.workerName}`)
  console.log(`- Environment: ${plan.environment ?? 'top-level'}`)
}

function printResourceSummary(plan: CloudflareResourcePlan): void {
  console.log(`- Pending creates: ${plan.actions.length}`)
  printBlockers(plan)
}

function printBlockers(plan: CloudflareResourcePlan): void {
  if (plan.blockers.length === 0) {
    console.log('- Blockers: none')
    return
  }

  console.log('- Blockers:')
  for (const blocker of plan.blockers) {
    console.log(`  - ${blocker.configPath}: ${blocker.message}`)
  }
}

function checkCloudflareAuthentication(
  configuration: CloudflareConfiguration,
): WranglerResult {
  const result = spawnSync(resolveWranglerCommand(), ['whoami', '--json'], {
    cwd: ROOT,
    env: cloudflareEnvironment(configuration),
    encoding: 'utf-8',
  })

  if (result.error) {
    return { status: 1, detail: result.error.message }
  }
  if (result.status !== 0) {
    return authenticationCommandFailure(result.status, result.stderr)
  }

  return verifyAuthenticatedAccount(result.stdout, configuration.accountId)
}

function verifyAuthenticatedAccount(
  output: string,
  accountId: string,
): WranglerResult {
  try {
    const accounts = parseCloudflareAccounts(JSON.parse(output))
    if (accounts.some((account) => account.id === accountId)) {
      return { status: 0, detail: '' }
    }
  } catch {
    return {
      status: 1,
      detail: 'Wrangler returned an invalid authentication response.',
    }
  }

  return {
    status: 1,
    detail: `The active Cloudflare login cannot access account ${accountId}. Run \`bun run setup\` again.`,
  }
}

function authenticationCommandFailure(
  status: number | null,
  stderr: string,
): WranglerResult {
  return {
    status: status ?? 1,
    detail:
      stderr.trim() ||
      'Cloudflare login is unavailable. Re-authenticate the named profile with `bun run setup`.',
  }
}

function printAuthenticationStatus(authentication: WranglerResult): boolean {
  const ready = authentication.status === 0
  console.log(`- Authentication: ${ready ? 'ready' : 'unavailable'}`)
  if (authentication.detail) console.error(authentication.detail)
  return ready
}

function runWrangler(
  wranglerArgs: string[],
  configuration: CloudflareConfiguration,
): WranglerResult {
  const result = spawnSync(
    resolveWranglerCommand(),
    [
      ...wranglerArgs,
      ...DISABLED_AUTOMATIC_PROVISIONING_FLAGS,
      '--profile',
      configuration.profile,
    ],
    {
      cwd: ROOT,
      env: cloudflareEnvironment(configuration),
      stdio: 'inherit',
    },
  )

  if (result.error) {
    return { status: 1, detail: result.error.message }
  }
  return { status: result.status ?? 1, detail: '' }
}

function cloudflareEnvironment(
  configuration: CloudflareConfiguration,
): Record<string, string | undefined> {
  return {
    ...suppressCloudflareCredentialEnvironmentVariables(process.env),
    CLOUDFLARE_ACCOUNT_ID: configuration.accountId,
  }
}

function resolveWranglerCommand(): string {
  return existsSync(LOCAL_WRANGLER_PATH) ? LOCAL_WRANGLER_PATH : 'wrangler'
}

function readCloudflareResourcePlan(
  environment?: string,
): CloudflareResourcePlan {
  try {
    return createCloudflareResourcePlan(
      readFileSync(WRANGLER_CONFIG_PATH, 'utf-8'),
      environment,
    )
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : 'Invalid Wrangler configuration.'
    return fail(`Cannot plan Cloudflare resources: ${detail}`)
  }
}

function parseProjectCommandOptions(
  commandArgs: string[],
  allowYes: boolean,
): ProjectCommandOptions {
  const yes = commandArgs.some(isConfirmationOption)
  if (yes && !allowYes) fail('Unsupported project command option: --yes')

  const environmentArgs = commandArgs.filter(
    (arg) => !isConfirmationOption(arg),
  )
  return { environment: parseProjectEnvironment(environmentArgs), yes }
}

function readWranglerEnvironment(commandArgs: string[]): string | undefined {
  const environmentOptions = commandArgs
    .map((_, index) => readEnvironmentOption(commandArgs, index))
    .filter(isEnvironmentOption)
  return environmentOptions.at(-1)?.environment
}

function parseProjectEnvironment(commandArgs: string[]): string | undefined {
  let environment: string | undefined
  for (let index = 0; index < commandArgs.length; index += 1) {
    const option = readEnvironmentOption(commandArgs, index)
    if (!option)
      fail(`Unsupported project command option: ${commandArgs[index]}`)
    environment = option.environment
    index = option.lastIndex
  }
  return environment
}

function readEnvironmentOption(
  commandArgs: string[],
  index: number,
): EnvironmentOption | null {
  const arg = commandArgs[index]
  if (ENVIRONMENT_VALUE_FLAGS.has(String(arg))) {
    return readFollowingEnvironment(commandArgs, index)
  }
  if (!arg?.startsWith('--env=')) return null

  const environment = arg.slice('--env='.length)
  if (!environment) fail('--env requires an environment name.')
  return { environment, lastIndex: index }
}

function readFollowingEnvironment(
  commandArgs: string[],
  index: number,
): EnvironmentOption {
  const environment = commandArgs[index + 1]
  if (!environment) fail(`${commandArgs[index]} requires an environment name.`)
  return { environment, lastIndex: index + 1 }
}

function isEnvironmentOption(
  option: EnvironmentOption | null,
): option is EnvironmentOption {
  return option !== null
}

function isConfirmationOption(arg: string): boolean {
  return arg === '--yes' || arg === '-y'
}

function isPlanReady(plan: CloudflareResourcePlan): boolean {
  return plan.actions.length === 0 && plan.blockers.length === 0
}

function resourceKindLabel(
  kind: 'kv-namespace' | 'd1-database' | 'r2-bucket',
): string {
  if (kind === 'kv-namespace') {
    return 'KV namespace'
  }
  if (kind === 'd1-database') {
    return 'D1 database'
  }
  return 'R2 bucket'
}

function readCloudflareConfiguration(): CloudflareConfiguration {
  if (!existsSync(CLOUDFLARE_CONFIG_PATH)) {
    fail('Cloudflare is not configured. Run `bun run setup` first.')
  }

  try {
    const configuration = parseCloudflareConfiguration(
      JSON.parse(readFileSync(CLOUDFLARE_CONFIG_PATH, 'utf-8')),
    )
    if (configuration) {
      return configuration
    }
  } catch {
    return fail('Invalid .cloudflare.json. Run `bun run setup` again.')
  }

  return fail('Invalid .cloudflare.json. Run `bun run setup` again.')
}

function readWranglerAccountId(): string {
  if (!existsSync(WRANGLER_CONFIG_PATH)) {
    fail('wrangler.jsonc was not found.')
  }

  const wranglerConfig = readFileSync(WRANGLER_CONFIG_PATH, 'utf-8')
  const accountId = wranglerConfig.match(
    /^\s*"account_id"\s*:\s*"([^"]+)"/m,
  )?.[1]

  if (!accountId) {
    fail('wrangler.jsonc does not pin account_id. Run `bun run setup` again.')
  }

  return accountId
}

function fail(message: string): never {
  console.error(message)
  process.exit(1)
}
