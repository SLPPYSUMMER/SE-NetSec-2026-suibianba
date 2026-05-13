'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { authApi } from '@/services/api';

interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  is_staff: boolean;
  team_id: number | null;
  team_name: string | null;
}

interface AuthContextType {
  isAuthenticated: boolean;
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const ROLE_LABELS: Record<string, string> = {
  admin: '管理员',
  team_lead: '项目经理',
  developer: '开发人员',
  observer: '安全测试员',
};

function roleLabel(role: string | null, isStaff: boolean): string {
  if (isStaff) return '系统管理员';
  return ROLE_LABELS[role || ''] || '未分配角色';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const buildUser = (data: any): User => ({
    id: data.user_id || data.id,
    name: data.username,
    email: data.email || '',
    role: roleLabel(data.role, data.is_staff),
    is_staff: data.is_staff,
    team_id: data.team_id || null,
    team_name: data.team_name || null,
  });

  const refreshUser = useCallback(async () => {
    try {
      const data = await authApi.check();
      if (data.authenticated) {
        setIsAuthenticated(true);
        setUser(buildUser(data));
      } else {
        setIsAuthenticated(false);
        setUser(null);
      }
    } catch {
      setIsAuthenticated(false);
      setUser(null);
    }
  }, []);

  useEffect(() => {
    refreshUser().finally(() => setLoading(false));
  }, [refreshUser]);

  const login = useCallback(async (username: string, password: string) => {
    const res = await authApi.login(username, password);
    if (res.success) {
      await refreshUser();
    }
  }, [refreshUser]);

  const logout = useCallback(async () => {
    try { await authApi.logout(); } catch {}
    setIsAuthenticated(false);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ isAuthenticated, user, loading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
