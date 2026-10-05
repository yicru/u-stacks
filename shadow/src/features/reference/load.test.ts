import { afterEach, beforeEach, expect, it, vi } from 'vite-plus/test'
import { loadReference } from './load'

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
    if (url.pathname === '/api/reference/tasks') return page
    if (url.pathname === '/api/reference/summary') return summary
    throw new Error(`Unexpected request: ${url.pathname}`)
  })
  return requested
}

beforeEach(() => {
  fetch.mockReset()
  vi.stubGlobal('fetch', fetch)
})

afterEach(() => vi.unstubAllGlobals())

it('returns the page while an independent summary is pending and isolates its failure', async () => {
  const page = gate<Response>()
  const summary = gate<Response>()
  const requested = respondWith(page.promise, summary.promise)
  const loaded = loadReference({ mode: 'stream' }, new AbortController().signal)
  await vi.waitFor(() => expect(requested.size).toBe(2))
  page.resolve(Response.json({ data: [], nextCursor: null }))
  const result = await loaded
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
  expect(await result.summary).toEqual({ ok: false })
})

it('propagates a primary page failure without leaving an unhandled summary rejection', async () => {
  const page = gate<Response>()
  const summary = gate<Response>()
  const requested = respondWith(page.promise, summary.promise)
  const loaded = loadReference({ mode: 'stream' }, new AbortController().signal)
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
