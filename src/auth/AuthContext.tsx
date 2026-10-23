import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { EmployeeOut } from '../../shared/types';
import { api } from '../api/client';

interface AuthContextValue {
  me: EmployeeOut | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<EmployeeOut | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const { employee } = await api<{ employee: EmployeeOut }>('/api/auth/me');
      setMe(employee);
    } catch {
      setMe(null);
    }
  }, []);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const { employee } = await api<{ employee: EmployeeOut }>('/api/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    setMe(employee);
  }, []);

  const logout = useCallback(async () => {
    await api('/api/auth/logout', { method: 'POST' });
    setMe(null);
  }, []);

  return (
    <AuthContext.Provider value={{ me, loading, login, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
