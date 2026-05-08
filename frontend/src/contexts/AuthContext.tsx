'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { authApi } from '@/services/api';

interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  is_staff: boolean;
}

interface AuthContextType {
  isAuthenticated: boolean;
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authApi.check()
      .then((data) => {
        if (data.authenticated) {
          setIsAuthenticated(true);
          setUser({
            id: data.user_id!,
            name: data.username!,
            email: '',
            role: data.is_staff ? '管理员' : '安全分析师',
            is_staff: data.is_staff,
          });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const res = await authApi.login(username, password);
    if (res.success) {
      setIsAuthenticated(true);
      setUser({
        id: res.user_id,
        name: res.username,
        email: `${res.username}@secguard.io`,
        role: res.is_staff ? '管理员' : '安全分析师',
        is_staff: res.is_staff,
      });
    }
  }, []);

  const logout = useCallback(async () => {
    try { await authApi.logout(); } catch {}
    setIsAuthenticated(false);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ isAuthenticated, user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
