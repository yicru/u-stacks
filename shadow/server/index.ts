import { makeApiHandler } from './handler'
import { recordApiRequest, traceApiRequest } from './observability'
import { memoMap, TaskServiceProduction } from './runtime'

const api = makeApiHandler(TaskServiceProduction, {
  memoMap,
  onRequest: recordApiRequest,
})

export const handler = (request: Request) =>
  traceApiRequest(request, () => api.handler(request))
