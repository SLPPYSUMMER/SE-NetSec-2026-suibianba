'use client';

import { useState } from 'react';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import { reportApi, SEVERITY_MAP } from '@/services/api';
import { Filter, TrendingUp, Clock, FileText, Download, Eye, CheckSquare, Loader2 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function ReportsPage() {
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [exportFormat, setExportFormat] = useState('pdf');
  const [loading, setLoading] = useState(false);
  const [exportData, setExportData] = useState<any>(null);
  const [previewMode, setPreviewMode] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const handleDownloadFile = async (format: string) => {
    setDownloading(true);
    try {
      const params: Record<string, string> = { format };
      if (selectedStatus !== 'all') params.status = selectedStatus;
      await reportApi.export(params, true);
    } catch (err: any) {
      alert(err.message || '导出失败');
    } finally { setDownloading(false); }
  };

  const handlePreview = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { format: 'json' };
      if (selectedStatus !== 'all') params.status = selectedStatus;
      const data = await reportApi.export(params);
      setExportData(data);
      setPreviewMode(true);
    } catch (err: any) {
      alert(err.message || '预览失败');
    } finally {
      setLoading(false);
    }
  };

  const handleExportJson = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { format: 'json' };
      if (selectedStatus !== 'all') params.status = selectedStatus;
      const data = await reportApi.export(params);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `secguard-report-${new Date().toISOString().substring(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) { alert(err.message || '导出失败'); }
    finally { setLoading(false); }
  };

  const severityChartData = exportData?.items?.length
    ? Object.entries(
        (exportData.items as any[]).reduce((acc: Record<string, number>, item: any) => {
          acc[item.severity] = (acc[item.severity] || 0) + 1;
          return acc;
        }, {})
      ).map(([name, value]) => ({ name, value }))
    : [];

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
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">按状态筛选</label>
                    <select value={selectedStatus} onChange={(e) => setSelectedStatus(e.target.value)}
                      className="w-full px-4 py-2.5 bg-dark-bg border border-dark-border rounded-lg text-white focus:outline-none focus:border-primary cursor-pointer">
                      <option value="all">全部状态</option>
                      <option value="pending">待分派</option><option value="processing">处理中</option>
                      <option value="fixed">已修复</option><option value="reviewing">已复核</option>
                      <option value="closed">已关闭</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="bg-dark-card border border-dark-border rounded-xl p-6">
                <div className="flex items-center space-x-2 mb-4">
                  <CheckSquare className="w-5 h-5 text-primary" />
                  <h3 className="text-lg font-semibold text-white">导出格式</h3>
                </div>
                <div className="space-y-3">
                  <button onClick={() => setExportFormat('pdf')}
                    className={`w-full flex items-center space-x-3 p-3 rounded-lg text-sm transition-all ${
                      exportFormat === 'pdf' ? 'bg-primary/10 border border-primary/50 text-primary' : 'bg-dark-bg text-gray-400 hover:text-white'
                    }`}>
                    <FileText className="w-5 h-5" /><span>HTML 报告 (.html)</span>
                  </button>
                  <button onClick={() => setExportFormat('html')}
                    className={`w-full flex items-center space-x-3 p-3 rounded-lg text-sm transition-all ${
                      exportFormat === 'html' ? 'bg-primary/10 border border-primary/50 text-primary' : 'bg-dark-bg text-gray-400 hover:text-white'
                    }`}>
                    <FileText className="w-5 h-5" /><span>HTML 网页 (.html)</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => handleDownloadFile('html')} disabled={downloading}
                  className="px-4 py-3 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg hover:bg-red-500/20 transition-all flex items-center justify-center space-x-2 disabled:opacity-50">
                  {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}<span>导出文件</span>
                </button>
                <button onClick={handleExportJson} disabled={loading}
                  className="px-4 py-3 bg-dark-bg border border-dark-border text-gray-300 rounded-lg hover:bg-dark-hover transition-all flex items-center justify-center space-x-2 disabled:opacity-50">
                  <Download className="w-4 h-4" /><span>导出 JSON</span>
                </button>
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
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-dark-bg rounded-lg p-6">
                        <p className="text-sm text-gray-400 mb-1">漏洞总数</p>
                        <p className="text-3xl font-bold text-white">{exportData.summary?.total ?? 0}</p>
                      </div>
                      <div className="bg-dark-bg rounded-lg p-6">
                        <p className="text-sm text-gray-400 mb-1">修复率</p>
                        <p className="text-3xl font-bold text-green-400">{exportData.summary?.fix_rate ?? '0%'}</p>
                      </div>
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
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-dark-border">
                            {exportData.items?.slice(0, 10).map((item: any, i: number) => (
                              <tr key={i} className="text-gray-300">
                                <td className="px-4 py-2 font-mono text-primary">{item.vuln_id}</td>
                                <td className="px-4 py-2">{item.title}</td>
                                <td className="px-4 py-2">{SEVERITY_MAP[item.severity]?.label || item.severity}</td>
                                <td className="px-4 py-2">{item.status}</td>
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
