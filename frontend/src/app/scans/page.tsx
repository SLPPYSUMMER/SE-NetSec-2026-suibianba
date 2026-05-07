'use client';

import { useState } from 'react';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import {
  Search,
  Plus,
  Play,
  Globe,
  Filter,
  Upload,
  ChevronLeft,
  ChevronRight,
  Activity,
} from 'lucide-react';

const scanTasks = [
  {
    id: 'SC-0821',
    name: 'Main_Portal_Daily',
    url: 'https://api.internal.com',
    status: '运行中',
    statusColor: 'text-cyan-400',
    progress: 64,
    findings: 14,
    lastRun: '2023-11-24 10:30',
  },
  {
    id: 'SC-0620',
    name: 'CRM_System_Deep',
    url: 'https://crm.secguard.io',
    status: '已排队',
    statusColor: 'text-yellow-400',
    progress: 0,
    findings: '--',
    lastRun: '待执行',
  },
  {
    id: 'SC-0409',
    name: 'Auth_Module_Sprint',
    url: 'https://auth.secguard.io',
    status: '已完成',
    statusColor: 'text-green-400',
    progress: 100,
    findings: 31,
    lastRun: '2023-11-23 22:15',
  },
];

export default function ScansPage() {
  const [targetUrl, setTargetUrl] = useState('');
  const [scanType, setScanType] = useState('deep');
  const [scheduleScan, setScheduleScan] = useState(false);

  return (
    <div className="min-h-screen bg-dark-bg">
      <Sidebar />
      <div className="ml-64">
        <Header />

        <main className="p-6 space-y-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold text-white">自动化扫描管理</h1>
              <p className="text-sm text-gray-400 mt-1">
                实时控制集群扫描任务与资源分配
              </p>
            </div>
            <button className="px-4 py-2.5 bg-dark-card border border-primary/50 text-primary rounded-lg hover:bg-primary/10 transition-all flex items-center space-x-2 text-sm font-medium">
              <Upload className="w-4 h-4" />
              <span>导入外部结果</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <div className="bg-dark-card border-l-4 border-l-primary rounded-lg p-6">
              <p className="text-sm text-gray-400 mb-2">当前活跃扫描</p>
              <div className="flex items-baseline space-x-2">
                <span className="text-4xl font-bold text-white">12</span>
                <span className="text-sm text-green-400 flex items-center">
                  +2
                  <Activity className="w-3 h-3 ml-1" />
                </span>
              </div>
            </div>

            <div className="bg-dark-card border-l-4 border-l-red-500 rounded-lg p-6">
              <p className="text-sm text-gray-400 mb-2">今日发现漏洞</p>
              <div className="flex items-baseline space-x-2">
                <span className="text-4xl font-bold text-white">45</span>
                <span className="text-sm text-red-400 flex items-center">
                  ▲ High Risk
                </span>
              </div>
            </div>

            <div className="bg-dark-card border-l-4 border-l-yellow-500 rounded-lg p-6">
              <p className="text-sm text-gray-400 mb-2">已集成引擎</p>
              <div className="flex flex-wrap gap-2 mt-3">
                {['Nettacker', 'OWASP ZAP', 'Burp Suite', 'Nuclei'].map(
                  (engine) => (
                    <span
                      key={engine}
                      className="px-3 py-1 bg-dark-bg border border-dark-border rounded text-xs text-gray-300"
                    >
                      {engine}
                    </span>
                  )
                )}
              </div>
            </div>
          </div>

          <div className="bg-dark-card border border-dark-border rounded-xl p-6">
            <h3 className="text-lg font-semibold text-white mb-4">
              创建新扫描任务
            </h3>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2">
                <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
                  扫描目标 (Target URL)
                </label>
                <div className="relative">
                  <Globe className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                  <input
                    type="url"
                    placeholder="https://example.com"
                    value={targetUrl}
                    onChange={(e) => setTargetUrl(e.target.value)}
                    className="w-full pl-12 pr-4 py-3 bg-dark-bg border border-dark-border rounded-lg text-white placeholder-gray-600 focus:outline-none focus:border-primary transition-colors"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
                    扫描配置模板
                  </label>
                  <select
                    value={scanType}
                    onChange={(e) => setScanType(e.target.value)}
                    className="w-full px-4 py-3 bg-dark-bg border border-dark-border rounded-lg text-white focus:outline-none focus:border-primary cursor-pointer"
                  >
                    <option value="deep">深度扫描 (Deep)</option>
                    <option value="quick">快速扫描 (Quick)</option>
                    <option value="custom">自定义 (Custom)</option>
                  </select>
                </div>

                <div className="flex items-end">
                  <label className="flex items-center justify-center space-x-2 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={scheduleScan}
                      onChange={(e) => setScheduleScan(e.target.checked)}
                      className="w-5 h-5 rounded border-dark-border bg-dark-bg text-primary focus:ring-primary focus:ring-offset-0"
                    />
                    <span className="text-sm text-gray-300 group-hover:text-white transition-colors">
                      定时设置
                    </span>
                  </label>
                </div>
              </div>
            </div>

            <div className="mt-4">
              <button className="px-8 py-3 bg-gradient-to-r from-primary to-cyan-400 text-white font-medium rounded-lg hover:shadow-lg hover:shadow-primary/25 transition-all flex items-center space-x-2">
                <Play className="w-5 h-5" />
                <span>立即开始</span>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
              </button>
            </div>
          </div>

          <div className="bg-dark-card border border-dark-border rounded-xl overflow-hidden">
            <div className="p-6 border-b border-dark-border flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Filter className="w-5 h-5 text-primary" />
                <h3 className="text-lg font-semibold text-white">最近扫描任务</h3>
              </div>
              <button className="p-2 text-gray-400 hover:text-white hover:bg-dark-hover rounded transition-colors">
                <Filter className="w-4 h-4" />
              </button>
            </div>

            <table className="w-full">
              <thead>
                <tr className="border-b border-dark-border">
                  <th className="text-left px-6 py-4 text-xs font-medium text-gray-400 uppercase tracking-wider">
                    任务名称
                  </th>
                  <th className="text-left px-6 py-4 text-xs font-medium text-gray-400 uppercase tracking-wider">
                    目标 URL
                  </th>
                  <th className="text-left px-6 py-4 text-xs font-medium text-gray-400 uppercase tracking-wider">
                    状态 / 进度
                  </th>
                  <th className="text-left px-6 py-4 text-xs font-medium text-gray-400 uppercase tracking-wider">
                    漏洞发现数
                  </th>
                  <th className="text-left px-6 py-4 text-xs font-medium text-gray-400 uppercase tracking-wider">
                    运行时间
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-border">
                {scanTasks.map((task, index) => (
                  <tr
                    key={index}
                    className="hover:bg-dark-hover transition-colors"
                  >
                    <td className="px-6 py-4">
                      <div>
                        <p className="text-sm font-medium text-white">{task.name}</p>
                        <p className="text-xs text-gray-500 font-mono">{task.id}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-gray-300">{task.url}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center space-x-3">
                        <div className={`flex items-center space-x-1 ${task.statusColor}`}>
                          <div
                            className={`w-2 h-2 rounded-full ${
                              task.status === '运行中'
                                ? 'bg-cyan-400 animate-pulse'
                                : task.status === '已完成'
                                ? 'bg-green-400'
                                : 'bg-yellow-400'
                            }`}
                          ></div>
                          <span className="text-sm font-medium">{task.status}</span>
                        </div>
                        {task.progress > 0 && task.progress < 100 && (
                          <div className="w-32">
                            <div className="w-full bg-dark-border rounded-full h-1.5 overflow-hidden">
                              <div
                                className="bg-gradient-to-r from-primary to-cyan-400 h-full transition-all duration-300"
                                style={{ width: `${task.progress}%` }}
                              ></div>
                            </div>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center space-x-2">
                        <span className="text-lg font-bold text-white">
                          {task.findings}
                        </span>
                        {task.findings !== '--' && typeof task.findings === 'number' && task.findings > 10 && (
                          <div className="flex space-x-0.5">
                            {[...Array(7)].map((_, i) => (
                              <div
                                key={i}
                                className={`w-1 ${
                                  i < Math.floor(Number(task.findings) / 5)
                                    ? i % 2 === 0
                                      ? 'bg-primary'
                                      : 'bg-cyan-400'
                                    : 'bg-dark-border'
                                } rounded`}
                                style={{ height: `${16 + i * 2}px` }}
                              ></div>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-gray-400">{task.lastRun}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="p-6 border-t border-dark-border flex items-center justify-between">
              <span className="text-sm text-gray-400">
                显示 1-10 条结果，共 156 条
              </span>
              <div className="flex items-center space-x-2">
                <button className="p-2 text-gray-400 hover:text-white hover:bg-dark-hover rounded transition-colors">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button className="px-3 py-1.5 bg-primary text-white rounded text-sm font-medium">
                  1
                </button>
                <button className="px-3 py-1.5 text-gray-400 hover:text-white hover:bg-dark-hover rounded text-sm transition-colors">
                  2
                </button>
                <button className="px-3 py-1.5 text-gray-400 hover:text-white hover:bg-dark-hover rounded text-sm transition-colors">
                  3
                </button>
                <button className="p-2 text-gray-400 hover:text-white hover:bg-dark-hover rounded transition-colors">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          <button className="fixed bottom-8 left-80 px-6 py-3 bg-gradient-to-r from-primary to-cyan-400 text-white font-medium rounded-lg hover:shadow-lg hover:shadow-primary/25 transition-all flex items-center space-x-2 shadow-xl">
            <Plus className="w-5 h-5" />
            <span>新建扫描任务</span>
          </button>
        </main>
      </div>
    </div>
  );
}
