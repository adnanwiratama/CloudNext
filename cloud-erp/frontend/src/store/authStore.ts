import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface User {
  id: string;
  name: string;
  email: string;
  companyId: string;
  companyName: string;
  companyCode: string;
  baseCurrency: string;
  subsidiaryId: string;
  subsidiaryName: string;
  roleId: string;
  roleName: string;
  isAdmin: boolean;
  timezone: string;
  language: string;
  permissions: Array<{ module: string; resource: string; action: string }>;
}

interface AuthState {
  user: User | null;
  token: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  setAuth: (user: User, token: string, refreshToken: string) => void;
  setUser: (user: User) => void;
  logout: () => void;
  hasPermission: (module: string, resource: string, action: string) => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      refreshToken: null,
      isAuthenticated: false,

      setAuth: (user, token, refreshToken) =>
        set({ user, token, refreshToken, isAuthenticated: true }),

      setUser: (user) => set({ user }),

      logout: () =>
        set({ user: null, token: null, refreshToken: null, isAuthenticated: false }),

      hasPermission: (module, resource, action) => {
        const { user } = get();
        if (!user) return false;
        if (user.isAdmin) return true;
        return user.permissions.some(
          (p) =>
            (p.module === '*' || p.module === module) &&
            (p.resource === '*' || p.resource === resource) &&
            (p.action === '*' || p.action === action)
        );
      },
    }),
    {
      name: 'cloud-erp-auth',
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
