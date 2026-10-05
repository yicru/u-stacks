import type { WorkerConfig } from 'cf/config'

export type CloudflareResourceAction = {
  type: 'kv' | 'd1' | 'r2'
  binding: string
  name: string
  configPath: string
  permission: string
  cfArgs: string[]
}

export type CloudflareResourceCheck = {
  configPath: string
  cfArgs: string[]
  queueName?: string
}

export type CloudflareResourcePlan = {
  workerName: string
  mode: string
  actions: CloudflareResourceAction[]
  blockers: Array<{ configPath: string; message: string }>
  checks: CloudflareResourceCheck[]
}

type Worker = Pick<WorkerConfig, 'name' | 'env' | 'triggers'>
type Binding = NonNullable<Worker['env']>[string]
type ManagedBinding = Extract<Binding, { type: 'kv' | 'd1' | 'r2' }>
type NamespaceBinding = Extract<
  Binding,
  { type: 'ai-search-namespace' | 'agent-memory' }
>

const managedResources = {
  kv: {
    createCommand: ['kv', 'namespaces', 'create', '--title'],
    permission: 'Workers KV Storage write',
  },
  d1: { createCommand: ['d1', 'create', '--name'], permission: 'D1 write' },
  r2: {
    createCommand: ['r2', 'buckets', 'create', '--name'],
    permission: 'Workers R2 Storage write',
  },
}

const namespaceCommands = {
  'ai-search-namespace': ['ai-search', 'namespace', 'get'],
  'agent-memory': ['agent-memory', 'get-namespace'],
}

export function createCloudflareResourcePlan(
  worker: Worker,
  mode: string,
): CloudflareResourcePlan {
  const plan: CloudflareResourcePlan = {
    workerName: worker.name,
    mode,
    actions: [],
    blockers: [],
    checks: [],
  }
  for (const [binding, resource] of Object.entries(worker.env ?? {})) {
    planBinding(plan, binding, resource)
  }
  planTriggers(plan, worker.triggers)
  return plan
}

function planBinding(
  plan: CloudflareResourcePlan,
  binding: string,
  resource: Binding,
): void {
  const configPath = `worker.env.${binding}`
  if (isManagedBinding(resource))
    planManagedBinding(plan, binding, configPath, resource)
  else if (isNamedBinding(resource))
    planNamedBinding(plan, configPath, resource)
  else planNamespaceBinding(plan, configPath, resource)
}

function isManagedBinding(resource: Binding): resource is ManagedBinding {
  return (
    resource.type === 'kv' || resource.type === 'd1' || resource.type === 'r2'
  )
}

function isNamedBinding(
  resource: Binding,
): resource is Extract<Binding, { type: 'queue' | 'dispatch-namespace' }> {
  return resource.type === 'queue' || resource.type === 'dispatch-namespace'
}

function planManagedBinding(
  plan: CloudflareResourcePlan,
  binding: string,
  configPath: string,
  resource: ManagedBinding,
): void {
  const id = resource.type === 'r2' ? resource.name : resource.id
  if (!id) planResourceCreate(plan, binding, configPath, resource)
  else if (resource.type === 'r2')
    plan.checks.push({
      configPath,
      cfArgs: withJurisdiction(['r2', 'buckets', 'get', id], resource),
    })
}

function planResourceCreate(
  plan: CloudflareResourcePlan,
  binding: string,
  configPath: string,
  resource: ManagedBinding,
): void {
  const name = createResourceName(plan.workerName, binding, resource)
  if (name.length < 3 || name.length > 63) {
    plan.blockers.push({
      configPath,
      message: 'Resource names must be between 3 and 63 characters.',
    })
    return
  }
  const definition = managedResources[resource.type]
  plan.actions.push({
    type: resource.type,
    binding,
    name,
    configPath,
    permission: definition.permission,
    cfArgs: withJurisdiction([...definition.createCommand, name], resource),
  })
}

function createResourceName(
  workerName: string,
  binding: string,
  resource: ManagedBinding,
): string {
  if (resource.type === 'd1' && resource.name) return resource.name
  return resourceName(workerName, binding)
}

function withJurisdiction(args: string[], resource: ManagedBinding): string[] {
  if (resource.type === 'r2' && resource.jurisdiction)
    args.push('--cf-r2-jurisdiction', resource.jurisdiction)
  return args
}

function planNamedBinding(
  plan: CloudflareResourcePlan,
  configPath: string,
  resource: Extract<Binding, { type: 'queue' | 'dispatch-namespace' }>,
): void {
  if (resource.type === 'queue') {
    planQueueBinding(plan, configPath, resource.name)
    return
  }
  if (resource.namespace)
    plan.checks.push({
      configPath,
      cfArgs: [
        'workers-for-platforms',
        'dispatch-namespaces',
        'get',
        resource.namespace,
      ],
    })
  else addBlocker(plan, configPath, 'namespace')
}

function planQueueBinding(
  plan: CloudflareResourcePlan,
  configPath: string,
  name: string | undefined,
): void {
  if (name) addQueueCheck(plan, configPath, name)
  else addBlocker(plan, configPath, 'name')
}

function addQueueCheck(
  plan: CloudflareResourcePlan,
  configPath: string,
  name: string,
): void {
  plan.checks.push({ configPath, cfArgs: ['queues', 'list'], queueName: name })
}

function planNamespaceBinding(
  plan: CloudflareResourcePlan,
  configPath: string,
  resource: Binding,
): void {
  if (resource.type === 'flagship') {
    planFlagshipBinding(plan, configPath, resource.id)
    return
  }
  if (isNamespaceBinding(resource))
    plan.checks.push({
      configPath,
      cfArgs: [...namespaceCommands[resource.type], resource.namespace],
    })
}

function planFlagshipBinding(
  plan: CloudflareResourcePlan,
  configPath: string,
  id: string | undefined,
): void {
  if (!id) addBlocker(plan, configPath, 'id')
}

function isNamespaceBinding(resource: Binding): resource is NamespaceBinding {
  return (
    resource.type === 'ai-search-namespace' || resource.type === 'agent-memory'
  )
}

function addBlocker(
  plan: CloudflareResourcePlan,
  configPath: string,
  field: string,
): void {
  plan.blockers.push({
    configPath,
    message: `Missing ${field}. Create or adopt this resource explicitly and store its identifier in cloudflare.config.ts.`,
  })
}

function resourceName(worker: string, binding: string): string {
  return `${worker}-${binding}`
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function planTriggers(
  plan: CloudflareResourcePlan,
  triggers: Worker['triggers'],
): void {
  for (const trigger of triggers ?? []) {
    if (trigger.type === 'queue')
      addQueueCheck(plan, 'worker.triggers', trigger.name)
  }
}
