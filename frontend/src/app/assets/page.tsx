'use client';

import { useState, useEffect, useRef } from 'react';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import { assetsApi, teamsApi } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';
import { Search, Filter, Plus, Server, Globe, Database, Cloud, Monitor, RefreshCw, AlertTriangle, CheckCircle, XCircle, Clock, Loader2, ChevronDown, ChevronRight, Shield, Wifi, Key, Cpu, User, Building, Layers, Trash2 } from 'lucide-react';

const assetTypes = ['全部', 'host', 'port', 'service', 'subdomain', 'web_tech', 'ssl_cert'];
const typeLabels: Record<string, string> = {
  host: '主机', port: '端口', service: '服务',
  subdomain: '子域名', web_tech: 'Web技术', ssl_cert: 'SSL证书',
  web_app: 'Web应用',
};
const typeColors: Record<string, { color: string; bg: string; icon: any }> = {
  host: { color: 'text-blue-400', bg: 'bg-blue-500/20', icon: Monitor },
  port: { color: 'text-green-400', bg: 'bg-green-500/20', icon: Wifi },
  service: { color: 'text-purple-400', bg: 'bg-purple-500/20', icon: Cpu },
  subdomain: { color: 'text-yellow-400', bg: 'bg-yellow-500/20', icon: Globe },
  web_tech: { color: 'text-cyan-400', bg: 'bg-cyan-500/20', icon: Database },
  ssl_cert: { color: 'text-orange-400', bg: 'bg-orange-500/20', icon: Shield },
  web_app: { color: 'text-blue-400', bg: 'bg-blue-500/20', icon: Globe },
};
const statuses = ['全部', 'online', 'offline', 'unknown'];

export default function AssetsPage() {
  const { user } = useAuth();
  const [assets, setAssets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedType, setSelectedType] = useState('全部');
  const [selectedStatus, setSelectedStatus] = useState('全部');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [dataSource, setDataSource] = useState<'all' | 'personal' | 'team'>('all');
  const [userTeams, setUserTeams] = useState<any[]>([]);  // [单团队模式] 只存储当前唯一团队
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());  // 选中的资产ID
  const [batchDeleting, setBatchDeleting] = useState(false);  // 批量删除状态

  const fetchAssets = async () => {
    setLoading(true);
    try {
      const data = await assetsApi.list();
      setAssets(Array.isArray(data.items) ? data.items : []);
    } catch {} finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAssets(); }, []);

  // [单团队模式] 加载用户的当前团队信息
  useEffect(() => {
    const loadTeam = async () => {
      try {
        const data = await teamsApi.getMyTeam();
        if (data.has_team && data.team) {
          setUserTeams([data.team]);  // 单团队模式下只有一个团队
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

  // 监听团队切换，自动重置数据源过滤状态
  const prevTeamIdRef = useRef<number | null>(null);
  useEffect(() => {
    if (prevTeamIdRef.current !== null && prevTeamIdRef.current !== user?.team_id) {
      console.log('🔄 [DEBUG] 资产页面检测到团队切换:', prevTeamIdRef.current, '→', user?.team_id);
      setDataSource('all');
      setSelectedType('全部');
      setSelectedStatus('全部');
      setSearchQuery('');
      setExpandedRows(new Set());
      fetchAssets();
    }
    prevTeamIdRef.current = user?.team_id ?? null;
  }, [user?.team_id]);

  const toggleExpand = (id: number) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const filteredAssets = assets.filter((asset) => {
    const matchesType = selectedType === '全部' || asset.type === selectedType;
    const matchesStatus = selectedStatus === '全部' || asset.status === selectedStatus;
    const matchesSearch = !searchQuery ||
      asset.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      String(asset.id).includes(searchQuery);
    let matchesDataSource = dataSource === 'all';
    if (dataSource === 'personal') {
      matchesDataSource = asset.data_source === 'personal';
    } else if (dataSource === 'team') {
      // [单团队模式] 直接匹配团队数据源，无需选择具体团队
      matchesDataSource = asset.data_source === 'team';
    }
    return matchesType && matchesStatus && matchesSearch && matchesDataSource;
  });

  const personalCount = assets.filter(a => a.data_source === 'personal').length;
  const teamCount = assets.filter(a => a.data_source === 'team').length;

  // 删除单个资产（按目标URL）
  const handleDelete = async (target: string, synId: number) => {
    if (!confirm('确定要删除此资产吗？')) return;
    try {
      await assetsApi.delete(target);
      setSelectedIds(prev => { const next = new Set(prev); next.delete(synId); return next; });
      fetchAssets();
    } catch (err: any) {
      alert(err.message || '删除失败');
    }
  };

  // 批量删除资产（按目标URL）
  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) {
      alert('请先选择要删除的资产');
      return;
    }
    if (!confirm(`确定要删除选中的 ${selectedIds.size} 个资产吗？`)) return;
    setBatchDeleting(true);
    try {
      const targets = filteredAssets.filter(a => selectedIds.has(a.id)).map(a => a.url);
      const result = await assetsApi.batchDelete(targets);
      alert(result.message);
      setSelectedIds(new Set());
      fetchAssets();
    } catch (err: any) {
      alert(err.message || '批量删除失败');
    } finally {
      setBatchDeleting(false);
    }
  };

  // 切换全选
  const toggleSelectAll = () => {
    if (selectedIds.size === filteredAssets.length && filteredAssets.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredAssets.map(a => a.id)));
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-dark-bg">
        <Sidebar />
        <div className="ml-64"><Header title="资产管理" />
          <div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="w-8 h-8 text-primary animate-spin" /></div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-dark-bg">
      <Sidebar />
      <div className="ml-64">
        <Header title="资产管理" />
        <main className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div className="bg-dark-card rounded-xl p-6 border border-dark-border">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-400 mb-1">总资产数</p>
                  <p className="text-3xl font-bold text-white">{assets.length}</p>
                </div>
                <div className="w-12 h-12 bg-primary/20 rounded-lg flex items-center justify-center">
                  <Server className="w-6 h-6 text-primary" />
                </div>
              </div>
            </div>
            <div className="bg-dark-card rounded-xl p-6 border border-dark-border">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-400 mb-1">在线资产</p>
                  <p className="text-3xl font-bold text-green-400">{assets.filter(a => a.status === 'online').length}</p>
                </div>
                <div className="w-12 h-12 bg-green-500/20 rounded-lg flex items-center justify-center">
                  <CheckCircle className="w-6 h-6 text-green-400" />
                </div>
              </div>
            </div>
            <div className="bg-dark-card rounded-xl p-6 border border-dark-border">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-400 mb-1">存在漏洞</p>
                  <p className="text-3xl font-bold text-yellow-400">{assets.filter(a => a.vulnerabilities > 0).length}</p>
                </div>
                <div className="w-12 h-12 bg-yellow-500/20 rounded-lg flex items-center justify-center">
                  <AlertTriangle className="w-6 h-6 text-yellow-400" />
                </div>
              </div>
            </div>
            <div className="bg-dark-card rounded-xl p-6 border border-dark-border">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-400 mb-1">高危资产</p>
                  <p className="text-3xl font-bold text-red-400">{assets.filter(a => a.criticality === 'high').length}</p>
                </div>
                <div className="w-12 h-12 bg-red-500/20 rounded-lg flex items-center justify-center">
                  <XCircle className="w-6 h-6 text-red-400" />
                </div>
              </div>
            </div>
          </div>

          <div className="bg-dark-card rounded-xl border border-dark-border p-4 mb-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input type="text" placeholder="搜索资产名称或URL..." value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 pr-4 py-2 bg-dark-bg border border-dark-border rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-primary w-80" />
                </div>
                <select value={selectedType} onChange={(e) => setSelectedType(e.target.value)}
                  className="px-4 py-2 bg-dark-bg border border-dark-border rounded-lg text-sm text-white focus:outline-none focus:border-primary">
                  {assetTypes.map((type) => <option key={type} value={type}>{type === '全部' ? '全部类型' : typeLabels[type] || type}</option>)}
                </select>
                <select value={selectedStatus} onChange={(e) => setSelectedStatus(e.target.value)}
                  className="px-4 py-2 bg-dark-bg border border-dark-border rounded-lg text-sm text-white focus:outline-none focus:border-primary">
                  {statuses.map((s) => <option key={s} value={s}>{s === '全部' ? '全部状态' : s === 'online' ? '在线' : s === 'offline' ? '离线' : '未知'}</option>)}
                </select>
              </div>
              <div className="flex items-center space-x-3">
                {selectedIds.size > 0 && (
                  <button onClick={handleBatchDelete} disabled={batchDeleting}
                    className="flex items-center space-x-2 px-4 py-2 bg-red-500/20 border border-red-500/50 text-red-400 rounded-lg hover:bg-red-500/30 transition-all disabled:opacity-50">
                    <Trash2 className="w-4 h-4" />
                    <span className="text-sm">{batchDeleting ? '删除中...' : `批量删除 (${selectedIds.size})`}</span>
                  </button>
                )}
                <button onClick={fetchAssets} className="flex items-center space-x-2 px-4 py-2 bg-dark-hover text-white rounded-lg hover:bg-primary transition-colors">
                  <RefreshCw className="w-4 h-4" /><span className="text-sm">刷新</span>
                </button>
              </div>
            </div>
          </div>

          <div className="bg-dark-card rounded-xl border border-dark-border overflow-hidden">
            <div className="p-6 border-b border-dark-border flex items-center justify-between">
              <div className="flex items-center space-x-4">
                {/* 数据来源 Tab 切换（含团队下拉） */}
                <div className="flex bg-dark-bg rounded-lg p-1 space-x-1">
                  {[
                    { key: 'all', label: `全部 (${assets.length})`, icon: Layers },
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
              <thead className="bg-dark-bg/50">
                <tr>
                  <th className="w-12 px-3 py-4">
                    <input type="checkbox" checked={selectedIds.size === filteredAssets.length && filteredAssets.length > 0}
                      onChange={toggleSelectAll} className="rounded bg-dark-bg border-dark-border accent-primary" />
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">资产信息</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">类型</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">状态</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">来源</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">子资产</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">漏洞数</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">重要性</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">最后扫描</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-border">
                {filteredAssets.length === 0 ? (
                  <tr><td colSpan={10} className="px-6 py-12 text-center text-gray-500">暂无资产数据</td></tr>
                ) : filteredAssets.map((asset) => {
                  const typeInfo = typeColors[asset.type] || typeColors.web_app;
                  const TypeIcon = typeInfo.icon;
                  const isExpanded = expandedRows.has(asset.id);
                  const subAssets = asset.sub_assets || [];
                  const subTypeCounts: Record<string, number> = {};
                  subAssets.forEach((sa: any) => {
                    subTypeCounts[sa.asset_type] = (subTypeCounts[sa.asset_type] || 0) + 1;
                  });

                  return (
                    <>
                      <tr key={asset.id} className="group hover:bg-dark-hover/50 transition-colors cursor-pointer"
                        onClick={() => subAssets.length > 0 && toggleExpand(asset.id)}>
                        <td className="px-3 py-4" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center space-x-2">
                            <input type="checkbox" checked={selectedIds.has(asset.id)}
                              onChange={() => setSelectedIds(prev => {
                                const next = new Set(prev);
                                next.has(asset.id) ? next.delete(asset.id) : next.add(asset.id);
                                return next;
                              })}
                              className="rounded bg-dark-bg border-dark-border accent-primary" />
                            {subAssets.length > 0 && (
                              isExpanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center space-x-3">
                            <div className={`w-10 h-10 ${typeInfo.bg} rounded-lg flex items-center justify-center`}>
                              <TypeIcon className={`w-5 h-5 ${typeInfo.color}`} />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-white truncate max-w-xs">{asset.name}</p>
                              <p className="text-xs text-gray-500">ID: {asset.id}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${typeInfo.bg} ${typeInfo.color}`}>
                            {asset.type_label || typeLabels[asset.type] || 'Web应用'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center space-x-1 ${asset.status === 'online' ? 'text-green-400' : asset.status === 'offline' ? 'text-red-400' : 'text-gray-400'}`}>
                            <span className={`w-2 h-2 rounded-full ${asset.status === 'online' ? 'bg-green-400' : asset.status === 'offline' ? 'bg-red-400' : 'bg-gray-500'}`} />
                            <span className="text-sm">{asset.status === 'online' ? '在线' : asset.status === 'offline' ? '离线' : '未知'}</span>
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                            asset.data_source === 'personal'
                              ? 'bg-blue-500/20 text-blue-400'
                              : 'bg-green-500/20 text-green-400'
                          }`}>
                            {asset.data_source === 'personal' ? '👤 个人' : `🏢 ${asset.source_name || '团队'}`}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          {subAssets.length > 0 ? (
                            <div className="flex items-center space-x-1.5 flex-wrap">
                              {Object.entries(subTypeCounts).slice(0, 4).map(([t, c]) => {
                                const info = typeColors[t];
                                return (
                                  <span key={t} className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs ${info?.bg || 'bg-gray-500/20'} ${info?.color || 'text-gray-400'}`}>
                                    {typeLabels[t] || t}×{c}
                                  </span>
                                );
                              })}
                              {Object.keys(subTypeCounts).length > 4 && (
                                <span className="text-xs text-gray-500">+{Object.keys(subTypeCounts).length - 4}</span>
                              )}
                            </div>
                          ) : <span className="text-xs text-gray-600">--</span>}
                        </td>
                        <td className="px-6 py-4">
                          {asset.vulnerabilities > 0 ? (
                            <span className={`text-sm font-bold ${asset.vulnerabilities >= 10 ? 'text-red-400' : asset.vulnerabilities >= 5 ? 'text-yellow-400' : 'text-green-400'}`}>
                              {asset.vulnerabilities}
                            </span>
                          ) : <span className="text-sm text-gray-500">--</span>}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                            asset.criticality === 'high' ? 'bg-red-500/20 text-red-400 border-red-500/30' :
                            asset.criticality === 'medium' ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' :
                            'bg-green-500/20 text-green-400 border-green-500/30'
                          }`}>
                            {asset.criticality === 'high' ? '高' : asset.criticality === 'medium' ? '中' : '低'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm text-gray-400">{asset.last_scan?.substring(0, 10) || '--'}</span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          <button onClick={() => handleDelete(asset.url, asset.id)}
                            className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                      {/* 展开子资产 */}
                      {isExpanded && subAssets.length > 0 && (
                        <tr key={`${asset.id}-expanded`}>
                          <td colSpan={10} className="px-6 py-4 bg-dark-bg/60">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                              {subAssets.map((sa: any) => {
                                const saInfo = typeColors[sa.asset_type] || typeColors.web_app;
                                const SaIcon = saInfo.icon;
                                return (
                                  <div key={sa.id} className="flex items-center space-x-3 bg-dark-card border border-dark-border rounded-lg px-3 py-2">
                                    <div className={`w-8 h-8 ${saInfo.bg} rounded flex items-center justify-center flex-shrink-0`}>
                                      <SaIcon className={`w-4 h-4 ${saInfo.color}`} />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <p className="text-sm text-white truncate">{sa.name}</p>
                                      <p className="text-xs text-gray-500">{sa.asset_type_label || sa.asset_type}</p>
                                    </div>
                                    <span className={`flex-shrink-0 w-2 h-2 rounded-full ${sa.status === 'online' ? 'bg-green-400' : sa.status === 'offline' ? 'bg-red-400' : 'bg-gray-500'}`} />
                                  </div>
                                );
                              })}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        </main>
      </div>
    </div>
  );
}
