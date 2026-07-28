import { HttpApiBuilder } from '@effect/platform'
import { Effect } from 'effect'
import { AppApi } from '@shared/api'

export const HealthCheckHandlersLive = HttpApiBuilder.group(
  AppApi,
  'healthCheck',
  (handlers) =>
    handlers.handle('check', () => Effect.succeed({ message: 'ok' as const })),
)
