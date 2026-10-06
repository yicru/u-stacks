import { afterEach, beforeEach, expect, it, vi } from 'vite-plus/test'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { Schema } from 'effect'
import { TaskSearch } from '@shared/api/examples/task'
import { loadTasks } from './load-tasks'

const fetch = vi.hoisted(() => vi.fn<typeof globalThis.fetch>())

function gate<A>() {
  let resolve = (_value: A) => {}
  const promise = new Promise<A>((complete) => {
    resolve = complete
  })
  return { promise, resolve }
}

function respondWith(page: Promise<Response>, summary: Promise<Response>) {
  const requested = new Set<string>()
  fetch.mockImplementation((input) => {
    const url = new URL(input instanceof Request ? input.url : input.toString())
    requested.add(url.pathname)
    if (url.pathname === '/api/tasks/page') return page
    if (url.pathname === '/api/tasks/summary') return summary
    throw new Error(`Unexpected request: ${url.pathname}`)
  })
  return requested
}

beforeEach(() => {
  fetch.mockReset()
  vi.stubGlobal('fetch', fetch)
})

afterEach(() => vi.unstubAllGlobals())

it.each(['basic', 'parallel'] as const)(
  'loads %s mode with one request and no background reads',
  async (mode) => {
    const paths: string[] = []
    fetch.mockImplementation(async (input) => {
      const url = new URL(
        input instanceof Request ? input.url : input.toString(),
      )
      paths.push(url.pathname)
      if (url.pathname === '/api/tasks') {
        return Response.json({
          data: [],
          meta: { page: 1, perPage: 10, total: 0, totalPages: 0 },
        })
      }
      if (url.pathname === '/api/tasks/overview') {
        return Response.json({
          page: { data: [], nextCursor: null },
          summary: { total: 0, open: 0, done: 0 },
        })
      }
      throw new Error(`Unexpected request: ${url.pathname}`)
    })
    const result = await loadTasks({ mode }, new AbortController().signal)
    expect(result.mode).toBe(mode)
    expect(paths).toEqual([
      mode === 'basic' ? '/api/tasks' : '/api/tasks/overview',
    ])
    if (result.mode === 'basic') {
      expect(result.list.data).toEqual([])
    } else {
      expect(result.page).toEqual({ data: [], nextCursor: null })
      expect(await result.summary).toEqual({
        status: 'ready',
        data: { total: 0, open: 0, done: 0 },
      })
    }
  },
)

it('returns the page while an independent summary is pending and isolates its failure', async () => {
  const page = gate<Response>()
  const summary = gate<Response>()
  const requested = respondWith(page.promise, summary.promise)
  const loaded = loadTasks({ mode: 'stream' }, new AbortController().signal)
  await vi.waitFor(() => expect(requested.size).toBe(2))
  page.resolve(Response.json({ data: [], nextCursor: null }))
  const result = await loaded
  if (result.mode === 'basic') throw new Error('Expected cursor data')
  let settled = false
  void result.summary.then(() => {
    settled = true
  })
  await Promise.resolve()
  expect(settled).toBe(false)
  expect(result.page).toEqual({ data: [], nextCursor: null })
  summary.resolve(
    Response.json(
      { code: 'INTERNAL_ERROR', message: 'Summary unavailable' },
      { status: 500 },
    ),
  )
  expect(await result.summary).toEqual({ status: 'error' })
})

it('propagates a primary page failure without leaving an unhandled summary rejection', async () => {
  const page = gate<Response>()
  const summary = gate<Response>()
  const requested = respondWith(page.promise, summary.promise)
  const loaded = loadTasks({ mode: 'stream' }, new AbortController().signal)
  const failure = expect(loaded).rejects.toThrow('Page unavailable')
  await vi.waitFor(() => expect(requested.size).toBe(2))
  page.resolve(
    Response.json(
      { code: 'INTERNAL_ERROR', message: 'Page unavailable' },
      { status: 500 },
    ),
  )
  summary.resolve(
    Response.json(
      { code: 'INTERNAL_ERROR', message: 'Summary unavailable' },
      { status: 500 },
    ),
  )
  await failure
})

it('keeps a canceled summary neutral when navigating back to cached list data', async () => {
  const summary = gate<Response>()
  const refreshedPage = gate<Response>()
  const emptyPage = () => Response.json({ data: [], nextCursor: null })
  const totals = () => Response.json({ total: 0, open: 0, done: 0 })
  let pages = 0
  let summaries = 0
  fetch.mockImplementation((input) => {
    const url = new URL(input instanceof Request ? input.url : input.toString())
    if (url.pathname === '/api/tasks/page') {
      pages += 1
      return pages === 1 ? Promise.resolve(emptyPage()) : refreshedPage.promise
    }
    if (url.pathname === '/api/tasks/summary') {
      summaries += 1
      return summaries === 1 ? summary.promise : Promise.resolve(totals())
    }
    throw new Error(`Unexpected request: ${url.pathname}`)
  })
  const loaded: Array<Awaited<ReturnType<typeof loadTasks>>> = []
  const root = createRootRoute()
  const taskRoute = createRoute({
    getParentRoute: () => root,
    path: '/',
    validateSearch: Schema.toStandardSchemaV1(TaskSearch),
    loaderDeps: ({ search }) => search,
    loader: async ({ deps, abortController }) => {
      const data = await loadTasks(deps, abortController.signal)
      loaded.push(data)
      return data
    },
  })
  const history = createMemoryHistory({ initialEntries: ['/?mode=stream'] })
  const router = createRouter({
    history,
    routeTree: root.addChildren([
      taskRoute,
      createRoute({ getParentRoute: () => root, path: '/idle' }),
    ]),
  })
  try {
    await router.load()
    const first = loaded[0]
    if (!first || first.mode === 'basic')
      throw new Error('Expected cursor data')
    history.push('/idle')
    await router.load()
    history.push('/?mode=stream')
    await router.load()
    await vi.waitFor(() => expect(pages).toBe(2))
    expect(
      router.state.matches.find((match) => match.routeId === taskRoute.id)
        ?.loaderData,
    ).toBe(first)
    expect(await first.summary).toEqual({ status: 'cancelled' })
    refreshedPage.resolve(emptyPage())
    await vi.waitFor(() => expect(loaded).toHaveLength(2))
    const refreshed = loaded[1]
    if (!refreshed || refreshed.mode === 'basic') {
      throw new Error('Expected refreshed cursor data')
    }
    expect(await refreshed.summary).toEqual({
      status: 'ready',
      data: { total: 0, open: 0, done: 0 },
    })
  } finally {
    refreshedPage.resolve(emptyPage())
    summary.resolve(totals())
    history.destroy()
  }
})
