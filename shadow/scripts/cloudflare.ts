import { spawnSync, type SpawnSyncReturns } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { loadAndParseConfig } from '@cloudflare/config'
import { readBuildOutput } from '@cloudflare/build-output-utils'
import {
  findCloudflareCredentialEnvironmentVariable,
  parseCloudflareAccounts,
  parseCloudflareConfiguration,
  resolveCloudflareCommand,
  suppressCloudflareCredentialEnvironmentVariables,
  type CloudflareConfiguration,
} from './cloudflare-config.ts'
import {
  createCloudflareResourcePlan,
  type CloudflareResourcePlan,
} from './cloudflare-resources.ts'
import { storeCloudflareResourceId } from './cloudflare-resource-ids.ts'

const ROOT = resolve(import.meta.dirname, '..')
const args = process.argv
  .slice(2)
  .filter((arg, index) => !(index === 0 && arg === '--'))

try {
  process.exitCode = await main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}

async function main(): Promise<number> {
  assertCommandEnvironment()
  const configuration = readConfiguration()
  const mode = readMode(args)
  const worker = await readWorker(configuration, mode)
  const plan = createCloudflareResourcePlan(worker, mode)
  const command = args[0]
  if (['plan', 'status', 'apply'].includes(command)) {
    return runProjectCommand(command, configuration, plan)
  }
  if (command === 'deploy') return deploy(configuration, plan)
  assertGuardedDeploymentCommand()
  return runCf(args, configuration, mode, true).status
}

function assertCommandEnvironment(): void {
  if (!args.length)
    throw new Error('Usage: pnpm run cloudflare <status|plan|apply|cf command>')
  assertPinnedCredentials()
  const unsupportedOptions = [
    {
      matches: (arg: string) =>
        /^--(?:x-|experimental-)(?:provision|auto-create)(?:=|$)/.test(arg),
      message:
        'Automatic provisioning bypasses the reviewed resource plan. Use cloudflare plan and cloudflare apply instead.',
    },
    {
      matches: (arg: string) => arg === '-e' || arg.split('=')[0] === '--env',
      message: 'cf uses --mode instead of Wrangler --env.',
    },
  ]
  for (const option of unsupportedOptions) {
    if (args.some(option.matches)) throw new Error(option.message)
  }
}

function assertPinnedCredentials(): void {
  if (args.some((arg) => arg.split('=')[0] === '--profile')) {
    throw new Error('The Cloudflare profile is pinned by .cloudflare.json.')
  }
  const credential = findCloudflareCredentialEnvironmentVariable(process.env)
  if (credential)
    throw new Error(
      `${credential} overrides named Cloudflare profiles. Unset it before using this command.`,
    )
}

async function readWorker(
  configuration: CloudflareConfiguration,
  mode: string,
) {
  const { result } = await loadAndParseConfig(
    join(ROOT, 'cloudflare.config.ts'),
    { mode, isPreview: false },
  )
  if (!result.success)
    throw new Error(`Invalid cloudflare.config.ts: ${result.error.message}`)
  if (result.data.accountId !== configuration.accountId) {
    throw new Error(
      'Cloudflare account mismatch between .cloudflare.json and cloudflare.config.ts. Run `pnpm run setup` again.',
    )
  }
  if (!result.data.worker)
    throw new Error('cloudflare.config.ts must define a Worker.')
  return result.data.worker
}

function runProjectCommand(
  command: string,
  configuration: CloudflareConfiguration,
  plan: CloudflareResourcePlan,
): number | Promise<number> {
  assertProjectOptions(args.slice(1), command === 'apply')
  printPlan(configuration, plan)
  if (command === 'plan') return plan.blockers.length ? 1 : 0
  if (command !== 'status') return apply(configuration, plan)
  assertAuthentication(configuration, plan.mode)
  console.log('- Authentication: ready')
  console.log(`- Pending creates: ${plan.actions.length}`)
  return Number(!isReady(plan))
}

async function deploy(
  configuration: CloudflareConfiguration,
  plan: CloudflareResourcePlan,
): Promise<number> {
  assertReady(plan)
  const prebuilt = readBooleanFlag(args, '--prebuilt')
  const dryRun = readBooleanFlag(args, '--dry-run')
  if (!prebuilt) build(plan.mode)
  const builtPlans = await readBuiltPlans(configuration, plan)
  if (!dryRun) assertDeploymentResources(configuration, builtPlans)
  return runCf(
    [
      ...withoutBooleanFlags(args, ['--prebuilt', '--dry-run']),
      '--prebuilt',
      ...(dryRun ? ['--dry-run'] : []),
    ],
    configuration,
    plan.mode,
    true,
  ).status
}

function build(mode: string): void {
  const result = spawnSync('pnpm', ['run', 'build', '--mode', mode], {
    cwd: ROOT,
    stdio: 'inherit',
  })
  if (result.status !== 0) throw new Error('Cloudflare build failed.')
}

async function readBuiltPlans(
  configuration: CloudflareConfiguration,
  plan: CloudflareResourcePlan,
): Promise<CloudflareResourcePlan[]> {
  const output = await readBuildOutput(ROOT)
  const actual = [
    output.rootConfig.accountId,
    output.rootConfig.buildContext?.mode,
    output.workers.default.config.name,
  ]
  const expected = [configuration.accountId, plan.mode, plan.workerName]
  if (actual.some((value, index) => value !== expected[index])) {
    throw new Error(
      'Build Output account, Worker, or mode differs from the pinned deployment target. Rebuild before deploying.',
    )
  }
  const builtPlans = Object.values(output.workers).map((worker) =>
    createCloudflareResourcePlan(worker.config, plan.mode),
  )
  for (const builtPlan of builtPlans) assertReady(builtPlan)
  return builtPlans
}

function assertDeploymentResources(
  configuration: CloudflareConfiguration,
  plans: CloudflareResourcePlan[],
): void {
  assertAuthentication(configuration, plans[0].mode)
  for (const plan of plans) assertExistingResources(configuration, plan)
}

function assertGuardedDeploymentCommand(): void {
  const command = args.slice(0, 3).join(' ')
  const guardedCommands = ['workers versions create', 'workers triggers deploy']
  if (
    guardedCommands.includes(command) ||
    args.slice(0, 2).join(' ') === 'previews deploy'
  ) {
    throw new Error(
      'Use `pnpm run cloudflare deploy` to validate resource readiness before deploying a build.',
    )
  }
}

async function apply(
  configuration: CloudflareConfiguration,
  plan: CloudflareResourcePlan,
): Promise<number> {
  assertApplicable(plan)
  if (!plan.actions.length) return 0
  assertAuthentication(configuration, plan.mode)
  for (const action of plan.actions) createResource(configuration, plan, action)
  const worker = await readUpdatedWorker(plan.mode)
  assertReady(createCloudflareResourcePlan(worker, plan.mode))
  console.log(
    'Cloudflare resources were created and cloudflare.resources.json was updated.',
  )
  return 0
}

async function readUpdatedWorker(mode: string) {
  const { result } = await loadAndParseConfig(
    join(ROOT, 'cloudflare.config.ts'),
    { mode, isPreview: false },
  )
  if (!result.success || !result.data.worker)
    throw new Error('Unable to validate updated Cloudflare resources.')
  return result.data.worker
}

function assertApplicable(plan: CloudflareResourcePlan): void {
  if (!args.some((arg) => ['--yes', '-y'].includes(arg)))
    throw new Error(
      'Run apply --yes after reviewing the plan. No remote changes were made.',
    )
  if (plan.blockers.length)
    throw new Error(
      'Resolve blocked resources before applying. No remote changes were made.',
    )
}

function createResource(
  configuration: CloudflareConfiguration,
  plan: CloudflareResourcePlan,
  action: CloudflareResourcePlan['actions'][number],
): void {
  console.log(`Creating ${action.type}: ${action.name}`)
  const result = runCf(action.cfArgs, configuration, plan.mode)
  if (result.status !== 0)
    throw new Error(
      `${result.detail}\nCreation stopped. Earlier resource identifiers remain saved; no rollback or delete was attempted.`,
    )
  const value: unknown = JSON.parse(result.stdout)
  const field = { kv: 'id', d1: 'uuid', r2: 'name' }[action.type]
  const id = readResourceId(value, field)
  if (!id)
    throw new Error(
      `cf returned no ${field} for ${action.configPath}. Review the created resource before retrying.`,
    )
  storeCloudflareResourceId(
    configuration.accountId,
    plan.workerName,
    action.binding,
    action.type,
    id,
  )
}

function readResourceId(value: unknown, field: string): string | null {
  return isRecord(value) && typeof value[field] === 'string'
    ? value[field]
    : null
}

function assertAuthentication(
  configuration: CloudflareConfiguration,
  mode: string,
): void {
  const result = runCf(['auth', 'whoami'], configuration, mode)
  if (result.status !== 0)
    throw new Error(`Authentication unavailable: ${result.detail}`)
  const value: unknown = JSON.parse(result.stdout)
  if (!isAuthenticated(value)) {
    throw new Error(
      'Authentication unavailable. Run `cf auth create <profile>`; cf has a separate credential store from Wrangler.',
    )
  }
  if (
    !parseCloudflareAccounts(value).some(
      (account) => account.id === configuration.accountId,
    )
  ) {
    throw new Error(
      'The named Cloudflare profile cannot access the pinned account.',
    )
  }
}

function assertExistingResources(
  configuration: CloudflareConfiguration,
  plan: CloudflareResourcePlan,
): void {
  for (const check of plan.checks) {
    const result = runCf(check.cfArgs, configuration, plan.mode)
    if (result.status !== 0)
      throw new Error(
        `Resource verification failed for ${check.configPath}: ${result.detail}`,
      )
    assertResourceResponse(JSON.parse(result.stdout), check)
  }
}

function assertResourceResponse(
  value: unknown,
  check: CloudflareResourcePlan['checks'][number],
): void {
  if (check.queueName) {
    assertQueueExists(value, check.queueName)
    return
  }
  if (!isRecord(value) || !Object.keys(value).length)
    throw new Error(
      `cf returned no existing resource for ${check.configPath}. Deployment stopped.`,
    )
}

function assertQueueExists(value: unknown, name: string): void {
  if (
    !Array.isArray(value) ||
    !value.some((queue) => isRecord(queue) && queue.queue_name === name)
  )
    throw new Error(
      `Queue ${name} does not exist. Create or adopt it before deploying.`,
    )
}

function runCf(
  cfArgs: string[],
  configuration: CloudflareConfiguration,
  mode: string,
  inherit = false,
) {
  const command = findCfCommand()
  const hasMode = cfArgs.some(
    (arg) => arg === '-m' || arg.split('=')[0] === '--mode',
  )
  const result = spawnSync(
    'node',
    [
      command,
      ...cfArgs,
      '--profile',
      configuration.profile,
      ...(hasMode ? [] : ['--mode', mode]),
    ],
    {
      cwd: ROOT,
      env: {
        ...suppressCloudflareCredentialEnvironmentVariables(process.env),
        CLOUDFLARE_ACCOUNT_ID: configuration.accountId,
      },
      encoding: 'utf-8',
      stdio: inherit ? 'inherit' : 'pipe',
      maxBuffer: 10 * 1024 * 1024,
    },
  )
  return {
    status: result.status ?? 1,
    stdout: readCommandOutput(result.stdout),
    detail: readCommandDetail(result),
  }
}

function readConfiguration(): CloudflareConfiguration {
  try {
    const configuration = parseCloudflareConfiguration(
      JSON.parse(readFileSync(join(ROOT, '.cloudflare.json'), 'utf-8')),
    )
    if (configuration) return configuration
  } catch {
    throw new Error(
      'Cloudflare deployment is not configured. Run `pnpm run setup`.',
    )
  }
  throw new Error('Invalid .cloudflare.json. Run `pnpm run setup`.')
}

function readMode(values: string[]): string {
  const selected = selectModes(values)
  if (selected.length > 1 || selected.some((value) => !value))
    throw new Error('Specify one Cloudflare mode.')
  return selected[0] ?? 'production'
}

function selectModes(values: string[]): string[] {
  const selected: string[] = []
  for (let index = 0; index < values.length; index++) {
    const arg = values[index]
    if (['--mode', '-m'].includes(arg))
      selected.push(readModeValue(values[++index]))
    else if (arg.startsWith('--mode='))
      selected.push(arg.slice('--mode='.length))
  }
  return selected
}

function readModeValue(value: string | undefined): string {
  if (!value || value.startsWith('-'))
    throw new Error('Cloudflare mode requires a value.')
  return value
}

function readBooleanFlag(values: string[], flag: string): boolean {
  const selected = selectBooleanFlags(values, flag)
  if (selected.length > 1) throw new Error(`Specify ${flag} only once.`)
  return selected[0] ?? false
}

function selectBooleanFlags(values: string[], flag: string): boolean[] {
  const selected: boolean[] = []
  for (let index = 0; index < values.length; index++) {
    const option = parseBooleanFlag(values[index], values[index + 1], flag)
    if (option) {
      selected.push(option.value)
      index += option.consumed
    }
  }
  return selected
}

function parseBooleanFlag(
  arg: string,
  next: string,
  flag: string,
): { value: boolean; consumed: number } | null {
  if (arg === flag)
    return {
      value: next !== 'false',
      consumed: Number(['true', 'false'].includes(next)),
    }
  if (arg === `--no-${flag.slice(2)}`) return { value: false, consumed: 0 }
  if (arg.startsWith(`${flag}=`))
    return {
      value: readBooleanValue(arg.slice(flag.length + 1), flag),
      consumed: 0,
    }
  return null
}

function readBooleanValue(value: string, flag: string): boolean {
  if (!['true', 'false'].includes(value))
    throw new Error(`Invalid ${flag} value.`)
  return value === 'true'
}

function withoutBooleanFlags(values: string[], flags: string[]): string[] {
  return values.filter((value, index) => {
    if (
      flags.some(
        (flag) =>
          value === flag ||
          value === `--no-${flag.slice(2)}` ||
          value.startsWith(`${flag}=`),
      )
    )
      return false
    return !(
      (value === 'true' || value === 'false') &&
      flags.includes(values[index - 1])
    )
  })
}

function assertProjectOptions(values: string[], allowYes: boolean): void {
  for (let index = 0; index < values.length; index++) {
    const arg = values[index]
    if (['--mode', '-m'].includes(arg)) index++
    else if (!isAllowedProjectOption(arg, allowYes))
      throw new Error(`Unsupported project option: ${arg}`)
  }
}

function isAllowedProjectOption(arg: string, allowYes: boolean): boolean {
  if (arg.startsWith('--mode=')) return true
  return allowYes && ['--yes', '-y'].includes(arg)
}

function printPlan(
  configuration: CloudflareConfiguration,
  plan: CloudflareResourcePlan,
): void {
  console.log('Cloudflare resource plan')
  console.log(
    `- Profile: ${configuration.profile}\n- Account: ${configuration.accountId}\n- Worker: ${plan.workerName}\n- Mode: ${plan.mode}`,
  )
  console.log('- Deletes: none')
  for (const action of plan.actions) {
    console.log(
      `- Create ${action.type} "${action.name}" for ${action.configPath} (${action.binding})`,
    )
    console.log(`  Permission: ${action.permission}`)
  }
  for (const blocker of plan.blockers)
    console.log(`- Blocked ${blocker.configPath}: ${blocker.message}`)
  for (const check of plan.checks)
    console.log(
      `- Verify existing resource before deployment: ${check.configPath}`,
    )
}

function isReady(plan: CloudflareResourcePlan): boolean {
  return !plan.actions.length && !plan.blockers.length
}

function assertReady(plan: CloudflareResourcePlan): void {
  if (!isReady(plan))
    throw new Error(
      'Deployment stopped because Cloudflare resources are unresolved. Run `pnpm run cloudflare plan`, then `pnpm run cloudflare apply --yes`.',
    )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function findCfCommand(): string {
  const command = resolveCloudflareCommand(ROOT)
  if (!command) throw new Error('cf was not found. Run `pnpm install`.')
  return command
}

function readCommandOutput(value: string | null): string {
  return value ?? ''
}

function readCommandDetail(result: SpawnSyncReturns<string>): string {
  if (result.error) return result.error.message
  return readCommandOutput(result.stderr).trim()
}

function isAuthenticated(value: unknown): boolean {
  return (
    isRecord(value) && value.authenticated === true && value.tokenValid === true
  )
}
