import { Schema } from 'effect'
import { HttpApiEndpoint, HttpApiGroup } from 'effect/unstable/httpapi'

const HealthCheckResponse = Schema.Struct({
  message: Schema.Literal('ok'),
})

export class HealthCheckApi extends HttpApiGroup.make('healthCheck').add(
  HttpApiEndpoint.get('check', '/health-check', {
    success: HealthCheckResponse,
  }),
) {}
