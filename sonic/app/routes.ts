import { type RouteConfig } from '@react-router/dev/routes'
import { nextRoutes } from 'rr-next-routes'

const routes = nextRoutes({ print: 'info' })

export default routes satisfies RouteConfig
