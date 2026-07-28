import type { PaginationMeta } from '@shared/api/pagination'
import type { SQL } from 'drizzle-orm'
import type { SQLiteColumn, SQLiteSelect } from 'drizzle-orm/sqlite-core'

export function withPagination<T extends SQLiteSelect>(
  qb: T,
  params: {
    page: number
    perPage: number
    orderByColumn?: SQLiteColumn | SQL
  },
) {
  if (params.orderByColumn) {
    qb.orderBy(params.orderByColumn)
  }
  return qb.limit(params.perPage).offset((params.page - 1) * params.perPage)
}

export function toPaginatedResponse<T>(
  data: T[],
  input: { page: number; perPage: number; total: number },
): { data: T[]; meta: PaginationMeta } {
  return {
    data,
    meta: {
      page: input.page,
      perPage: input.perPage,
      total: input.total,
      totalPages:
        input.total === 0 ? 0 : Math.ceil(input.total / input.perPage),
    },
  }
}
