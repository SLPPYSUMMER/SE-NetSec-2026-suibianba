'use client';

import { useState, useEffect, useRef } from 'react';
import { Bell, HelpCircle, User, Search, X, CheckCheck } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { notificationApi } from '@/services/api';

interface HeaderProps {
  title?: string;
}

export default function Header({ title }: HeaderProps) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = async () => {
    try {
      const data = await notificationApi.list({ per_page: '10' });
      setNotifications(data.items || []);
      setUnreadCount(data.unread_count || 0);
    } catch {}
  };

  const fetchUnreadCount = async () => {
    try {
      const data = await notificationApi.unreadCount();
      setUnreadCount(data.unread_count || 0);
    } catch {}
  };

  useEffect(() => { fetchUnreadCount(); }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowNotifications(false);
      }
    };
    if (showNotifications) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showNotifications]);

  const handleBellClick = () => {
    if (!showNotifications) {
      fetchNotifications();
    }
    setShowNotifications(!showNotifications);
  };

  const handleMarkRead = async (id: number) => {
    try {
      await notificationApi.markRead(id);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch {}
  };

  const handleMarkAllRead = async () => {
    try {
      await notificationApi.markAllRead();
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch {}
  };

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}分钟前`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}小时前`;
    return `${Math.floor(hours / 24)}天前`;
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
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={handleBellClick}
              className="p-2 text-gray-400 hover:text-white hover:bg-dark-hover rounded-lg transition-colors relative"
            >
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 min-w-[18px] h-[18px] bg-red-500 rounded-full flex items-center justify-center text-[10px] font-bold text-white px-1">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>

            {showNotifications && (
              <div className="absolute right-0 mt-2 w-80 bg-dark-card border border-dark-border rounded-xl shadow-2xl z-50 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-dark-border">
                  <h3 className="text-sm font-semibold text-white">通知</h3>
                  <div className="flex items-center space-x-2">
                    {unreadCount > 0 && (
                      <button
                        onClick={handleMarkAllRead}
                        className="text-xs text-primary hover:text-primary/80 flex items-center space-x-1"
                      >
                        <CheckCheck className="w-3.5 h-3.5" />
                        <span>全部已读</span>
                      </button>
                    )}
                    <button
                      onClick={() => setShowNotifications(false)}
                      className="text-gray-400 hover:text-white"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="max-h-96 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="px-4 py-8 text-center text-gray-500 text-sm">暂无通知</div>
                  ) : (
                    notifications.map(n => (
                      <div
                        key={n.id}
                        onClick={() => {
                          handleMarkRead(n.id);
                          if (n.link) router.push(n.link);
                        }}
                        className={`px-4 py-3 border-b border-dark-border last:border-0 cursor-pointer hover:bg-dark-hover transition-colors ${
                          !n.is_read ? 'bg-primary/5' : ''
                        }`}
                      >
                        <div className="flex items-start space-x-3">
                          <div className={`w-2 h-2 mt-1.5 rounded-full flex-shrink-0 ${n.is_read ? 'bg-gray-600' : 'bg-primary'}`} />
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm ${n.is_read ? 'text-gray-400' : 'text-white'}`}>{n.message}</p>
                            <p className="text-xs text-gray-500 mt-1">{timeAgo(n.created_at)}</p>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          <button className="p-2 text-gray-400 hover:text-white hover:bg-dark-hover rounded-lg transition-colors">
            <HelpCircle className="w-5 h-5" />
          </button>

          <div className="flex items-center space-x-3 pl-4 border-l border-dark-border">
            <div className="text-right">
              <p className="text-sm font-medium text-white">{user?.name || 'Admin_Chen'}</p>
              {user?.is_staff && <p className="text-xs text-gray-500">{user?.role}</p>}
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
