export interface PaginationParams {
  page: number;
  limit: number;
  sortBy: string;
  sortDir: 'asc' | 'desc';
  search: string;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export function getPaginationParams(query: any): PaginationParams {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(500, Math.max(1, parseInt(query.limit) || 25));
  const sortDir: 'asc' | 'desc' = query.sortDir === 'desc' ? 'desc' : 'asc';
  return {
    page,
    limit,
    sortBy: query.sortBy || '',
    sortDir,
    search: query.search || '',
  };
}

export function buildPaginatedResult<T>(data: T[], total: number, page: number, limit: number): PaginatedResult<T> {
  return {
    data,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}
