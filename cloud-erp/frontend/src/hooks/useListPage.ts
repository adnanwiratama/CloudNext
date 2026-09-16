import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../services/api';

interface UseListPageOptions {
  queryKey: string;
  endpoint: string;
  defaultLimit?: number;
}

export function useListPage({ queryKey, endpoint, defaultLimit = 25 }: UseListPageOptions) {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(defaultLimit);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [filters, setFilters] = useState<Record<string, string>>({});

  const { data, isLoading, refetch } = useQuery({
    queryKey: [queryKey, page, limit, search, sortBy, sortDir, filters],
    queryFn: () =>
      api.get(endpoint, { params: { page, limit, search, sortBy, sortDir, ...filters } })
        .then(r => r.data),
    placeholderData: (prev) => prev,
  });

  const handleSearch = useCallback((val: string) => {
    setSearch(val);
    setPage(1);
  }, []);

  const handleSort = useCallback((key: string, dir: 'asc' | 'desc') => {
    setSortBy(key);
    setSortDir(dir);
    setPage(1);
  }, []);

  const handleFilter = useCallback((key: string, val: string) => {
    setFilters(prev => ({ ...prev, [key]: val }));
    setPage(1);
  }, []);

  return {
    data: data?.data || [],
    total: data?.total || 0,
    page,
    limit,
    search,
    sortBy,
    sortDir,
    isLoading,
    refetch,
    setPage,
    setLimit,
    handleSearch,
    handleSort,
    handleFilter,
    filters,
  };
}
