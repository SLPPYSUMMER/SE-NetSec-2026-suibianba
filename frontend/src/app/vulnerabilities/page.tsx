'use client';

import { useState } from 'react';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import { mockVulnerabilities } from '@/services/mockData';
import {
  Search,
  Filter,
  Download,
  Plus,
  Eye,
  Share2,
  ChevronLeft,
  ChevronRight,
  MoreVertical,
} from 'lucide-react';

export default function VulnerabilitiesPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  return (
    <div className="min-h-screen bg-dark-bg">
      <Sidebar />
      <div className="ml-64">
        <Header />

        <main className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-white">漏洞管理</h1>
              <p className="text-sm text-gray-400 mt-1">
                实时监控、分析与修复全网资产的安全漏洞。
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center flex-1 gap-4">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  type="text"
                  placeholder="搜索漏洞编号、标题..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-dark-card border border-dark-border rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-primary transition-colors"
                />
              </div>

              <select
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value)}
                className="px-4 py-2.5 bg-dark-card border border-dark-border rounded-lg text-sm text-white focus:outline-none focus:border-primary cursor-pointer"
              >
                <option value="all">所有严重程度</option>
                <option value="critical">极危险</option>
                <option value="high">高危</option>
                <option value="medium">中危</option>
                <option value="low">低危</option>
              </select>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-4 py-2.5 bg-dark-card border border-dark-border rounded-lg text-sm text-white focus:outline-none focus:border-primary cursor-pointer"
              >
                <option value="all">所有状态</option>
                <option value="pending">待分派</option>
                <option value="processing">处理中</option>
                <option value="fixed">已修复</option>
                <option value="closed">已关闭</option>
              </select>
            </div>

            <div className="flex items-center gap-3">
              <button className="px-4 py-2.5 bg-dark-card border border-dark-border rounded-lg text-sm text-gray-300 hover:bg-dark-hover hover:border-primary/50 transition-all flex items-center space-x-2">
                <Download className="w-4 h-4" />
                <span>导出数据</span>
              </button>
              <button className="px-6 py-2.5 bg-gradient-to-r from-primary to-cyan-400 text-white font-medium rounded-lg hover:shadow-lg hover:shadow-primary/25 transition-all flex items-center space-x-2">
                <Plus className="w-4 h-4" />
                <span>新建漏洞</span>
              </button>
            </div>
          </div>

          <div className="bg-dark-card border border-dark-border rounded-xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-dark-border">
                  <th className="text-left px-6 py-4 text-xs font-medium text-gray-400 uppercase tracking-wider">
                    漏洞编号
                  </th>
                  <th className="text-left px-6 py-4 text-xs font-medium text-gray-400 uppercase tracking-wider">
                    漏洞标题
                  </th>
                  <th className="text-left px-6 py-4 text-xs font-medium text-gray-400 uppercase tracking-wider">
                    严重程度
                  </th>
                  <th className="text-left px-6 py-4 text-xs font-medium text-gray-400 uppercase tracking-wider">
                    状态
                  </th>
                  <th className="text-left px-6 py-4 text-xs font-medium text-gray-400 uppercase tracking-wider">
                    负责人
                  </th>
                  <th className="text-left px-6 py-4 text-xs font-medium text-gray-400 uppercase tracking-wider">
                    上报日期
                  </th>
                  <th className="text-right px-6 py-4 text-xs font-medium text-gray-400 uppercase tracking-wider">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-border">
                {mockVulnerabilities.map((vuln, index) => (
                  <tr
                    key={index}
                    className="hover:bg-dark-hover transition-colors group"
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm font-mono text-primary">{vuln.id}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="max-w-md">
                        <p className="text-sm font-medium text-white truncate">
                          {vuln.title}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5 truncate">
                          {vuln.description}
                        </p>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium ${vuln.severityColor} text-white`}
                      >
                        {vuln.severity}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`text-sm font-medium ${vuln.statusColor}`}>
                        {vuln.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center space-x-2">
                        <div className="w-6 h-6 bg-gradient-to-br from-primary to-cyan-600 rounded-full"></div>
                        <span className="text-sm text-gray-300">{vuln.assignee}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-gray-400">{vuln.date}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button className="p-2 text-gray-400 hover:text-primary hover:bg-primary/10 rounded-lg transition-colors">
                          <Eye className="w-4 h-4" />
                        </button>
                        <button className="p-2 text-gray-400 hover:text-primary hover:bg-primary/10 rounded-lg transition-colors">
                          <Share2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between">
            <button className="px-6 py-2.5 bg-dark-card border border-primary/50 text-primary rounded-lg hover:bg-primary/10 transition-colors text-sm font-medium">
              即刻扫描
            </button>

            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-400">共 128 条记录</span>
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-500">每页</span>
                <select className="px-3 py-1.5 bg-dark-card border border-dark-border rounded text-sm text-white focus:outline-none focus:border-primary">
                  <option>10</option>
                  <option>20</option>
                  <option>50</option>
                </select>
                <span className="text-sm text-gray-500">条</span>
              </div>
              <div className="flex items-center space-x-1">
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
                <span className="text-gray-500">...</span>
                <button className="px-3 py-1.5 text-gray-400 hover:text-white hover:bg-dark-hover rounded text-sm transition-colors">
                  13
                </button>
                <button className="p-2 text-gray-400 hover:text-white hover:bg-dark-hover rounded transition-colors">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-500">跳至</span>
                <input
                  type="number"
                  defaultValue="1"
                  className="w-16 px-2 py-1.5 bg-dark-card border border-dark-border rounded text-sm text-white text-center focus:outline-none focus:border-primary"
                />
                <span className="text-sm text-gray-500">页</span>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
