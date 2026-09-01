export type CloudflareResourceKind =
  | 'kv-namespace'
  | 'd1-database'
  | 'r2-bucket'

export type CloudflareResourceAction = {
  kind: CloudflareResourceKind
  binding: string
  name: string
  configPath: string
  permission: string
  wranglerArgs: string[]
}

export type CloudflareResourceBlocker = {
  configPath: string
  message: string
}

export type CloudflareResourcePlan = {
  workerName: string
  environment?: string
  actions: CloudflareResourceAction[]
  blockers: CloudflareResourceBlocker[]
}

type JsoncRuntime = typeof globalThis & {
  Bun?: {
    JSONC?: {
      parse: (source: string) => unknown
    }
  }
}

export function createCloudflareResourcePlan(
  source: string,
  environment?: string,
): CloudflareResourcePlan {
  const root = parseWranglerConfiguration(source)
  const selectedEnvironment = selectEnvironment(root, environment)
  const workerName = readWorkerName(root, selectedEnvironment)

  const plan: CloudflareResourcePlan = {
    workerName,
    environment,
    actions: [],
    blockers: [],
  }

  if (isMissingEnvironment(environment, selectedEnvironment)) {
    plan.blockers.push({
      configPath: `env.${environment}`,
      message: `Wrangler environment "${environment}" is not defined.`,
    })
    return plan
  }

  planKvNamespaces(plan, selectedEnvironment, workerName, environment)
  planD1Databases(plan, selectedEnvironment, workerName, environment)
  planR2Buckets(plan, selectedEnvironment, workerName, environment)
  planUnsupportedDrafts(plan, selectedEnvironment)

  return plan
}

function planKvNamespaces(
  plan: CloudflareResourcePlan,
  configuration: Record<string, unknown> | null,
  workerName: string,
  environment?: string,
): void {
  const resources = readArray(configuration, 'kv_namespaces')
  resources.forEach((resource, index) => {
    const configPath = `kv_namespaces[${index}]`
    const binding = readBinding(plan, resource, configPath)
    if (!binding) return
    if (readNonEmptyString(resource, 'id')) return

    const name = createResourceName(plan, workerName, binding, configPath)
    if (!name) {
      return
    }

    plan.actions.push({
      kind: 'kv-namespace',
      binding,
      name,
      configPath,
      permission: 'Workers KV Storage write',
      wranglerArgs: withEnvironment(
        withRemoteBinding(
          [
            'kv',
            'namespace',
            'create',
            name,
            '--binding',
            binding,
            '--update-config',
          ],
          resource,
        ),
        environment,
      ),
    })
  })
}

function planD1Databases(
  plan: CloudflareResourcePlan,
  configuration: Record<string, unknown> | null,
  workerName: string,
  environment?: string,
): void {
  const resources = readArray(configuration, 'd1_databases')
  resources.forEach((resource, index) => {
    const configPath = `d1_databases[${index}]`
    const binding = readBinding(plan, resource, configPath)
    if (!binding) return
    if (readNonEmptyString(resource, 'database_id')) return

    const name = readD1DatabaseName(
      plan,
      resource,
      workerName,
      binding,
      configPath,
    )
    if (!name) {
      return
    }

    plan.actions.push({
      kind: 'd1-database',
      binding,
      name,
      configPath,
      permission: 'D1 write',
      wranglerArgs: withEnvironment(
        withRemoteBinding(
          ['d1', 'create', name, '--binding', binding, '--update-config'],
          resource,
        ),
        environment,
      ),
    })
  })
}

function planR2Buckets(
  plan: CloudflareResourcePlan,
  configuration: Record<string, unknown> | null,
  workerName: string,
  environment?: string,
): void {
  const resources = readArray(configuration, 'r2_buckets')
  resources.forEach((resource, index) => {
    const configPath = `r2_buckets[${index}]`
    const binding = readBinding(plan, resource, configPath)
    if (!binding) return
    if (readNonEmptyString(resource, 'bucket_name')) return

    const name = createResourceName(plan, workerName, binding, configPath)
    if (!name) {
      return
    }

    const creationArgs = withR2Jurisdiction(
      ['r2', 'bucket', 'create', name, '--binding', binding, '--update-config'],
      resource,
    )

    plan.actions.push({
      kind: 'r2-bucket',
      binding,
      name,
      configPath,
      permission: 'Workers R2 Storage write',
      wranglerArgs: withEnvironment(
        withRemoteBinding(creationArgs, resource),
        environment,
      ),
    })
  })
}

function planUnsupportedDrafts(
  plan: CloudflareResourcePlan,
  configuration: Record<string, unknown> | null,
): void {
  const queues = readRecord(configuration, 'queues')
  readArray(queues, 'producers').forEach((producer, index) => {
    if (!readNonEmptyString(producer, 'queue')) {
      addUnsupportedBlocker(plan, `queues.producers[${index}]`, 'queue')
    }
  })
  readArray(queues, 'consumers').forEach((consumer, index) => {
    if (!readNonEmptyString(consumer, 'queue')) {
      addUnsupportedBlocker(plan, `queues.consumers[${index}]`, 'queue')
    }
  })

  readArray(configuration, 'dispatch_namespaces').forEach(
    (namespace, index) => {
      if (!readNonEmptyString(namespace, 'namespace')) {
        addUnsupportedBlocker(
          plan,
          `dispatch_namespaces[${index}]`,
          'namespace',
        )
      }
    },
  )

  readArray(configuration, 'flagship').forEach((application, index) => {
    if (!readNonEmptyString(application, 'app_id')) {
      addUnsupportedBlocker(plan, `flagship[${index}]`, 'app_id')
    }
  })
}

function addUnsupportedBlocker(
  plan: CloudflareResourcePlan,
  configPath: string,
  property: string,
): void {
  plan.blockers.push({
    configPath,
    message: `Missing ${property}. This resource is not managed by cloudflare apply yet; create or adopt it explicitly and store the identifier in wrangler.jsonc.`,
  })
}

function selectEnvironment(
  root: Record<string, unknown>,
  environment?: string,
): Record<string, unknown> | null {
  if (!environment) return root
  return readRecord(readRecord(root, 'env'), environment)
}

function readWorkerName(
  root: Record<string, unknown>,
  environment: Record<string, unknown> | null,
): string {
  const name =
    readNonEmptyString(environment, 'name') ?? readNonEmptyString(root, 'name')
  if (!name) throw new Error('wrangler.jsonc must define a Worker name.')
  return name
}

function isMissingEnvironment(
  environment: string | undefined,
  configuration: Record<string, unknown> | null,
): boolean {
  return environment !== undefined && configuration === null
}

function readD1DatabaseName(
  plan: CloudflareResourcePlan,
  resource: Record<string, unknown>,
  workerName: string,
  binding: string,
  configPath: string,
): string | null {
  return (
    readNonEmptyString(resource, 'database_name') ??
    createResourceName(plan, workerName, binding, configPath)
  )
}

function readBinding(
  plan: CloudflareResourcePlan,
  resource: Record<string, unknown>,
  configPath: string,
): string | null {
  const binding = readNonEmptyString(resource, 'binding')
  if (binding) {
    return binding
  }

  plan.blockers.push({
    configPath,
    message: 'Missing binding name.',
  })
  return null
}

function createResourceName(
  plan: CloudflareResourcePlan,
  workerName: string,
  binding: string,
  configPath: string,
): string | null {
  const name = `${workerName}-${binding}`
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

  if (name.length >= 3 && name.length <= 63) {
    return name
  }

  plan.blockers.push({
    configPath,
    message:
      'The generated resource name must be between 3 and 63 characters. Shorten the Worker or binding name.',
  })
  return null
}

function withEnvironment(args: string[], environment?: string): string[] {
  return environment ? [...args, '--env', environment] : args
}

function withRemoteBinding(
  args: string[],
  resource: Record<string, unknown>,
): string[] {
  return resource.remote === true ? [...args, '--use-remote'] : args
}

function withR2Jurisdiction(
  args: string[],
  resource: Record<string, unknown>,
): string[] {
  const jurisdiction = readNonEmptyString(resource, 'jurisdiction')
  return jurisdiction ? [...args, '--jurisdiction', jurisdiction] : args
}

function parseWranglerConfiguration(source: string): Record<string, unknown> {
  const parser = (globalThis as JsoncRuntime).Bun?.JSONC
  if (!parser) {
    throw new Error('Cloudflare project commands must run with Bun.')
  }

  const value = parser.parse(source)
  if (!isRecord(value)) {
    throw new Error('wrangler.jsonc must contain a JSON object.')
  }
  return value
}

function readNonEmptyString(
  value: Record<string, unknown> | null,
  key: string,
): string | null {
  const property = value?.[key]
  return typeof property === 'string' && property.length > 0 ? property : null
}

function readRecord(
  value: Record<string, unknown> | null,
  key: string,
): Record<string, unknown> | null {
  const property = value?.[key]
  return isRecord(property) ? property : null
}

function readArray(
  value: Record<string, unknown> | null,
  key: string,
): Record<string, unknown>[] {
  const property = value?.[key]
  return Array.isArray(property) ? property.filter(isRecord) : []
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
