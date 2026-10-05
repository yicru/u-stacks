import { beforeEach, expect, it, vi } from 'vite-plus/test'
import type { ReferencePage, ReferenceSummary } from '@shared/api/reference'
import { loadReference } from './load'

const readers = vi.hoisted(() => ({
  loadPage: vi.fn<() => Promise<ReferencePage>>(),
  loadSummary: vi.fn<() => Promise<ReferenceSummary>>(),
  loadOverview: vi.fn(),
}))

vi.mock('@server/modules/reference/runtime', () => readers)

function gate<A>() {
  let resolve = (_value: A) => {}
  let reject = (_error: Error) => {}
  const promise = new Promise<A>((complete, fail) => {
    resolve = complete
    reject = fail
  })
  return { promise, resolve, reject }
}

beforeEach(() => vi.clearAllMocks())

it('returns the page while an independent summary is pending and isolates its failure', async () => {
  const page = gate<ReferencePage>()
  const summary = gate<ReferenceSummary>()
  readers.loadPage.mockReturnValue(page.promise)
  readers.loadSummary.mockReturnValue(summary.promise)
  const loaded = loadReference({ mode: 'stream' }, new AbortController().signal)
  await vi.waitFor(() => {
    expect(readers.loadPage).toHaveBeenCalled()
    expect(readers.loadSummary).toHaveBeenCalled()
  })
  page.resolve({ data: [], nextCursor: null })
  const result = await loaded
  let settled = false
  void result.summary.then(() => {
    settled = true
  })
  await Promise.resolve()
  expect(settled).toBe(false)
  expect(result.page).toEqual({ data: [], nextCursor: null })
  summary.reject(new Error('Summary unavailable'))
  expect(await result.summary).toEqual({ ok: false })
})

it('propagates a primary page failure without leaving an unhandled summary rejection', async () => {
  const page = gate<ReferencePage>()
  const summary = gate<ReferenceSummary>()
  readers.loadPage.mockReturnValue(page.promise)
  readers.loadSummary.mockReturnValue(summary.promise)
  const loaded = loadReference({ mode: 'stream' }, new AbortController().signal)
  const failure = expect(loaded).rejects.toThrow('Page unavailable')
  await vi.waitFor(() => expect(readers.loadPage).toHaveBeenCalled())
  page.reject(new Error('Page unavailable'))
  summary.reject(new Error('Summary unavailable'))
  await failure
})
