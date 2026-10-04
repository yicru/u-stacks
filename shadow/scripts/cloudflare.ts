import { spawnSync } from 'node:child_process'
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
  if (!args.length)
    throw new Error(
      'Usage: bun run cloudflare -- <status|plan|apply|cf command>',
    )
  if (args.some((arg) => arg === '--profile' || arg.startsWith('--profile='))) {
    throw new Error('The Cloudflare profile is pinned by .cloudflare.json.')
  }
  const credential = findCloudflareCredentialEnvironmentVariable(process.env)
  if (credential)
    throw new Error(
      `${credential} overrides named Cloudflare profiles. Unset it before using this command.`,
    )
  if (
    args.some((arg) =>
      /^--(?:x-|experimental-)(?:provision|auto-create)(?:=|$)/.test(arg),
    )
  ) {
    throw new Error(
      'Automatic provisioning bypasses the reviewed resource plan. Use cloudflare plan and cloudflare apply instead.',
    )
  }
  if (
    args.some(
      (arg) => arg === '--env' || arg === '-e' || arg.startsWith('--env='),
    )
  ) {
    throw new Error('cf uses --mode instead of Wrangler --env.')
  }
  const configuration = readConfiguration()
  const mode = readMode(args)
  const { result } = await loadAndParseConfig(
    join(ROOT, 'cloudflare.config.ts'),
    { mode, isPreview: false },
  )
  if (!result.success)
    throw new Error(`Invalid cloudflare.config.ts: ${result.error.message}`)
  if (result.data.accountId !== configuration.accountId) {
    throw new Error(
      'Cloudflare account mismatch between .cloudflare.json and cloudflare.config.ts. Run `bun run setup` again.',
    )
  }
  if (!result.data.worker)
    throw new Error('cloudflare.config.ts must define a Worker.')
  const plan = createCloudflareResourcePlan(result.data.worker, mode)
  const command = args[0]
  if (command === 'plan' || command === 'status' || command === 'apply') {
    assertProjectOptions(args.slice(1), command === 'apply')
    printPlan(configuration, plan)
    if (command === 'plan') return plan.blockers.length ? 1 : 0
    if (command === 'status') {
      assertAuthentication(configuration, mode)
      console.log('- Authentication: ready')
      console.log(`- Pending creates: ${plan.actions.length}`)
      return isReady(plan) ? 0 : 1
    }
    return await apply(configuration, plan)
  }
  if (command === 'deploy') {
    assertReady(plan)
    const prebuilt = readBooleanFlag(args, '--prebuilt')
    const dryRun = readBooleanFlag(args, '--dry-run')
    if (!prebuilt) {
      const build = spawnSync('bun', ['run', 'build', '--mode', mode], {
        cwd: ROOT,
        stdio: 'inherit',
      })
      if (build.status !== 0) throw new Error('Cloudflare build failed.')
    }
    const output = await readBuildOutput(ROOT)
    if (
      output.rootConfig.accountId !== configuration.accountId ||
      output.rootConfig.buildContext?.mode !== mode ||
      output.workers.default.config.name !== plan.workerName
    ) {
      throw new Error(
        'Build Output account, Worker, or mode differs from the pinned deployment target. Rebuild before deploying.',
      )
    }
    const builtPlans = Object.values(output.workers).map((worker) =>
      createCloudflareResourcePlan(worker.config, mode),
    )
    for (const builtPlan of builtPlans) assertReady(builtPlan)
    if (!dryRun) {
      assertAuthentication(configuration, mode)
      for (const builtPlan of builtPlans)
        assertExistingResources(configuration, builtPlan)
    }
    return runCf(
      [
        ...withoutBooleanFlags(args, ['--prebuilt', '--dry-run']),
        '--prebuilt',
        ...(dryRun ? ['--dry-run'] : []),
      ],
      configuration,
      mode,
      true,
    ).status
  }
  if (
    (command === 'workers' &&
      ((args[1] === 'versions' && args[2] === 'create') ||
        (args[1] === 'triggers' && args[2] === 'deploy'))) ||
    (command === 'previews' && args[1] === 'deploy')
  ) {
    throw new Error(
      'Use `bun run cloudflare -- deploy` to validate resource readiness before deploying a build.',
    )
  }
  return runCf(args, configuration, mode, true).status
}

async function apply(
  configuration: CloudflareConfiguration,
  plan: CloudflareResourcePlan,
): Promise<number> {
  if (!args.includes('--yes') && !args.includes('-y'))
    throw new Error(
      'Run apply --yes after reviewing the plan. No remote changes were made.',
    )
  if (plan.blockers.length)
    throw new Error(
      'Resolve blocked resources before applying. No remote changes were made.',
    )
  if (!plan.actions.length) return 0
  assertAuthentication(configuration, plan.mode)
  for (const action of plan.actions) {
    console.log(`Creating ${action.type}: ${action.name}`)
    const result = runCf(action.cfArgs, configuration, plan.mode)
    if (result.status !== 0)
      throw new Error(
        `${result.detail}\nCreation stopped. Earlier resource identifiers remain saved; no rollback or delete was attempted.`,
      )
    const value: unknown = JSON.parse(result.stdout)
    const field =
      action.type === 'kv' ? 'id' : action.type === 'd1' ? 'uuid' : 'name'
    const id =
      isRecord(value) && typeof value[field] === 'string' ? value[field] : null
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
  const { result } = await loadAndParseConfig(
    join(ROOT, 'cloudflare.config.ts'),
    { mode: plan.mode, isPreview: false },
  )
  if (!result.success || !result.data.worker)
    throw new Error('Unable to validate updated Cloudflare resources.')
  assertReady(createCloudflareResourcePlan(result.data.worker, plan.mode))
  console.log(
    'Cloudflare resources were created and cloudflare.resources.json was updated.',
  )
  return 0
}

function assertAuthentication(
  configuration: CloudflareConfiguration,
  mode: string,
): void {
  const result = runCf(['auth', 'whoami'], configuration, mode)
  if (result.status !== 0)
    throw new Error(`Authentication unavailable: ${result.detail}`)
  const value: unknown = JSON.parse(result.stdout)
  if (
    !isRecord(value) ||
    value.authenticated !== true ||
    value.tokenValid !== true
  ) {
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
    const value: unknown = JSON.parse(result.stdout)
    if (!check.queueName && (!isRecord(value) || !Object.keys(value).length)) {
      throw new Error(
        `cf returned no existing resource for ${check.configPath}. Deployment stopped.`,
      )
    }
    if (
      check.queueName &&
      (!Array.isArray(value) ||
        !value.some(
          (queue) => isRecord(queue) && queue.queue_name === check.queueName,
        ))
    ) {
      throw new Error(
        `Queue ${check.queueName} does not exist. Create or adopt it before deploying.`,
      )
    }
  }
}

function runCf(
  cfArgs: string[],
  configuration: CloudflareConfiguration,
  mode: string,
  inherit = false,
) {
  const command = resolveCloudflareCommand(ROOT)
  if (!command) throw new Error('cf was not found. Run `bun install`.')
  const hasMode = cfArgs.some(
    (arg) => arg === '--mode' || arg === '-m' || arg.startsWith('--mode='),
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
    stdout: result.stdout ?? '',
    detail: result.error?.message ?? result.stderr?.trim() ?? '',
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
      'Cloudflare deployment is not configured. Run `bun run setup`.',
    )
  }
  throw new Error('Invalid .cloudflare.json. Run `bun run setup`.')
}

function readMode(values: string[]): string {
  const selected: string[] = []
  for (let index = 0; index < values.length; index++) {
    const arg = values[index]
    if (arg === '--mode' || arg === '-m') {
      const next = values[++index]
      if (!next || next.startsWith('-'))
        throw new Error('Cloudflare mode requires a value.')
      selected.push(next)
    } else if (arg.startsWith('--mode='))
      selected.push(arg.slice('--mode='.length))
  }
  if (selected.length > 1 || selected.some((value) => !value))
    throw new Error('Specify one Cloudflare mode.')
  return selected[0] ?? 'production'
}

function readBooleanFlag(values: string[], flag: string): boolean {
  const selected: boolean[] = []
  for (let index = 0; index < values.length; index++) {
    const arg = values[index]
    if (arg === flag) {
      const next = values[index + 1]
      selected.push(next !== 'false')
      if (next === 'true' || next === 'false') index++
    } else if (arg === `--no-${flag.slice(2)}`) selected.push(false)
    else if (arg.startsWith(`${flag}=`)) {
      const value = arg.slice(flag.length + 1)
      if (value !== 'true' && value !== 'false')
        throw new Error(`Invalid ${flag} value.`)
      selected.push(value === 'true')
    }
  }
  if (selected.length > 1) throw new Error(`Specify ${flag} only once.`)
  return selected[0] ?? false
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
    if (arg === '--mode' || arg === '-m') index++
    else if (arg.startsWith('--mode=')) continue
    else if (!allowYes || (arg !== '--yes' && arg !== '-y'))
      throw new Error(`Unsupported project option: ${arg}`)
  }
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
      'Deployment stopped because Cloudflare resources are unresolved. Run `bun run cloudflare -- plan`, then `bun run cloudflare -- apply --yes`.',
    )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
