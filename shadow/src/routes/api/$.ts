import { createFileRoute } from '@tanstack/react-router'
import { handler } from '@server/index'

export const Route = createFileRoute('/api/$')({
  server: {
    handlers: {
      GET: ({ request }) => handler(request),
      POST: ({ request }) => handler(request),
      PUT: ({ request }) => handler(request),
      PATCH: ({ request }) => handler(request),
      DELETE: ({ request }) => handler(request),
    },
  },
})
