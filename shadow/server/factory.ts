import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { prettyJSON } from 'hono/pretty-json'
import { ApiError, NotFoundError } from '@server/lib/errors'

export const createApp = () => {
  const app = new Hono()

  app.use('*', logger())
  app.use('*', prettyJSON())

  app.onError((error, c) => {
    if (error instanceof ApiError) {
      return error.toResponse()
    }

    console.error(error)
    return c.json(
      { code: 'INTERNAL_ERROR', message: 'Internal Server Error' },
      500,
    )
  })

  app.notFound((c) => {
    const error = new NotFoundError(
      `The requested endpoint ${c.req.path} was not found`,
    )
    return error.toResponse()
  })

  return app
}
