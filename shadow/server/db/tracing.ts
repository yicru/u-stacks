import { Context } from 'effect'

export const DatabaseTracing = Context.Reference<{
  readonly query: <A>(name: string, operation: () => Promise<A>) => Promise<A>
}>('@server/db/DatabaseTracing', {
  defaultValue: () => ({ query: (_name, operation) => operation() }),
})
