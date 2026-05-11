'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import { reportApi, teamsApi, SEVERITY_MAP, STATUS_MAP } from '@/services/api';
import { Search, Download, Plus, Eye, ChevronLeft, ChevronRight, Loader2, User, Building, Layers, Check, ChevronDown } from 'lucide-react';

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
  const [userTeams, setUserTeams] = useState<any[]>([]);
  const [selectedTeamIds, setSelectedTeamIds] = useState<Set<number>>(new Set());
  const [showTeamDropdown, setShowTeamDropdown] = useState(false);
  const perPage = 20;

  const fetchReports = async () => {
    setLoading(true);
    setError('');
    try {
      const params: Record<string, string> = { page: String(page), per_page: String(perPage) };
      if (severityFilter !== 'all') params.severity = severityFilter;
      if (statusFilter !== 'all') params.status = statusFilter;
      if (searchTerm) params.search = searchTerm;
      const data = await reportApi.list(params);
      setReports(Array.isArray(data.items) ? data.items : []);
      setTotal(data.total_count || 0);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchReports(); }, [page, severityFilter, statusFilter]);

  // 加载用户的团队列表
  useEffect(() => {
    const loadTeams = async () => {
      try {
        const data = await teamsApi.myTeams();
        setUserTeams(data.items || []);
      } catch (err) {
        console.error('加载团队列表失败:', err);
      }
    };
    loadTeams();
  }, []);

  const sev = (s: string) => SEVERITY_MAP[s] || { label: s, color: 'text-gray-400', bg: 'bg-gray-500' };
  const sta = (s: string) => STATUS_MAP[s] || { label: s, color: 'text-gray-400' };

  // 根据数据来源和团队过滤
  const filteredReports = reports.filter(r => {
    if (dataSource === 'all') return true;
    if (dataSource === 'personal') return r.data_source === 'personal';
    if (dataSource === 'team') {
      if (selectedTeamIds.size === 0) return r.data_source === 'team';
      return r.team_id && selectedTeamIds.has(r.team_id);
    }
    return true;
  });

  const personalCount = reports.filter(r => r.data_source === 'personal').length;
  const teamCount = reports.filter(r => r.data_source === 'team').length;

  const toggleTeamSelection = (teamId: number) => {
    setSelectedTeamIds(prev => {
      const next = new Set(prev);
      next.has(teamId) ? next.delete(teamId) : next.add(teamId);
      return next;
    });
  };

  const toggleAllTeams = () => {
    if (selectedTeamIds.size === userTeams.length && userTeams.length > 0) {
      setSelectedTeamIds(new Set());
    } else {
      setSelectedTeamIds(new Set(userTeams.map(t => t.team_id)));
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
            </div>
            <button onClick={() => router.push('/vulnerabilities/report')}
              className="px-6 py-2.5 bg-gradient-to-r from-primary to-cyan-400 text-white font-medium rounded-lg hover:shadow-lg hover:shadow-primary/25 transition-all flex items-center space-x-2">
              <Plus className="w-4 h-4" /><span>新建漏洞</span>
            </button>
          </div>

          {error && <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg text-sm">{error}</div>}

          <div className="bg-dark-card border border-dark-border rounded-xl overflow-hidden">
            <div className="p-6 border-b border-dark-border flex items-center justify-between">
              <div className="flex items-center space-x-4">
                {/* 数据来源 Tab 切换（含团队下拉） */}
                <div className="flex bg-dark-bg rounded-lg p-1 space-x-1 relative">
                  {[
                    { key: 'all', label: `全部 (${total})`, icon: Layers },
                    { key: 'personal', label: `👤 个人 (${personalCount})`, icon: User },
                    { key: 'team', label: `🏢 团队 (${teamCount})${selectedTeamIds.size > 0 && selectedTeamIds.size < userTeams.length ? ` ✓${selectedTeamIds.size}` : ''}`, icon: Building, hasDropdown: true },
                  ].map(tab => (
                    <div key={tab.key} className="relative">
                      <button
                        onClick={() => {
                          if (tab.hasDropdown) {
                            setShowTeamDropdown(!showTeamDropdown);
                          } else {
                            setDataSource(tab.key as any);
                            setShowTeamDropdown(false);
                          }
                        }}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center space-x-1.5 ${
                          dataSource === tab.key
                            ? 'bg-primary text-white shadow-sm'
                            : 'text-gray-400 hover:text-white'
                        }`}
                      >
                        <tab.icon className="w-3.5 h-3.5" />
                        <span>{tab.label}</span>
                        {tab.hasDropdown && userTeams.length > 0 && (
                          <ChevronDown className={`w-3 h-3 transition-transform ${showTeamDropdown ? 'rotate-180' : ''}`} />
                        )}
                      </button>
                      {/* 团队下拉菜单 */}
                      {tab.hasDropdown && showTeamDropdown && dataSource === 'team' && (
                        <div className="absolute top-full left-0 mt-2 w-64 bg-dark-card border border-dark-border rounded-lg shadow-xl z-50 overflow-hidden">
                          <div className="p-3 border-b border-dark-border">
                            <button
                              onClick={toggleAllTeams}
                              className="w-full px-3 py-2 rounded-md text-xs font-medium bg-dark-bg hover:bg-dark-hover transition-all flex items-center justify-between"
                            >
                              <span>{selectedTeamIds.size === userTeams.length && userTeams.length > 0 ? '☑ 取消全选' : '☐ 全选所有团队'}</span>
                              <span className="text-gray-500">{selectedTeamIds.size}/{userTeams.length}</span>
                            </button>
                          </div>
                          <div className="max-h-60 overflow-y-auto p-2 space-y-1">
                            {userTeams.map(team => {
                              const isPending = team.status === 'pending';
                              const isAccepted = team.status === 'accepted';
                              return (
                              <label
                                key={team.team_id}
                                className={`flex items-center space-x-3 px-3 py-2 rounded-md transition-all ${
                                  isPending
                                    ? 'opacity-50 cursor-not-allowed bg-gray-500/5'
                                    : selectedTeamIds.has(team.team_id)
                                      ? 'bg-primary/10 border border-primary/30 cursor-pointer'
                                      : 'hover:bg-dark-hover cursor-pointer'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={selectedTeamIds.has(team.team_id)}
                                  onChange={() => !isPending && toggleTeamSelection(team.team_id)}
                                  disabled={isPending}
                                  className="rounded bg-dark-bg border-dark-border accent-primary disabled:opacity-50"
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center space-x-2">
                                    <Building className={`w-4 h-4 flex-shrink-0 ${isAccepted ? 'text-green-400' : 'text-gray-400'}`} />
                                    <span className={`text-sm font-medium truncate ${isPending ? 'text-gray-400' : 'text-white'}`}>{team.team_name}</span>
                                    {team.is_active && isAccepted && (
                                      <span className="px-1.5 py-0.5 bg-primary/20 text-primary text-xs rounded">当前</span>
                                    )}
                                    {isPending && (
                                      <span className="px-1.5 py-0.5 bg-yellow-500/20 text-yellow-400 text-xs rounded">待审批</span>
                                    )}
                                  </div>
                                  <div className="text-xs text-gray-500 mt-0.5">
                                    {team.vuln_count} 漏洞 · {team.asset_count} 资产
                                    {isPending && ` · ${team.status_label || '等待审核'}`}
                                  </div>
                                </div>
                                {!isPending && selectedTeamIds.has(team.team_id) && (
                                  <Check className="w-4 h-4 text-primary flex-shrink-0" />
                                )}
                              </label>
                              );
                            })}
                          </div>
                          {userTeams.length === 0 && (
                            <div className="p-6 text-center text-gray-500 text-sm">暂未加入任何团队</div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <table className="w-full">
              <thead>
                <tr className="border-b border-dark-border">
                  <th className="text-left px-6 py-4 text-xs font-medium text-gray-400 uppercase tracking-wider">漏洞编号</th>
                  <th className="text-left px-6 py-4 text-xs font-medium text-gray-400 uppercase tracking-wider">漏洞标题</th>
                  <th className="text-left px-6 py-4 text-xs font-medium text-gray-400 uppercase tracking-wider">严重程度</th>
                  <th className="text-left px-6 py-4 text-xs font-medium text-gray-400 uppercase tracking-wider">状态</th>
                  <th className="text-left px-6 py-4 text-xs font-medium text-gray-400 uppercase tracking-wider">来源</th>
                  <th className="text-left px-6 py-4 text-xs font-medium text-gray-400 uppercase tracking-wider">负责人</th>
                  <th className="text-left px-6 py-4 text-xs font-medium text-gray-400 uppercase tracking-wider">上报日期</th>
                  <th className="text-right px-6 py-4 text-xs font-medium text-gray-400 uppercase tracking-wider">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-border">
                {loading ? (
                  <tr><td colSpan={8} className="px-6 py-12 text-center"><Loader2 className="w-6 h-6 text-primary animate-spin mx-auto" /></td></tr>
                ) : filteredReports.length === 0 ? (
                  <tr><td colSpan={8} className="px-6 py-12 text-center text-gray-500">暂无漏洞数据</td></tr>
                ) : filteredReports.map((r) => (
                  <tr key={r.vuln_id} className="hover:bg-dark-hover transition-colors group">
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
                      <span className="text-sm text-gray-400">{r.created_at?.substring(0, 10)}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <button onClick={() => router.push(`/vulnerabilities/${r.vuln_id}`)}
                        className="p-2 text-gray-400 hover:text-primary hover:bg-primary/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100">
                        <Eye className="w-4 h-4" />
                      </button>
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
