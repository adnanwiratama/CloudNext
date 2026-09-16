import { useAuthStore } from '../store/authStore';

/**
 * Returns whether current user is admin.
 * Non-admin users cannot Add, Edit, or Delete master data or transactions.
 */
export function useAdminGuard() {
  const user = useAuthStore(s => s.user);
  const isAdmin = user?.isAdmin ?? false;

  return {
    isAdmin,
    canAdd: isAdmin,
    canEdit: isAdmin,
    canDelete: isAdmin,
  };
}
