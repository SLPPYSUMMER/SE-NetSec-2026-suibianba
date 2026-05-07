'use client';

import { useState } from 'react';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import { mockReportChartData } from '@/services/mockData';
import {
  Filter,
  TrendingUp,
  Clock,
  FileText,
  Download,
  Eye,
  CheckSquare,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

export default function ReportsPage() {
  const [selectedProject, setSelectedProject] = useState('all');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [reportOptions, setReportOptions] = useState({
    trend: true,
    analysis: true,
    top10: false,
  });

  return (
    <div className="min-h-screen bg-dark-bg">
      <Sidebar />
      <div className="ml-64">
        <Header />

        <main className="p-6 space-y-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">
                SECURITY / REPORTS
              </p>
              <h1 className="text-3xl font-bold text-white">报告生成</h1>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1 space-y-6">
              <div className="bg-dark-card border border-dark-border rounded-xl p-6">
                <div className="flex items-center space-x-2 mb-4">
                  <Filter className="w-5 h-5 text-primary" />
                  <h3 className="text-lg font-semibold text-white">筛选区域</h3>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      选择项目
                    </label>
                    <select
                      value={selectedProject}
                      onChange={(e) => setSelectedProject(e.target.value)}
                      className="w-full px-4 py-2.5 bg-dark-bg border border-dark-border rounded-lg text-white focus:outline-none focus:border-primary cursor-pointer"
                    >
                      <option value="all">所有安全资产核心组</option>
                      <option value="web">Web应用安全</option>
                      <option value="network">网络安全</option>
                      <option value="system">系统安全</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      日期范围
                    </label>
                    <input
                      type="text"
                      placeholder="2023-10-01 至 2023-10-31"
                      value={`${dateRange.start || '2023-10-01'} 至 ${dateRange.end || '2023-10-31'}`}
                      onChange={(e) => {}}
                      className="w-full px-4 py-2.5 bg-dark-bg border border-dark-border rounded-lg text-white focus:outline-none focus:border-primary"
                    />
                  </div>
                </div>
              </div>

              <div className="bg-dark-card border border-dark-border rounded-xl p-6">
                <div className="flex items-center space-x-2 mb-4">
                  <CheckSquare className="w-5 h-5 text-primary" />
                  <h3 className="text-lg font-semibold text-white">预览配置</h3>
                </div>

                <div className="space-y-3">
                  {[
                    { key: 'trend', label: '漏洞趋势', icon: TrendingUp },
                    { key: 'analysis', label: '修复时长分析', icon: Clock },
                    { key: 'top10', label: 'Top 10 高危资产', icon: FileText },
                  ].map((option) => (
                    <label
                      key={option.key}
                      className="flex items-center justify-between p-3 bg-dark-bg rounded-lg hover:bg-dark-hover transition-colors cursor-pointer group"
                    >
                      <div className="flex items-center space-x-3">
                        <option.icon className="w-5 h-5 text-gray-400 group-hover:text-primary transition-colors" />
                        <span className="text-sm text-gray-300">{option.label}</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={reportOptions[option.key as keyof typeof reportOptions]}
                        onChange={(e) =>
                          setReportOptions({
                            ...reportOptions,
                            [option.key]: e.target.checked,
                          })
                        }
                        className="w-5 h-5 rounded border-dark-border bg-dark-bg text-primary focus:ring-primary focus:ring-offset-0"
                      />
                    </label>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button className="px-4 py-3 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg hover:bg-red-500/20 transition-all flex items-center justify-center space-x-2">
                  <Download className="w-4 h-4" />
                  <span>导出 PDF</span>
                </button>
                <button className="px-4 py-3 bg-dark-bg border border-dark-border text-gray-300 rounded-lg hover:bg-dark-hover transition-all flex items-center justify-center space-x-2">
                  <FileText className="w-4 h-4" />
                  <span>导出 HTML</span>
                </button>
              </div>

              <button className="w-full py-3 bg-gradient-to-r from-primary to-cyan-400 text-white font-medium rounded-lg hover:shadow-lg hover:shadow-primary/25 transition-all flex items-center justify-center space-x-2">
                <Eye className="w-5 h-5" />
                <span>预览报告</span>
              </button>

              <button className="w-full py-3 bg-dark-bg border border-primary/50 text-primary rounded-lg hover:bg-primary/10 transition-all flex items-center justify-center space-x-2">
                <Download className="w-5 h-5" />
                <span>导出实时数据</span>
              </button>
            </div>

            <div className="lg:col-span-2 space-y-6">
              <div className="bg-dark-card border border-dark-border rounded-xl overflow-hidden">
                <div className="p-6 border-b border-dark-border flex items-center space-x-2">
                  <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                  <span className="text-sm font-medium text-gray-300 uppercase tracking-wider">
                    Live Preview Mode
                  </span>
                </div>

                <div className="p-8 space-y-8">
                  <div className="text-center py-8 relative">
                    <div className="absolute inset-0 opacity-10">
                      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 bg-primary rounded-full blur-3xl"></div>
                    </div>
                    <div className="relative z-10">
                      <h2 className="text-4xl font-bold text-white mb-3">
                        安全漏洞月度审计报告
                      </h2>
                      <p className="text-gray-400">
                        资产范围：核心生产集群 | 报告周期：2023/10
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-6">
                    {[
                      { label: '关键监测', value: '12', color: 'border-l-red-500' },
                      { label: '修复中', value: '08', color: 'border-l-yellow-500' },
                      { label: '已完成', value: '154', color: 'border-l-cyan-500' },
                    ].map((stat, index) => (
                      <div
                        key={index}
                        className={`bg-dark-bg rounded-lg p-6 border-l-4 ${stat.color}`}
                      >
                        <p className="text-sm text-gray-400 mb-2">{stat.label}</p>
                        <p className="text-4xl font-bold text-white">{stat.value}</p>
                      </div>
                    ))}
                  </div>

                  <div>
                    <h3 className="text-xl font-semibold text-white mb-4 flex items-center space-x-2">
                      <span className="w-1 h-6 bg-primary rounded"></span>
                      <span>漏洞趋势分析</span>
                    </h3>
                    <div className="bg-dark-bg rounded-lg p-6">
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={mockReportChartData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1e2433" />
                            <XAxis dataKey="name" stroke="#6b7280" fontSize={12} />
                            <YAxis stroke="#6b7280" fontSize={12} />
                            <Tooltip
                              contentStyle={{
                                backgroundColor: '#151922',
                                border: '1px solid #1e2433',
                                borderRadius: '8px',
                              }}
                            />
                            <Bar dataKey="value" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-xl font-semibold text-white mb-4">
                      核心风险摘要
                    </h3>
                    <div className="bg-dark-bg rounded-lg p-6">
                      <p className="text-gray-300 leading-relaxed mb-4">
                        本周期内，检测到的关键风险主要集中在{' '}
                        <span className="text-primary font-medium">Log4j 漏洞</span>{' '}
                        与{' '}
                        <span className="text-primary font-medium">端口令扫描</span>。
                        其中，核心生产集群的受影响比例较上月下降了{' '}
                        <span className="text-green-400 font-medium">12%</span>。
                        建议在接下来的72小时内完成剩余{' '}
                        <span className="text-orange-400 font-medium">8 项高危任务</span>{' '}
                        的补丁部署。
                      </p>
                      <div className="flex items-center justify-end space-x-2 pt-4 border-t border-dark-border">
                        <div className="w-8 h-8 bg-primary/20 rounded-full flex items-center justify-center">
                          <div className="w-2 h-2 bg-primary rounded-full animate-pulse"></div>
                        </div>
                        <span className="text-sm text-gray-400">
                          2 位安全专家正在审阅
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
