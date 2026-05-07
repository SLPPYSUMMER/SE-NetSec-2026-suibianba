'use client';

import { createContext, useContext, useState, ReactNode } from 'react';

interface AuthContextType {
  isAuthenticated: boolean;
  user: {
    name: string;
    email: string;
    role: string;
  } | null;
  login: (username: string, password: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(true);
  const [user, setUser] = useState<{
    name: string;
    email: string;
    role: string;
  } | null>({
    name: 'Admin_Chen',
    email: 'admin@secguard.io',
    role: '高级安全分析师',
  });

  const login = (username: string, password: string) => {
    setIsAuthenticated(true);
    setUser({
      name: username || 'Admin_Chen',
      email: `${username}@secguard.io`,
      role: '高级安全分析师',
    });
  };

  const logout = () => {
    setIsAuthenticated(false);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
