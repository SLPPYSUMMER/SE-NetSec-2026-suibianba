'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import { reportApi, teamsApi, SEVERITY_MAP, STATUS_MAP, reportsApi } from '@/services/api';
import { Search, Download, Plus, Eye, ChevronLeft, ChevronRight, Loader2, User, Building, Layers, Trash2 } from 'lucide-react';

export default function VulnerabilitiesPage() {
  const router = useRouter();
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [dataSource, setDataSource] = useState<'all' | 'personal' | 'team'>('all');
  const [userTeams, setUserTeams] = useState<any[]>([]);  // [单团队模式]
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set<string>());  // 选中的漏洞ID
  const [batchDeleting, setBatchDeleting] = useState(false);  // 批量删除状态
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('desc');
  const perPage = 20;

  const fetchReports = async () => {
    setLoading(true);
    setError('');
    try {
      const params: Record<string, string> = { page: String(page), per_page: String(perPage) };
      if (severityFilter !== 'all') params.severity = severityFilter;
      if (statusFilter !== 'all') params.status = statusFilter;
      if (searchTerm) params.search = searchTerm;
      if (sortBy) { params.sort_by = sortBy; params.order = sortOrder; }
      const data = await reportApi.list(params);
      setReports(Array.isArray(data.items) ? data.items : []);
      setTotal(data.total_count || 0);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchReports(); }, [page, severityFilter, statusFilter, sortBy, sortOrder]);

  // [单团队模式] 加载用户的当前团队信息
  useEffect(() => {
    const loadTeam = async () => {
      try {
        const data = await teamsApi.getMyTeam();
        if (data.has_team && data.team) {
          setUserTeams([data.team]);
        } else {
          setUserTeams([]);
        }
      } catch (err) {
        console.error('加载团队信息失败:', err);
        setUserTeams([]);
      }
    };
    loadTeam();
  }, []);

  const sev = (s: string) => SEVERITY_MAP[s] || { label: s, color: 'text-gray-400', bg: 'bg-gray-500' };
  const sta = (s: string) => STATUS_MAP[s] || { label: s, color: 'text-gray-400' };

  // 根据数据来源和团队过滤
  const filteredReports = reports.filter(r => {
    if (dataSource === 'all') return true;
    if (dataSource === 'personal') return r.data_source === 'personal';
    if (dataSource === 'team') {
      // [单团队模式] 直接匹配团队数据源
      return r.data_source === 'team';
    }
    return true;
  });

  const personalCount = reports.filter(r => r.data_source === 'personal').length;
  const teamCount = reports.filter(r => r.data_source === 'team').length;

  // 批量操作功能
  const handleDelete = async (vulnId: string) => {
    if (!confirm('确定要删除此漏洞吗？')) return;
    try {
      await reportsApi.delete(vulnId);
      setSelectedIds(prev => { const next = new Set(prev); next.delete(vulnId); return next; });
      fetchReports();
    } catch (err: any) {
      alert(err.message || '删除失败');
    }
  };

  // 批量删除漏洞
  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) {
      alert('请先选择要删除的漏洞');
      return;
    }
    if (!confirm(`确定要删除选中的 ${selectedIds.size} 个漏洞吗？`)) return;
    setBatchDeleting(true);
    try {
      const result = await reportsApi.batchDelete(Array.from(selectedIds));
      alert(result.message);
      setSelectedIds(new Set());
      fetchReports();
    } catch (err: any) {
      alert(err.message || '批量删除失败');
    } finally {
      setBatchDeleting(false);
    }
  };

  // 切换全选
  const toggleSelectAll = () => {
    if (selectedIds.size === filteredReports.length && filteredReports.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredReports.map(r => r.vuln_id)));
    }
  };

  return (
    <div className="min-h-screen bg-dark-bg">
      <Sidebar />
      <div className="ml-64">
        <Header />

        <main className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-white">漏洞管理</h1>
              <p className="text-sm text-gray-400 mt-1">实时监控、分析与修复全网资产的安全漏洞。</p>
            </div>
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center flex-1 gap-4">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  type="text" placeholder="搜索漏洞编号、标题..." value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && fetchReports()}
                  className="w-full pl-10 pr-4 py-2.5 bg-dark-card border border-dark-border rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-primary transition-colors"
                />
              </div>
              <select value={severityFilter} onChange={(e) => { setSeverityFilter(e.target.value); setPage(1); }}
                className="px-4 py-2.5 bg-dark-card border border-dark-border rounded-lg text-sm text-white focus:outline-none focus:border-primary cursor-pointer">
                <option value="all">所有严重程度</option>
                <option value="critical">极危险</option><option value="high">高危</option>
                <option value="medium">中危</option><option value="low">低危</option>
              </select>
              <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                className="px-4 py-2.5 bg-dark-card border border-dark-border rounded-lg text-sm text-white focus:outline-none focus:border-primary cursor-pointer">
                <option value="all">所有状态</option>
                <option value="pending">待分派</option><option value="processing">处理中</option>
                <option value="fixed">已修复</option><option value="reviewing">已复核</option>
                <option value="closed">已关闭</option>
              </select>
              <select value={sortBy} onChange={(e) => { setSortBy(e.target.value); setPage(1); }}
                className="px-4 py-2.5 bg-dark-card border border-dark-border rounded-lg text-sm text-white focus:outline-none focus:border-primary cursor-pointer">
                <option value="created_at">按创建时间排序</option>
                <option value="severity">按严重程度排序</option>
                <option value="status">按状态排序</option>
              </select>
            </div>
            <div className="flex items-center space-x-2">
              {selectedIds.size > 0 && (
                <button onClick={handleBatchDelete} disabled={batchDeleting}
                  className="px-4 py-2.5 bg-red-500/20 border border-red-500/50 text-red-400 font-medium rounded-lg hover:bg-red-500/30 transition-all flex items-center space-x-2 disabled:opacity-50">
                  <Trash2 className="w-4 h-4" />
                  <span>{batchDeleting ? '删除中...' : `批量删除 (${selectedIds.size})`}</span>
                </button>
              )}
              <button onClick={() => router.push('/vulnerabilities/report')}
                className="px-6 py-2.5 bg-gradient-to-r from-primary to-cyan-400 text-white font-medium rounded-lg hover:shadow-lg hover:shadow-primary/25 transition-all flex items-center space-x-2">
                <Plus className="w-4 h-4" /><span>新建漏洞</span>
              </button>
            </div>
          </div>

          {error && <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg text-sm">{error}</div>}

          <div className="bg-dark-card border border-dark-border rounded-xl overflow-hidden">
            <div className="p-6 border-b border-dark-border flex items-center justify-between">
              <div className="flex items-center space-x-4">
                {/* 数据来源 Tab 切换 */}
                <div className="flex bg-dark-bg rounded-lg p-1 space-x-1">
                  {[
                    { key: 'all', label: `全部 (${total})`, icon: Layers },
                    { key: 'personal', label: `👤 个人 (${personalCount})`, icon: User },
                    { key: 'team', label: `🏢 团队 (${teamCount})`, icon: Building },
                  ].map(tab => (
                    <button
                      key={tab.key}
                      onClick={() => setDataSource(tab.key as any)}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center space-x-1.5 ${
                        dataSource === tab.key
                          ? 'bg-primary text-white shadow-sm'
                          : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      <tab.icon className="w-3.5 h-3.5" />
                      <span>{tab.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <table className="w-full">
              <thead>
                <tr className="border-b border-dark-border">
                  <th className="px-6 py-4">
                    <input type="checkbox" checked={selectedIds.size === filteredReports.length && filteredReports.length > 0}
                      onChange={toggleSelectAll} className="rounded bg-dark-bg border-dark-border accent-primary" />
                  </th>
                  <th className="text-left px-6 py-4 text-xs font-medium text-gray-400 uppercase tracking-wider">漏洞编号</th>
                  <th className="text-left px-6 py-4 text-xs font-medium text-gray-400 uppercase tracking-wider">漏洞标题</th>
                  <th className="text-left px-6 py-4 text-xs font-medium text-gray-400 uppercase tracking-wider">严重程度</th>
                  <th className="text-left px-6 py-4 text-xs font-medium text-gray-400 uppercase tracking-wider">状态</th>
                  <th className="text-left px-6 py-4 text-xs font-medium text-gray-400 uppercase tracking-wider">来源</th>
                  <th className="text-left px-6 py-4 text-xs font-medium text-gray-400 uppercase tracking-wider">负责人</th>
                  <th className="text-left px-6 py-4 text-xs font-medium text-gray-400 uppercase tracking-wider">处理时长</th>
                  <th className="text-left px-6 py-4 text-xs font-medium text-gray-400 uppercase tracking-wider">上报日期</th>
                  <th className="text-right px-6 py-4 text-xs font-medium text-gray-400 uppercase tracking-wider">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-border">
                {loading ? (
                  <tr><td colSpan={10} className="px-6 py-12 text-center"><Loader2 className="w-6 h-6 text-primary animate-spin mx-auto" /></td></tr>
                ) : filteredReports.length === 0 ? (
                  <tr><td colSpan={10} className="px-6 py-12 text-center text-gray-500">暂无漏洞数据</td></tr>
                ) : filteredReports.map((r) => (
                  <tr key={r.vuln_id} className="hover:bg-dark-hover transition-colors group">
                    <td className="px-6 py-4">
                      <input type="checkbox" checked={selectedIds.has(r.vuln_id)}
                        onChange={() => setSelectedIds(prev => {
                          const next = new Set(prev);
                          next.has(r.vuln_id) ? next.delete(r.vuln_id) : next.add(r.vuln_id);
                          return next;
                        })}
                        className="rounded bg-dark-bg border-dark-border accent-primary" />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm font-mono text-primary">{r.vuln_id}</span>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm font-medium text-white truncate max-w-md">{r.title}</p>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium ${sev(r.severity).bg} text-white`}>
                        {sev(r.severity).label}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`text-sm font-medium ${sta(r.status).color}`}>{sta(r.status).label}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                        r.data_source === 'personal'
                          ? 'bg-blue-500/20 text-blue-400'
                          : 'bg-green-500/20 text-green-400'
                      }`}>
                        {r.data_source === 'personal' ? '👤 个人' : `🏢 ${r.source_name || '团队'}`}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-gray-300">{r.assignee_username || '未分派'}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-gray-400">{r.processing_time || '—'}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-gray-400">{r.created_at?.substring(0, 10)}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end space-x-1">
                        <button onClick={() => router.push(`/vulnerabilities/${r.vuln_id}`)}
                          className="p-2 text-gray-400 hover:text-primary hover:bg-primary/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100">
                          <Eye className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDelete(r.vuln_id)}
                          className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
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
              <button onClick={() => setPage(page + 1)} disabled={reports.length < perPage}
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
