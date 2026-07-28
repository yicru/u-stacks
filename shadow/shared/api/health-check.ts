import { HttpApiEndpoint, HttpApiGroup } from '@effect/platform'
import { Schema } from 'effect'

export const HealthCheckResponse = Schema.Struct({
  message: Schema.Literal('ok'),
})

export type HealthCheckResponse = Schema.Schema.Type<typeof HealthCheckResponse>

export class HealthCheckApi extends HttpApiGroup.make('healthCheck').add(
  HttpApiEndpoint.get('check', '/health-check').addSuccess(HealthCheckResponse),
) {}
