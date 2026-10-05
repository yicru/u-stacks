import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
} from '@tanstack/react-router'
import { expect, it, vi } from 'vite-plus/test'
import { getRouter } from './router'

const { load } = vi.hoisted(() => ({ load: vi.fn(async () => 'loaded') }))

vi.mock('./routeTree.gen', () => {
  const root = createRootRoute()
  return {
    routeTree: root.addChildren([
      createRoute({ getParentRoute: () => root, path: '/', loader: load }),
      createRoute({ getParentRoute: () => root, path: '/idle' }),
    ]),
  }
})

it('reuses completed preloads and refreshes them after invalidation', async () => {
  const history = createMemoryHistory({ initialEntries: ['/idle'] })
  const router = getRouter()
  router.update({ history })
  await router.load()
  await router.preloadRoute({ to: '/' })
  await new Promise((resolve) => setTimeout(resolve, 10))
  history.push('/')
  await router.load()

  expect(load).toHaveBeenCalledTimes(1)

  await router.invalidate({ sync: true })

  expect(load).toHaveBeenCalledTimes(2)
})
