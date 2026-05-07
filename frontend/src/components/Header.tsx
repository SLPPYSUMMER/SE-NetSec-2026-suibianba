'use client';

import { Bell, HelpCircle, User, Search, Settings, LogOut } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';

interface HeaderProps {
  title?: string;
}

export default function Header({ title }: HeaderProps) {
  const { user, logout } = useAuth();
  const router = useRouter();

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  return (
    <header className="sticky top-0 z-30 bg-dark-bg/80 backdrop-blur-md border-b border-dark-border">
      <div className="flex items-center justify-between h-16 px-6">
        <div className="flex items-center space-x-4 flex-1">
          <div className="relative max-w-md flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              placeholder="搜索资产、漏洞或任务..."
              className="w-full pl-10 pr-4 py-2 bg-dark-card border border-dark-border rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-primary transition-colors"
            />
          </div>
        </div>

        <div className="flex items-center space-x-4">
          <button className="p-2 text-gray-400 hover:text-white hover:bg-dark-hover rounded-lg transition-colors relative">
            <Bell className="w-5 h-5" />
            <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
          </button>

          <button className="p-2 text-gray-400 hover:text-white hover:bg-dark-hover rounded-lg transition-colors">
            <HelpCircle className="w-5 h-5" />
          </button>

          <div className="flex items-center space-x-3 pl-4 border-l border-dark-border">
            <div className="text-right">
              <p className="text-sm font-medium text-white">{user?.name || 'Admin_Chen'}</p>
              <p className="text-xs text-gray-500">{user?.role || '高级安全分析师'}</p>
            </div>
            <div className="w-10 h-10 bg-gradient-to-br from-primary to-cyan-600 rounded-full flex items-center justify-center">
              <User className="w-5 h-5 text-white" />
            </div>
          </div>
        </div>
      </div>

      {title && (
        <div className="px-6 pb-4">
          <h1 className="text-2xl font-bold text-white">{title}</h1>
          <p className="text-sm text-gray-400 mt-1">实时监控、分析与修复全网资产的安全漏洞</p>
        </div>
      )}
    </header>
  );
}
