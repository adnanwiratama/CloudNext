import { useQuery } from '@tanstack/react-query';
import api from '../services/api';

type Level = 'NONE' | 'VIEW' | 'CREATE' | 'EDIT' | 'FULL';
const RANK: Record<Level, number> = { NONE: 0, VIEW: 1, CREATE: 2, EDIT: 3, FULL: 4 };

// Reads the current user's role permission levels and exposes gate helpers.
// Keys match the role matrix (e.g. 'purchase_order', 'invoice', 'item').
// Admins (or roles that don't list a key) are allowed by default — matching the
// backend, which only blocks when a role explicitly limits a modelled resource.
export function usePermissions() {
  const { data } = useQuery({
    queryKey: ['my-permissions'],
    queryFn: () => api.get('/api/settings/my-permissions').then(r => r.data.data as { isAdmin: boolean; permissions: Record<string, Level> }),
    staleTime: 60_000,
  });

  const isAdmin = data?.isAdmin ?? false;
  const perms = data?.permissions ?? {};

  const atLeast = (key: string, min: Level): boolean => {
    if (isAdmin) return true;
    if (!(key in perms)) return true;          // not modelled for this role → allow
    return RANK[(perms[key] || 'NONE') as Level] >= RANK[min];
  };

  return {
    isAdmin,
    permissions: perms,
    canView:   (key: string) => atLeast(key, 'VIEW'),
    canCreate: (key: string) => atLeast(key, 'CREATE'),
    canEdit:   (key: string) => atLeast(key, 'EDIT'),
    canDelete: (key: string) => atLeast(key, 'FULL'),
  };
}
