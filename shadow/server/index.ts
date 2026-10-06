import { makeApiHandler } from './handler'
import { recordApiRequest, traceApiRequest } from './observability'
import { memoMap, ApiServicesProduction } from './runtime'

const api = makeApiHandler(ApiServicesProduction, {
  memoMap,
  onRequest: recordApiRequest,
})

export const handler = (request: Request) =>
  traceApiRequest(request, () => api.handler(request))
