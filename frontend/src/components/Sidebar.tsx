'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Shield,
  Search,
  FileText,
  BarChart3,
  Settings,
  Activity,
  Users,
  LogOut,
  ChevronLeft,
} from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';

const menuItems = [
  { icon: LayoutDashboard, label: '概览', href: '/dashboard' },
  { icon: Shield, label: '漏洞管理', href: '/vulnerabilities' },
  { icon: Search, label: '扫描任务', href: '/scans' },
  { icon: FileText, label: '资产管理', href: '/assets' },
  { icon: BarChart3, label: '报告中心', href: '/reports' },
  { icon: Users, label: '团队管理', href: '/team' },
  { icon: Settings, label: '系统设置', href: '/settings' },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  return (
    <aside
      className={`fixed left-0 top-0 h-screen bg-dark-bg border-r border-dark-border transition-all duration-300 z-40 ${
        collapsed ? 'w-16' : 'w-64'
      }`}
    >
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between p-4 border-b border-dark-border">
          {!collapsed && (
            <Link href="/dashboard" className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <Shield className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white">SecGuard</h1>
                <p className="text-xs text-gray-500">SENTINEL V2.4</p>
              </div>
            </Link>
          )}
          {collapsed && (
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center mx-auto">
              <Shield className="w-5 h-5 text-white" />
            </div>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-1 hover:bg-dark-hover rounded transition-colors"
          >
            <ChevronLeft
              className={`w-5 h-5 text-gray-400 transition-transform ${
                collapsed ? 'rotate-180' : ''
              }`}
            />
          </button>
        </div>

        <nav className="flex-1 py-4 overflow-y-auto">
          <ul className="space-y-1 px-2">
            {menuItems.map((item) => {
              const isActive = pathname.startsWith(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`flex items-center space-x-3 px-3 py-2.5 rounded-lg transition-all group ${
                      isActive
                        ? 'bg-primary/10 text-primary border-l-2 border-primary'
                        : 'text-gray-400 hover:bg-dark-hover hover:text-white'
                    }`}
                  >
                    <item.icon className={`w-5 h-5 ${isActive ? 'text-primary' : ''}`} />
                    {!collapsed && (
                      <span className="text-sm font-medium">{item.label}</span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="p-4 border-t border-dark-border space-y-2">
          {!collapsed && (
            <div className="flex items-center space-x-3 px-3 py-2 bg-dark-card rounded-lg">
              <Activity className="w-4 h-4 text-green-500" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-white truncate">系统版本 v4.2.0</p>
                <p className="text-xs text-gray-500">运行正常</p>
              </div>
            </div>
          )}
          <button
            onClick={handleLogout}
            className="flex items-center space-x-3 px-3 py-2 w-full text-gray-400 hover:bg-dark-hover hover:text-red-400 rounded-lg transition-colors"
          >
            <LogOut className="w-5 h-5" />
            {!collapsed && <span className="text-sm">退出登录</span>}
          </button>
        </div>
      </div>
    </aside>
  );
}
