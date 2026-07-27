import { HttpApiBuilder } from '@effect/platform'
import { Effect } from 'effect'
import { ShadowApi } from '@shared/api'

export const HealthCheckHandlersLive = HttpApiBuilder.group(
  ShadowApi,
  'healthCheck',
  (handlers) =>
    handlers.handle('check', () =>
      Effect.succeed({ message: 'ok' as const }),
    ),
)
