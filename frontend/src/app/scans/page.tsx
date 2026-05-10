'use client';

import { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import { scansApi } from '@/services/api';
import { Search, Plus, Play, Globe, Filter, Upload, ChevronLeft, ChevronRight, Activity, Loader2 } from 'lucide-react';

export default function ScansPage() {
  const [targetUrl, setTargetUrl] = useState('');
  const [scanType, setScanType] = useState('deep');
  const [scheduleScan, setScheduleScan] = useState(false);
  const [scans, setScans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const perPage = 20;

  const fetchScans = async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page, per_page: perPage };
      if (statusFilter) params.status = statusFilter;
      const data = await scansApi.list(params);
      setScans(Array.isArray(data.items) ? data.items : []);
      setTotal(data.total_count || 0);
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { fetchScans(); }, [page, statusFilter]);

  const handleCreate = async () => {
    if (!targetUrl) return;
    setCreating(true);
    try {
      await scansApi.create({ target: targetUrl, scanner_type: scanType });
      setTargetUrl('');
      fetchScans();
    } catch (err: any) {
      alert(err.message || '创建失败');
    } finally { setCreating(false); }
  };

  const statusInfo = (s: string) => {
    const map: Record<string, { label: string; color: string; bg: string }> = {
      pending: { label: '排队中', color: 'text-yellow-400', bg: 'bg-yellow-400' },
      running: { label: '运行中', color: 'text-cyan-400', bg: 'bg-cyan-400' },
      finished: { label: '已完成', color: 'text-green-400', bg: 'bg-green-400' },
      failed: { label: '失败', color: 'text-red-400', bg: 'bg-red-400' },
    };
    return map[s] || { label: s, color: 'text-gray-400', bg: 'bg-gray-400' };
  };

  const activeCount = scans.filter(s => s.status === 'running').length;

  return (
    <div className="min-h-screen bg-dark-bg">
      <Sidebar />
      <div className="ml-64">
        <Header />
        <main className="p-6 space-y-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold text-white">自动化扫描管理</h1>
              <p className="text-sm text-gray-400 mt-1">实时控制集群扫描任务与资源分配</p>
            </div>
            <button className="px-4 py-2.5 bg-dark-card border border-primary/50 text-primary rounded-lg hover:bg-primary/10 transition-all flex items-center space-x-2 text-sm font-medium">
              <Upload className="w-4 h-4" /><span>导入外部结果</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <div className="bg-dark-card border-l-4 border-l-primary rounded-lg p-6">
              <p className="text-sm text-gray-400 mb-2">当前活跃扫描</p>
              <div className="flex items-baseline space-x-2">
                <span className="text-4xl font-bold text-white">{activeCount}</span>
                <span className="text-sm text-green-400 flex items-center"><Activity className="w-3 h-3 ml-1" /></span>
              </div>
            </div>
            <div className="bg-dark-card border-l-4 border-l-red-500 rounded-lg p-6">
              <p className="text-sm text-gray-400 mb-2">扫描任务总数</p>
              <div className="flex items-baseline space-x-2">
                <span className="text-4xl font-bold text-white">{total}</span>
                <span className="text-sm text-red-400">总任务</span>
              </div>
            </div>
            <div className="bg-dark-card border-l-4 border-l-yellow-500 rounded-lg p-6">
              <p className="text-sm text-gray-400 mb-2">已集成引擎</p>
              <div className="flex flex-wrap gap-2 mt-3">
                <span className="px-3 py-1 bg-dark-bg border border-dark-border rounded text-xs text-gray-300">Nettacker</span>
              </div>
            </div>
          </div>

          <div className="bg-dark-card border border-dark-border rounded-xl p-6">
            <h3 className="text-lg font-semibold text-white mb-4">创建新扫描任务</h3>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2">
                <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">扫描目标 (Target URL)</label>
                <div className="relative">
                  <Globe className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                  <input type="url" placeholder="https://example.com" value={targetUrl}
                    onChange={(e) => setTargetUrl(e.target.value)}
                    className="w-full pl-12 pr-4 py-3 bg-dark-bg border border-dark-border rounded-lg text-white placeholder-gray-600 focus:outline-none focus:border-primary transition-colors" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">扫描配置模板</label>
                  <select value={scanType} onChange={(e) => setScanType(e.target.value)}
                    className="w-full px-4 py-3 bg-dark-bg border border-dark-border rounded-lg text-white focus:outline-none focus:border-primary cursor-pointer">
                    <option value="deep">深度扫描 (Deep)</option>
                    <option value="quick">快速扫描 (Quick)</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="mt-4">
              <button onClick={handleCreate} disabled={creating || !targetUrl}
                className="px-8 py-3 bg-gradient-to-r from-primary to-cyan-400 text-white font-medium rounded-lg hover:shadow-lg hover:shadow-primary/25 transition-all flex items-center space-x-2 disabled:opacity-50">
                {creating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5" />}
                <span>{creating ? '创建中...' : '立即开始'}</span>
              </button>
            </div>
          </div>

          <div className="bg-dark-card border border-dark-border rounded-xl overflow-hidden">
            <div className="p-6 border-b border-dark-border flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Filter className="w-5 h-5 text-primary" />
                <h3 className="text-lg font-semibold text-white">扫描任务列表</h3>
              </div>
              <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                className="px-4 py-2 bg-dark-bg border border-dark-border rounded-lg text-sm text-white focus:outline-none focus:border-primary cursor-pointer">
                <option value="">全部状态</option>
                <option value="pending">排队中</option>
                <option value="running">运行中</option>
                <option value="finished">已完成</option>
                <option value="failed">失败</option>
              </select>
            </div>

            <table className="w-full">
              <thead>
                <tr className="border-b border-dark-border">
                  <th className="text-left px-6 py-4 text-xs font-medium text-gray-400 uppercase tracking-wider">任务ID</th>
                  <th className="text-left px-6 py-4 text-xs font-medium text-gray-400 uppercase tracking-wider">目标 URL</th>
                  <th className="text-left px-6 py-4 text-xs font-medium text-gray-400 uppercase tracking-wider">类型</th>
                  <th className="text-left px-6 py-4 text-xs font-medium text-gray-400 uppercase tracking-wider">状态</th>
                  <th className="text-left px-6 py-4 text-xs font-medium text-gray-400 uppercase tracking-wider">发现数</th>
                  <th className="text-left px-6 py-4 text-xs font-medium text-gray-400 uppercase tracking-wider">创建时间</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-border">
                {loading ? (
                  <tr><td colSpan={6} className="px-6 py-12 text-center"><Loader2 className="w-6 h-6 text-primary animate-spin mx-auto" /></td></tr>
                ) : scans.length === 0 ? (
                  <tr><td colSpan={6} className="px-6 py-12 text-center text-gray-500">暂无扫描任务，请创建新任务</td></tr>
                ) : scans.map((task) => {
                  const si = statusInfo(task.status);
                  return (
                    <tr key={task.id} className="hover:bg-dark-hover transition-colors">
                      <td className="px-6 py-4"><span className="text-sm font-mono text-primary">{task.scan_id || `SC-${task.id}`}</span></td>
                      <td className="px-6 py-4"><span className="text-sm text-gray-300">{task.target}</span></td>
                      <td className="px-6 py-4"><span className="text-sm text-gray-300">{task.scanner_type}</span></td>
                      <td className="px-6 py-4">
                        <div className="flex items-center space-x-2">
                          <div className={`w-2 h-2 rounded-full ${si.bg} ${task.status === 'running' ? 'animate-pulse' : ''}`} />
                          <span className={`text-sm font-medium ${si.color}`}>{si.label}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4"><span className="text-sm font-bold text-white">{task.findings_count || '--'}</span></td>
                      <td className="px-6 py-4 whitespace-nowrap"><span className="text-sm text-gray-400">{task.created_at?.substring(0, 10)}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-400">共 {total} 条记录</span>
            <div className="flex items-center space-x-2">
              <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1}
                className="p-2 text-gray-400 hover:text-white hover:bg-dark-hover rounded transition-colors disabled:opacity-30">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-3 py-1.5 bg-primary text-white rounded text-sm font-medium">{page}</span>
              <button onClick={() => setPage(page + 1)} disabled={scans.length < perPage}
                className="p-2 text-gray-400 hover:text-white hover:bg-dark-hover rounded transition-colors disabled:opacity-30">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
