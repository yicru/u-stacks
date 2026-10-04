import { Effect } from 'effect'
import { HttpApiBuilder } from 'effect/http-api'
import { AppApi } from '@shared/api'

export const HealthCheckHandlersLive = HttpApiBuilder.group(
  AppApi,
  'healthCheck',
  (handlers) =>
    handlers.handle('check', () => Effect.succeed({ message: 'ok' as const })),
)
