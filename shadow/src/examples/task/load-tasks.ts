import { createClientOnlyFn } from '@tanstack/react-start'
import { Effect } from 'effect'
import type { TaskSearch, TaskSummary } from '@shared/api/examples/task'
import { apiClient } from '@/lib/api-client'

type SummaryResult =
  | { readonly status: 'ready'; readonly data: TaskSummary }
  | { readonly status: 'error' | 'cancelled' }

export const loadTasks = createClientOnlyFn(
  async (search: typeof TaskSearch.Type, signal: AbortSignal) => {
    if (search.mode === 'basic') {
      const list = await Effect.runPromise(
        apiClient.tasks.getTasks({ query: { page: 1, perPage: 10 } }),
        { signal },
      )
      return { mode: 'basic' as const, list }
    }

    const query = { cursor: search.cursor, limit: 10 }
    if (search.mode === 'parallel') {
      const { page, summary } = await Effect.runPromise(
        apiClient.tasks.getTaskOverview({ query }),
        { signal },
      )
      return {
        mode: search.mode,
        page,
        summary: Promise.resolve<SummaryResult>({
          status: 'ready',
          data: summary,
        }),
      }
    }

    const summary = Effect.runPromise(apiClient.tasks.getTaskSummary(), {
      signal,
    }).then<SummaryResult, SummaryResult>(
      (data) => ({ status: 'ready', data }),
      () => ({ status: signal.aborted ? 'cancelled' : 'error' }),
    )
    const page = await Effect.runPromise(
      apiClient.tasks.getTaskPage({ query }),
      {
        signal,
      },
    )
    return { mode: search.mode, page, summary }
  },
)
