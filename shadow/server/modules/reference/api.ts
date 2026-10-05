import { memoMap } from '@server/runtime'
import { recordApiRequest, traceApiRequest } from '@server/observability'
import { makeReferenceHandler } from './handler'
import { ReferenceProduction } from './runtime'

const api = makeReferenceHandler(ReferenceProduction, {
  memoMap,
  onRequest: recordApiRequest,
})

export const handler = (request: Request) =>
  traceApiRequest(request, () => api.handler(request))
