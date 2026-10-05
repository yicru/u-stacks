import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { WorkerConfig } from 'cf/config'

const RESOURCE_IDS_PATH = resolve(
  import.meta.dirname,
  '..',
  'cloudflare.resources.json',
)

type Binding = NonNullable<WorkerConfig['env']>[string]

type ResourceIdentifier = { type: string; id: string }
type ResourceIdentifiers = Record<
  string,
  Record<string, Record<string, ResourceIdentifier>>
>

export function withCloudflareResourceIds<const T extends WorkerConfig>(
  worker: T,
  accountId?: string,
): T {
  if (!accountId) return worker
  const identifiers = identifiersForWorker(accountId, worker.name)
  Object.entries(worker.env ?? {}).forEach(([name, binding]) => {
    const stored = identifiers[name]
    if (stored) restoreIdentifier(name, binding, stored)
  })
  return worker
}

function identifiersForWorker(
  accountId: string,
  workerName: string,
): Record<string, ResourceIdentifier> {
  return readIdentifiers()[accountId]?.[workerName] ?? {}
}

function restoreIdentifier(
  name: string,
  binding: Binding,
  stored: ResourceIdentifier,
): void {
  if (stored.type !== binding.type) {
    throw new Error(
      `Stored Cloudflare resource type differs for ${name}. Review cloudflare.resources.json.`,
    )
  }
  restoreDatabaseIdentifier(binding, stored.id)
  if (binding.type === 'r2') binding.name ||= stored.id
}

function restoreDatabaseIdentifier(binding: Binding, id: string): void {
  if (binding.type === 'kv' || binding.type === 'd1') binding.id ||= id
}

export function storeCloudflareResourceId(
  accountId: string,
  workerName: string,
  binding: string,
  type: string,
  id: string,
): void {
  const identifiers = readIdentifiers()
  identifiers[accountId] ??= {}
  identifiers[accountId][workerName] ??= {}
  identifiers[accountId][workerName][binding] = { type, id }
  writeFileSync(RESOURCE_IDS_PATH, `${JSON.stringify(identifiers, null, 2)}\n`)
}

function readIdentifiers(): ResourceIdentifiers {
  if (!existsSync(RESOURCE_IDS_PATH)) return {}
  const value: unknown = JSON.parse(readFileSync(RESOURCE_IDS_PATH, 'utf-8'))
  assertResourceIdentifiers(value)
  return value
}

function assertResourceIdentifiers(
  value: unknown,
): asserts value is ResourceIdentifiers {
  assertRecord(value, 'Invalid cloudflare.resources.json.')
  Object.values(value).forEach(assertWorkers)
}

function assertWorkers(value: unknown): void {
  assertRecord(value, 'Invalid Cloudflare resource account.')
  Object.values(value).forEach(assertBindings)
}

function assertBindings(value: unknown): void {
  assertRecord(value, 'Invalid Cloudflare resource Worker.')
  Object.values(value).forEach(assertIdentifier)
}

function assertIdentifier(value: unknown): void {
  assertRecord(value, 'Invalid Cloudflare resource identifier.')
  if (
    typeof value.type !== 'string' ||
    typeof value.id !== 'string' ||
    !value.id
  )
    throw new Error('Invalid Cloudflare resource identifier.')
}

function assertRecord(
  value: unknown,
  message: string,
): asserts value is Record<string, unknown> {
  if (!isRecord(value)) throw new Error(message)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
