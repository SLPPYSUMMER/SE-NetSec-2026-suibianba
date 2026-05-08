'use client';

import { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import { auditApi } from '@/services/api';
import { Users, FileText, Shield, Settings, Plus, MoreVertical, Download, LogOut, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';

export default function SettingsPage() {
  const { logout, user } = useAuth();
  const router = useRouter();
  const [twoFAEnabled, setTwoFAEnabled] = useState(true);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    auditApi.list({ page: '1', per_page: '20' })
      .then((data) => setAuditLogs(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleLogout = async () => {
    await logout();
    router.push('/');
  };

  const actionColor = (action: string) => {
    if (action.includes('FAIL') || action.includes('异常') || action.includes('DELETE')) return 'text-red-400';
    if (action.includes('CREATE') || action.includes('SUCCESS') || action.includes('FIX')) return 'text-green-400';
    return 'text-gray-300';
  };

  return (
    <div className="min-h-screen bg-dark-bg">
      <Sidebar />
      <div className="ml-64">
        <Header />
        <main className="p-6 space-y-6">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-3xl font-bold text-white">系统权限与设置</h1>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-dark-card border border-dark-border rounded-xl p-6">
                <div className="flex items-center space-x-2 mb-4">
                  <FileText className="w-5 h-5 text-primary" />
                  <h3 className="text-lg font-semibold text-white">操作审计日志</h3>
                </div>
                <p className="text-sm text-gray-400 mb-6">追踪所有系统级别的配置变更与访问行为</p>
                <div className="overflow-hidden rounded-lg border border-dark-border">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-dark-bg">
                        <th className="text-left px-6 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">用户</th>
                        <th className="text-left px-6 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">操作行为</th>
                        <th className="text-left px-6 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">IP 地址</th>
                        <th className="text-right px-6 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">时间戳</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-dark-border bg-dark-bg">
                      {loading ? (
                        <tr><td colSpan={4} className="px-6 py-8 text-center"><Loader2 className="w-5 h-5 text-primary animate-spin mx-auto" /></td></tr>
                      ) : auditLogs.length === 0 ? (
                        <tr><td colSpan={4} className="px-6 py-8 text-center text-gray-500">暂无审计日志</td></tr>
                      ) : auditLogs.map((log, i) => (
                        <tr key={i} className="hover:bg-dark-hover transition-colors">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="text-sm font-medium text-white">{log.user?.username || '系统'}</span>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`text-sm ${actionColor(log.action)}`}>{log.action} {log.detail ? `- ${log.detail}` : ''}</span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="text-sm text-gray-400 font-mono">{log.ip_address || '--'}</span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right">
                            <span className="text-sm text-gray-400">{log.timestamp?.substring(0, 19).replace('T', ' ')}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="bg-dark-card border border-dark-border rounded-xl p-6">
                <h3 className="text-xl font-bold text-white mb-3">当前用户</h3>
                <div className="space-y-2">
                  <p className="text-sm text-gray-300">用户名: <span className="text-white">{user?.name || '--'}</span></p>
                  <p className="text-sm text-gray-300">角色: <span className="text-primary">{user?.role || '--'}</span></p>
                  <p className="text-sm text-gray-300">权限: <span className="text-white">{user?.is_staff ? '管理员' : '普通用户'}</span></p>
                </div>
              </div>

              <div className="bg-dark-card border border-dark-border rounded-xl p-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl"></div>
                <div className="relative z-10">
                  <h3 className="text-xl font-bold text-white mb-2">安全等级</h3>
                  <div className="text-5xl font-bold text-white mb-2">Tier <span className="text-primary">4</span></div>
                  <p className="text-sm text-gray-400 mb-4">最高防护模式已启用</p>
                </div>
                <div className="w-12 h-12 bg-primary rounded-full flex items-center justify-center shadow-lg shadow-primary/25 ml-auto">
                  <Shield className="w-6 h-6 text-white" />
                </div>
              </div>

              <button onClick={handleLogout}
                className="w-full py-3 bg-dark-card border border-dark-border text-gray-300 rounded-lg hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-400 transition-all flex items-center justify-center space-x-2">
                <LogOut className="w-4 h-4" /><span>退出登录</span>
              </button>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
