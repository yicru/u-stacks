import { createClientOnlyFn } from '@tanstack/react-start'
import { Effect } from 'effect'
import type {
  ReferenceOverview,
  ReferencePage,
  ReferencePageQuery,
  ReferenceSearch,
  ReferenceSummary,
} from '@shared/api/reference'

interface Readers {
  page: () => Promise<ReferencePage>
  summary: () => Promise<ReferenceSummary>
  overview: () => Promise<ReferenceOverview>
}

type SummaryResult =
  | { readonly ok: true; readonly data: ReferenceSummary }
  | { readonly ok: false }

function pageQuery(search: typeof ReferenceSearch.Type): ReferencePageQuery {
  return { cursor: search.cursor, limit: 10 }
}

async function readData(
  readers: Readers,
  mode: typeof ReferenceSearch.Type.mode,
) {
  if (mode === 'parallel') {
    const { page, summary } = await readers.overview()
    return {
      page,
      summary: Promise.resolve<SummaryResult>({ ok: true, data: summary }),
    }
  }
  const summary = readers.summary().then<SummaryResult, SummaryResult>(
    (data) => ({ ok: true, data }),
    () => ({ ok: false }),
  )
  return { page: await readers.page(), summary }
}

export const loadReference = createClientOnlyFn(
  async (search: typeof ReferenceSearch.Type, signal: AbortSignal) => {
    const { referenceClient } = await import('./client')
    const query = pageQuery(search)
    return readData(
      {
        page: () =>
          Effect.runPromise(referenceClient.reference.getPage({ query }), {
            signal,
          }),
        summary: () =>
          Effect.runPromise(referenceClient.reference.getSummary(), { signal }),
        overview: () =>
          Effect.runPromise(referenceClient.reference.getOverview({ query }), {
            signal,
          }),
      },
      search.mode,
    )
  },
)
