'use client';

import { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import { reportApi, teamsApi, SEVERITY_MAP } from '@/services/api';
import { Filter, TrendingUp, Clock, FileText, Download, Eye, CheckSquare, Loader2, User, Building, Layers, Check, ChevronDown } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function ReportsPage() {
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [exportFormat, setExportFormat] = useState('pdf');
  const [loading, setLoading] = useState(false);
  const [exportData, setExportData] = useState<any>(null);
  const [previewMode, setPreviewMode] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [dataSource, setDataSource] = useState<'all' | 'personal' | 'team'>('all');
  const [userTeams, setUserTeams] = useState<any[]>([]);
  const [selectedTeamIds, setSelectedTeamIds] = useState<Set<number>>(new Set());
  const [showTeamDropdown, setShowTeamDropdown] = useState(false);

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

  // 根据数据来源和团队过滤
  const filteredItems = exportData?.items?.filter((item: any) => {
    if (dataSource === 'all') return true;
    if (dataSource === 'personal') return item.data_source === 'personal';
    if (dataSource === 'team') {
      if (selectedTeamIds.size === 0) return item.data_source === 'team';
      return item.team_id && selectedTeamIds.has(item.team_id);
    }
    return true;
  }) || [];

  const personalCount = exportData?.items?.filter((item: any) => item.data_source === 'personal').length || 0;
  const teamCount = exportData?.items?.filter((item: any) => item.data_source === 'team').length || 0;

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
                  {/* 数据来源 Tab 切换（含团队下拉） */}
                  {exportData && (
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">数据来源</label>
                      <div className="flex bg-dark-bg rounded-lg p-1 space-x-1 relative">
                        {[
                          { key: 'all', label: `全部 (${exportData.items?.length || 0})`, icon: Layers },
                          { key: 'personal', label: `👤 个人 (${personalCount})`, icon: User },
                          { key: 'team', label: `🏢 团队 (${teamCount})${selectedTeamIds.size > 0 && selectedTeamIds.size < userTeams.length ? ` ✓${selectedTeamIds.size}` : ''}`, icon: Building, hasDropdown: true },
                        ].map(tab => (
                          <div key={tab.key} className="relative flex-1">
                            <button
                              onClick={() => {
                                if (tab.hasDropdown) {
                                  setShowTeamDropdown(!showTeamDropdown);
                                } else {
                                  setDataSource(tab.key as any);
                                  setShowTeamDropdown(false);
                                }
                              }}
                              className={`w-full px-2 py-1.5 rounded-md text-xs font-medium transition-all flex items-center justify-center space-x-1 ${
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
                                          {team.vuln_count} 漏洞
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
                  )}
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
