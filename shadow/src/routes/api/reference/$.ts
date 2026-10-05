import { createFileRoute } from '@tanstack/react-router'
import { createIsomorphicFn } from '@tanstack/react-start'

const handler = createIsomorphicFn()
  .server(async (request: Request) => {
    const { handler: handleReference } =
      await import('@server/modules/reference/api')
    return handleReference(request)
  })
  .client(() => {
    throw new Error('Reference API handlers only run on the server')
  })

export const Route = createFileRoute('/api/reference/$')({
  server: {
    handlers: {
      GET: ({ request }) => handler(request),
      POST: ({ request }) => handler(request),
    },
  },
})
