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
    const configPath = `worker.env.${binding}`
    if (
      resource.type === 'kv' ||
      resource.type === 'd1' ||
      resource.type === 'r2'
    ) {
      const id = resource.type === 'r2' ? resource.name : resource.id
      if (!id) {
        const name =
          resource.type === 'd1' && resource.name
            ? resource.name
            : resourceName(worker.name, binding)
        if (name.length < 3 || name.length > 63) {
          plan.blockers.push({
            configPath,
            message: 'Resource names must be between 3 and 63 characters.',
          })
          continue
        }
        const cfArgs =
          resource.type === 'kv'
            ? ['kv', 'namespaces', 'create', '--title', name]
            : resource.type === 'd1'
              ? ['d1', 'create', '--name', name]
              : ['r2', 'buckets', 'create', '--name', name]
        if (resource.type === 'r2' && resource.jurisdiction) {
          cfArgs.push('--cf-r2-jurisdiction', resource.jurisdiction)
        }
        plan.actions.push({
          type: resource.type,
          binding,
          name,
          configPath,
          permission:
            resource.type === 'kv'
              ? 'Workers KV Storage write'
              : resource.type === 'd1'
                ? 'D1 write'
                : 'Workers R2 Storage write',
          cfArgs,
        })
      } else if (resource.type === 'r2') {
        const cfArgs = ['r2', 'buckets', 'get', id]
        if (resource.jurisdiction)
          cfArgs.push('--cf-r2-jurisdiction', resource.jurisdiction)
        plan.checks.push({ configPath, cfArgs })
      }
    } else if (resource.type === 'queue') {
      if (resource.name)
        plan.checks.push({
          configPath,
          cfArgs: ['queues', 'list'],
          queueName: resource.name,
        })
      else addBlocker(plan, configPath, 'name')
    } else if (resource.type === 'dispatch-namespace') {
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
    } else if (resource.type === 'flagship' && !resource.id) {
      addBlocker(plan, configPath, 'id')
    } else if (resource.type === 'ai-search-namespace') {
      plan.checks.push({
        configPath,
        cfArgs: ['ai-search', 'namespace', 'get', resource.namespace],
      })
    } else if (resource.type === 'agent-memory') {
      plan.checks.push({
        configPath,
        cfArgs: ['agent-memory', 'get-namespace', resource.namespace],
      })
    }
  }

  for (const trigger of worker.triggers ?? []) {
    if (trigger.type === 'queue') {
      plan.checks.push({
        configPath: 'worker.triggers',
        cfArgs: ['queues', 'list'],
        queueName: trigger.name,
      })
    }
  }
  return plan
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
