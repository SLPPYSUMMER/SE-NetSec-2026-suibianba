'use client';

import { useState } from 'react';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import { mockTeamMembers, mockAuditLogs } from '@/services/mockData';
import {
  Users,
  FileText,
  Shield,
  Settings,
  Plus,
  MoreVertical,
  Download,
  LogOut,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';

export default function SettingsPage() {
  const [twoFAEnabled, setTwoFAEnabled] = useState(true);

  return (
    <div className="min-h-screen bg-dark-bg">
      <Sidebar />
      <div className="ml-64">
        <Header />

        <main className="p-6 space-y-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold text-white">系统权限与设置</h1>
            </div>
            <button className="px-4 py-2.5 bg-gradient-to-r from-primary to-cyan-400 text-white font-medium rounded-lg hover:shadow-lg hover:shadow-primary/25 transition-all flex items-center space-x-2 text-sm">
              <Plus className="w-4 h-4" />
              <span>新增成员</span>
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-dark-card border border-dark-border rounded-xl p-6">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center space-x-2">
                    <Users className="w-5 h-5 text-primary" />
                    <h3 className="text-lg font-semibold text-white">核心团队成员</h3>
                  </div>
                  <span className="text-xs text-gray-500">近 24 小时</span>
                </div>
                <p className="text-sm text-gray-400 mb-6">
                  管理具备 Sentinel 系统访问权限的安全作业人员
                </p>

                <div className="space-y-4">
                  {mockTeamMembers.map((member) => (
                    <div
                      key={member.id}
                      className="flex items-center justify-between p-4 bg-dark-bg rounded-lg hover:bg-dark-hover transition-colors group"
                    >
                      <div className="flex items-center space-x-4">
                        <div className="w-12 h-12 bg-gradient-to-br from-primary to-cyan-600 rounded-full flex items-center justify-center text-lg font-bold text-white">
                          {member.avatar}
                        </div>
                        <div>
                          <p className="font-medium text-white">{member.name}</p>
                          <p className="text-sm text-gray-500">{member.email}</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-4">
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-medium ${member.roleColor}`}
                        >
                          {member.role}
                        </span>
                        <span className="text-xs text-gray-500 hidden lg:block">
                          {member.lastActive}
                        </span>
                        <button className="p-2 text-gray-400 hover:text-white opacity-0 group-hover:opacity-100 transition-all">
                          <MoreVertical className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-dark-card border border-dark-border rounded-xl p-6">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center space-x-2">
                    <FileText className="w-5 h-5 text-primary" />
                    <h3 className="text-lg font-semibold text-white">操作审计日志</h3>
                  </div>
                  <span className="text-xs text-gray-500">近 24 小时</span>
                </div>
                <p className="text-sm text-gray-400 mb-6">
                  追踪所有系统级别的配置变更与访问行为
                </p>

                <div className="overflow-hidden rounded-lg border border-dark-border">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-dark-bg">
                        <th className="text-left px-6 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">
                          用户
                        </th>
                        <th className="text-left px-6 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">
                          操作行为
                        </th>
                        <th className="text-left px-6 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">
                          IP 地址
                        </th>
                        <th className="text-right px-6 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">
                          时间戳
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-dark-border bg-dark-bg">
                      {mockAuditLogs.map((log, index) => (
                        <tr key={index} className="hover:bg-dark-hover transition-colors">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center space-x-2">
                              {log.icon && <log.icon className={`w-4 h-4 ${log.iconColor}`} />}
                              <span className="text-sm font-medium text-white">
                                {log.user}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span
                              className={`text-sm ${
                                log.action.includes('异常')
                                  ? 'text-red-400'
                                  : 'text-gray-300'
                              }`}
                            >
                              {log.action}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="text-sm text-gray-400 font-mono">
                              {log.ip}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right">
                            <span className="text-sm text-gray-400">{log.time}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <button className="mt-4 w-full py-2.5 text-sm text-primary hover:text-cyan-400 transition-colors">
                  查看完整审计历史
                </button>
              </div>
            </div>

            <div className="space-y-6">
              <button className="w-full py-3 bg-dark-card border border-primary/50 text-primary rounded-lg hover:bg-primary/10 transition-all flex items-center justify-center space-x-2 font-medium">
                <Download className="w-4 h-4" />
                <span>导出实时数据</span>
              </button>

              <div className="bg-dark-card border border-dark-border rounded-xl p-6">
                <h3 className="text-xl font-bold text-white mb-3">
                  双因素身份验证 (2FA)
                </h3>
                <p className="text-sm text-gray-400 leading-relaxed mb-6">
                  为了确保您的组织安全，我们强制要求所有具备管理员角色的账户启用双因素身份验证。
                  目前合规率为{' '}
                  <span className="text-primary font-medium">88%</span>。
                </p>

                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-300">启用状态</span>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={twoFAEnabled}
                        onChange={(e) => setTwoFAEnabled(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-dark-bg peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                    </label>
                  </div>
                  <div className="w-full bg-dark-border rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-primary to-cyan-400 h-full transition-all duration-500"
                      style={{ width: '88%' }}
                    ></div>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs text-gray-500">88 / 100 COMPLIANT</span>
                  </div>
                </div>
              </div>

              <div className="bg-dark-card border border-dark-border rounded-xl p-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl"></div>
                <div className="relative z-10">
                  <h3 className="text-xl font-bold text-white mb-2">安全等级</h3>
                  <div className="text-5xl font-bold text-white mb-2">
                    Tier <span className="text-primary">4</span>
                  </div>
                  <p className="text-sm text-gray-400 mb-4">
                    最高防护模式已启用
                  </p>
                  <button className="w-full py-2.5 bg-dark-bg border border-dark-border text-gray-300 rounded-lg hover:bg-dark-hover transition-all text-sm">
                    调整策略
                  </button>
                </div>
                <button className="absolute bottom-6 right-6 w-12 h-12 bg-primary rounded-full flex items-center justify-center shadow-lg shadow-primary/25 hover:bg-cyan-400 transition-colors">
                  <Shield className="w-6 h-6 text-white" />
                </button>
              </div>

              <button className="w-full py-3 bg-dark-card border border-dark-border text-gray-300 rounded-lg hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-400 transition-all flex items-center justify-center space-x-2">
                <LogOut className="w-4 h-4" />
                <span>退出登录</span>
              </button>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
