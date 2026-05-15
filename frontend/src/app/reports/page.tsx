'use client';

import { useState, useRef, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import { reportApi, SEVERITY_MAP } from '@/services/api';
import { Filter, Download, Eye, CheckSquare, Loader2, User, Building, Layers, Calendar } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function ReportsPage() {
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedSeverity, setSelectedSeverity] = useState('all');
  const [dateRange, setDateRange] = useState<'7d' | '30d' | 'all' | 'custom'>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [exportFormat, setExportFormat] = useState('pdf');
  const [loading, setLoading] = useState(false);
  const [exportData, setExportData] = useState<any>(null);
  const [previewMode, setPreviewMode] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [dataSource, setDataSource] = useState<'all' | 'personal' | 'team'>('all');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const datePickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (datePickerRef.current && !datePickerRef.current.contains(e.target as Node)) {
        setShowDatePicker(false);
      }
    };
    if (showDatePicker) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showDatePicker]);

  const buildParams = (format: string): Record<string, string> => {
    const params: Record<string, string> = { format };
    if (selectedStatus !== 'all') params.status = selectedStatus;
    if (selectedSeverity !== 'all') params.severity = selectedSeverity;
    if (dateRange === '7d') {
      const d = new Date(); d.setDate(d.getDate() - 7);
      params.date_from = d.toISOString().substring(0, 10);
    } else if (dateRange === '30d') {
      const d = new Date(); d.setDate(d.getDate() - 30);
      params.date_from = d.toISOString().substring(0, 10);
    } else if (dateRange === 'custom') {
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
    }
    return params;
  };

  const handleExport = async (format: string) => {
    setDownloading(true);
    try {
      await reportApi.export(buildParams(format), true);
    } catch (err: any) {
      alert(err.message || '导出失败');
    } finally { setDownloading(false); }
  };

  const handlePreview = async () => {
    setLoading(true);
    try {
      const data = await reportApi.export(buildParams('json'));
      setExportData(data);
      setPreviewMode(true);
    } catch (err: any) {
      alert(err.message || '预览失败');
    } finally { setLoading(false); }
  };

  const severityChartData = exportData?.items?.length
    ? Object.entries(
        (exportData.items as any[]).reduce((acc: Record<string, number>, item: any) => {
          acc[item.severity] = (acc[item.severity] || 0) + 1;
          return acc;
        }, {})
      ).map(([name, value]) => ({ name, value }))
    : [];

  // 根据数据来源和团队过滤
  const filteredItems = exportData?.items?.filter((item: any) => {
    if (dataSource === 'all') return true;
    if (dataSource === 'personal') return item.data_source === 'personal';
    if (dataSource === 'team') {
      // [单团队模式] 直接匹配团队数据源
      return item.data_source === 'team';
    }
    return true;
  }) || [];

  const personalCount = exportData?.items?.filter((item: any) => item.data_source === 'personal').length || 0;
  const teamCount = exportData?.items?.filter((item: any) => item.data_source === 'team').length || 0;

  return (
    <div className="min-h-screen bg-dark-bg">
      <Sidebar />
      <div className="ml-64">
        <Header />
        <main className="p-6 space-y-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">SECURITY / REPORTS</p>
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
                  {/* 数据来源 Tab */}
                  {exportData && (
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">数据来源</label>
                      <div className="flex bg-dark-bg rounded-lg p-1 space-x-1">
                        {[
                          { key: 'all', label: `全部 (${exportData.items?.length || 0})`, icon: Layers },
                          { key: 'personal', label: `个人 (${personalCount})`, icon: User },
                          { key: 'team', label: `团队 (${teamCount})`, icon: Building },
                        ].map(tab => (
                          <button key={tab.key} onClick={() => setDataSource(tab.key as any)}
                            className={`flex-1 px-2 py-1.5 rounded-md text-xs font-medium transition-all flex items-center justify-center space-x-1 ${
                              dataSource === tab.key ? 'bg-primary text-white shadow-sm' : 'text-gray-400 hover:text-white'
                            }`}>
                            <tab.icon className="w-3.5 h-3.5" /><span>{tab.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 时间范围 */}
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">时间范围</label>
                    <div className="flex bg-dark-bg rounded-lg p-1 space-x-1 mb-2">
                      {[
                        { key: '7d', label: '近7天' },
                        { key: '30d', label: '近30天' },
                        { key: 'all', label: '全部' },
                        { key: 'custom', label: '自定义' },
                      ].map(opt => (
                        <button key={opt.key} onClick={() => setDateRange(opt.key as any)}
                          className={`flex-1 px-2 py-1.5 rounded-md text-xs font-medium transition-all ${
                            dateRange === opt.key ? 'bg-primary text-white shadow-sm' : 'text-gray-400 hover:text-white'
                          }`}>{opt.label}</button>
                      ))}
                    </div>
                    {dateRange === 'custom' && (
                      <div className="relative" ref={datePickerRef}>
                        <button onClick={() => setShowDatePicker(!showDatePicker)}
                          className="w-full px-3 py-2 bg-dark-bg border border-dark-border rounded-lg text-sm text-gray-300 hover:border-primary flex items-center space-x-2 transition-colors">
                          <Calendar className="w-4 h-4 text-gray-500" />
                          <span>{dateFrom && dateTo ? `${dateFrom} ~ ${dateTo}` : dateFrom || dateTo || '选择日期范围'}</span>
                        </button>
                        {showDatePicker && (
                          <div className="absolute top-full left-0 mt-2 bg-dark-card border border-dark-border rounded-xl p-4 shadow-2xl z-50 w-72">
                            <div className="space-y-3">
                              <div>
                                <label className="block text-xs text-gray-500 mb-1">开始日期</label>
                                <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                                  className="w-full px-3 py-2 bg-dark-bg border border-dark-border rounded-lg text-sm text-white focus:outline-none focus:border-primary" />
                              </div>
                              <div>
                                <label className="block text-xs text-gray-500 mb-1">结束日期</label>
                                <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
                                  className="w-full px-3 py-2 bg-dark-bg border border-dark-border rounded-lg text-sm text-white focus:outline-none focus:border-primary" />
                              </div>
                              <button onClick={() => setShowDatePicker(false)}
                                className="w-full py-2 bg-primary text-white text-sm rounded-lg hover:bg-primary/80 transition-colors">
                                确定
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* 严重度 + 状态 */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">严重程度</label>
                      <select value={selectedSeverity} onChange={(e) => setSelectedSeverity(e.target.value)}
                        className="w-full px-3 py-2.5 bg-dark-bg border border-dark-border rounded-lg text-white focus:outline-none focus:border-primary cursor-pointer text-sm">
                        <option value="all">全部</option>
                        <option value="critical">极危</option>
                        <option value="high">高危</option>
                        <option value="medium">中危</option>
                        <option value="low">低危</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">状态</label>
                      <select value={selectedStatus} onChange={(e) => setSelectedStatus(e.target.value)}
                        className="w-full px-3 py-2.5 bg-dark-bg border border-dark-border rounded-lg text-white focus:outline-none focus:border-primary cursor-pointer text-sm">
                        <option value="all">全部状态</option>
                        <option value="pending">待分派</option><option value="processing">处理中</option>
                        <option value="fixed">已修复</option><option value="reviewing">已复核</option>
                        <option value="closed">已关闭</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              {/* 导出操作 */}
              <div className="bg-dark-card border border-dark-border rounded-xl p-6">
                <div className="flex items-center space-x-2 mb-4">
                  <CheckSquare className="w-5 h-5 text-primary" />
                  <h3 className="text-lg font-semibold text-white">导出操作</h3>
                </div>
                <div className="space-y-3">
                  <button onClick={() => handleExport('html')} disabled={downloading}
                    className="w-full px-4 py-3 bg-dark-bg border border-dark-border text-gray-300 rounded-lg hover:bg-dark-hover transition-all flex items-center justify-center space-x-2 disabled:opacity-50">
                    {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                    <span>导出 HTML 报告</span>
                  </button>
                  <button onClick={() => handleExport('pdf')} disabled={downloading}
                    className="w-full px-4 py-3 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg hover:bg-red-500/20 transition-all flex items-center justify-center space-x-2 disabled:opacity-50">
                    {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                    <span>导出 PDF 报告</span>
                  </button>
                </div>
              </div>

              <button onClick={handlePreview} disabled={loading}
                className="w-full py-3 bg-gradient-to-r from-primary to-cyan-400 text-white font-medium rounded-lg hover:shadow-lg hover:shadow-primary/25 transition-all flex items-center justify-center space-x-2 disabled:opacity-50">
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Eye className="w-5 h-5" />}<span>预览报告</span>
              </button>
            </div>

            <div className="lg:col-span-2 space-y-6">
              <div className="bg-dark-card border border-dark-border rounded-xl overflow-hidden">
                <div className="p-6 border-b border-dark-border flex items-center space-x-2">
                  <div className={`w-2 h-2 ${previewMode ? 'bg-green-500' : 'bg-red-500'} rounded-full animate-pulse`} />
                  <span className="text-sm font-medium text-gray-300 uppercase tracking-wider">
                    {previewMode ? '预览模式' : '点击预览查看报告'}
                  </span>
                </div>

                {!previewMode ? (
                  <div className="p-8 text-center">
                    <div className="w-20 h-20 bg-dark-hover rounded-full flex items-center justify-center mx-auto mb-4">
                      <Eye className="w-10 h-10 text-gray-500" />
                    </div>
                    <p className="text-gray-400">点击左侧&ldquo;预览报告&rdquo;按钮查看</p>
                  </div>
                ) : exportData ? (
                  <div className="p-8 space-y-8">
                    <div className="text-center">
                      <h2 className="text-4xl font-bold text-white mb-2">安全漏洞审计报告</h2>
                      <p className="text-gray-400">生成时间：{exportData.generated_at?.substring(0, 19).replace('T', ' ')}</p>
                    </div>
                    <div className="grid grid-cols-3 gap-6">
                      {[{ label: '待处理', value: exportData.summary?.pending ?? '--', color: 'border-l-red-500' },
                        { label: '修复中', value: exportData.summary?.processing ?? '--', color: 'border-l-yellow-500' },
                        { label: '已关闭', value: exportData.summary?.closed ?? '--', color: 'border-l-cyan-500' },
                      ].map((s, i) => (
                        <div key={i} className={`bg-dark-bg rounded-lg p-6 border-l-4 ${s.color}`}>
                          <p className="text-sm text-gray-400">{s.label}</p>
                          <p className="text-4xl font-bold text-white">{s.value}</p>
                        </div>
                      ))}
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      {[
                        { label: '漏洞总数', value: exportData.summary?.total ?? 0 },
                        { label: '修复率', value: exportData.summary?.fix_rate ?? '0%', color: 'text-green-400' },
                        { label: '漏洞密度', value: `${exportData.summary?.vuln_density ?? '--'} 条/天` },
                      ].map((s, i) => (
                        <div key={i} className="bg-dark-bg rounded-lg p-6">
                          <p className="text-sm text-gray-400 mb-1">{s.label}</p>
                          <p className={`text-3xl font-bold ${s.color || 'text-white'}`}>{s.value}</p>
                        </div>
                      ))}
                    </div>
                    <div className="grid grid-cols-5 gap-4">
                      {[
                        { label: '平均处理', value: exportData.summary?.avg_processing_days ?? '--' },
                        { label: '超期未关', value: exportData.summary?.stale_count ?? 0, color: 'text-red-400' },
                        { label: '待分派超3天', value: exportData.summary?.stale_pending ?? '--', color: 'text-yellow-400' },
                        { label: '处理中超7天', value: exportData.summary?.stale_processing ?? '--', color: 'text-orange-400' },
                        { label: '高危占比', value: exportData.summary?.high_critical_pct ?? '--' },
                      ].map((s, i) => (
                        <div key={i} className="bg-dark-bg rounded-lg p-4">
                          <p className="text-xs text-gray-400 mb-1">{s.label}</p>
                          <p className={`text-2xl font-bold ${s.color || 'text-white'}`}>{s.value}</p>
                        </div>
                      ))}
                    </div>
                    {severityChartData.length > 0 && (
                      <div className="bg-dark-bg rounded-lg p-6">
                        <h4 className="text-sm font-medium text-gray-400 mb-4">严重程度分布</h4>
                        <div className="h-48">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={severityChartData}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#1e2433" />
                              <XAxis dataKey="name" stroke="#6b7280" fontSize={12} />
                              <YAxis stroke="#6b7280" fontSize={12} />
                              <Tooltip contentStyle={{ backgroundColor: '#151922', border: '1px solid #1e2433', borderRadius: '8px' }} />
                              <Bar dataKey="value" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    )}
                    <div>
                      <h3 className="text-lg font-semibold text-white mb-4">漏洞明细</h3>
                      <div className="bg-dark-bg rounded-lg overflow-hidden">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-dark-border text-left">
                              <th className="px-4 py-3 text-gray-400">编号</th><th className="px-4 py-3 text-gray-400">标题</th>
                              <th className="px-4 py-3 text-gray-400">严重程度</th><th className="px-4 py-3 text-gray-400">状态</th>
                              <th className="px-4 py-3 text-gray-400">来源</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-dark-border">
                            {filteredItems.slice(0, 10).map((item: any, i: number) => (
                              <tr key={i} className="text-gray-300">
                                <td className="px-4 py-2 font-mono text-primary">{item.vuln_id}</td>
                                <td className="px-4 py-2">{item.title}</td>
                                <td className="px-4 py-2">{SEVERITY_MAP[item.severity]?.label || item.severity}</td>
                                <td className="px-4 py-2">{item.status}</td>
                                <td className="px-4 py-2">
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                    item.data_source === 'personal'
                                      ? 'bg-blue-500/20 text-blue-400'
                                      : 'bg-green-500/20 text-green-400'
                                  }`}>
                                    {item.data_source === 'personal' ? '👤 个人' : `🏢 ${item.source_name || '团队'}`}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                    <p className="text-center text-gray-500 text-xs">SecGuard Sentinel — 安全报告</p>
                  </div>
                ) : (
                  <div className="p-8 text-center text-gray-400">
                    <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto mb-4" />加载中...
                  </div>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
