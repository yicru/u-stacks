import app from '@server/index'
import { handle } from 'hono/vercel'

export const GET = handle(app)
export const POST = handle(app)
export const PUT = handle(app)
export const DELETE = handle(app)
