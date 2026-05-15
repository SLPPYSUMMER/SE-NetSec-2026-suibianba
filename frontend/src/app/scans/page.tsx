'use client';

import { useState, useEffect, useRef } from 'react';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import { scansApi, teamsApi } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';
import { Search, Plus, Play, Globe, Filter, Upload, ChevronDown, ChevronLeft, ChevronRight, Activity, Loader2, Settings2, ChevronUp, Trash2, XCircle, RotateCw, CheckSquare, User, Building, Layers } from 'lucide-react';

const MODULE_GROUPS: Record<string, string[]> = {
  "端口扫描": ["port_scan", "icmp_scan"],
  "子域名": ["subdomain_scan", "subdomain_takeover_vuln"],
  "Web发现": ["admin_scan", "dir_scan", "http_status_scan", "http_html_title_scan", "http_redirect_scan", "pma_scan", "viewdns_reverse_iplookup_scan"],
  "CVE检测": ["log4j_cve_2021_44228_vuln", "apache_cve_2021_41773_vuln", "apache_cve_2021_42013_vuln", "apache_ofbiz_cve_2024_38856_vuln", "confluence_cve_2023_22515_vuln", "confluence_cve_2023_22527_vuln", "citrix_cve_2019_19781_vuln", "grafana_cve_2021_43798_vuln", "teamcity_cve_2024_27198_vuln", "msexchange_cve_2021_26855_vuln", "forgerock_am_cve_2021_35464_vuln", "f5_cve_2020_5902_vuln"],
  "Web安全": ["clickjacking_vuln", "http_cors_vuln", "http_cookie_vuln", "content_security_policy_vuln", "strict_transport_security_vuln", "x_powered_by_vuln", "x_xss_protection_vuln", "server_version_vuln", "http_options_enabled_vuln"],
  "SSL/TLS": ["ssl_certificate_weak_signature_vuln", "ssl_expired_certificate_vuln", "ssl_expiring_certificate_scan", "ssl_self_signed_certificate_vuln", "ssl_weak_cipher_vuln", "ssl_weak_version_vuln"],
  "信息收集": ["web_technologies_scan", "waf_scan", "drupal_version_scan", "joomla_version_scan", "wordpress_version_scan", "wp_plugin_scan", "wp_theme_scan", "confluence_version_scan"],
  "暴力破解": ["ssh_brute", "ftp_brute", "ftps_brute", "smtp_brute", "telnet_brute", "wp_xmlrpc_bruteforce_vuln"],
};

export default function ScansPage() {
  const { user } = useAuth();
  const [targetUrl, setTargetUrl] = useState('');
  const [scanType, setScanType] = useState('deep');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [threadCount, setThreadCount] = useState(10);
  const [parallelModules, setParallelModules] = useState(5);
  const [hardwareUsage, setHardwareUsage] = useState('high');
  const [selectedModules, setSelectedModules] = useState<Set<string>>(new Set());
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(["端口扫描", "子域名", "Web发现", "SSL/TLS"]));
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [timeoutMinutes, setTimeoutMinutes] = useState(60);
  const [timeoutInputValue, setTimeoutInputValue] = useState('60');
  const [scans, setScans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);  // 后台刷新状态（不显示loading）
  const [dataSource, setDataSource] = useState<'all' | 'personal' | 'team'>('all');
  const [userTeams, setUserTeams] = useState<any[]>([]);  // [单团队模式]
  // 创建任务时的身份选择
  const [createDataSource, setCreateDataSource] = useState<'personal' | 'team'>('team');  // 创建时的身份：个人/团队
  const [createTeamId, setCreateTeamId] = useState<number | null>(null);  // 创建时选择的团队ID
  const perPage = 20;

  const fetchScans = async (showLoading: boolean = true) => {
    if (showLoading) setLoading(true);
    else setRefreshing(true);  // 后台刷新用单独的状态
    
    try {
      const params: Record<string, string | number> = { page, per_page: perPage };
      if (statusFilter) params.status = statusFilter;
      const data = await scansApi.list(params);
      setScans(Array.isArray(data.items) ? data.items : []);
      setTotal(data.total_count || 0);
    } catch {} finally { 
      if (showLoading) setLoading(false);
      else setRefreshing(false);
    }
  };

  useEffect(() => { fetchScans(true); }, [page, statusFilter]);

  // [单团队模式] 加载用户的当前团队信息
  useEffect(() => {
    const loadTeam = async () => {
      try {
        console.log('🔍 [DEBUG] 开始加载团队信息（单团队模式）...');
        const data = await teamsApi.getMyTeam();
        console.log('✅ [DEBUG] API 返回原始数据:', data);

        if (data.has_team && data.team) {
          const teams = [data.team];  // 单团队模式：只有一个团队
          setUserTeams(teams);
          
          // 设置默认创建身份：使用当前团队
          setCreateDataSource('team');
          setCreateTeamId(data.team.id);
          
          console.log('✅ [DEBUG] 团队信息已加载:', data.team.name);
        } else {
          setUserTeams([]);
          // 没有团队，只能选择个人
          setCreateDataSource('personal');
          setCreateTeamId(null);
          console.log('⚠️ [DEBUG] 用户未加入任何团队');
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
      console.log('🔄 [DEBUG] 检测到团队切换:', prevTeamIdRef.current, '→', user?.team_id);
      setDataSource('all');
      setPage(1);
      setSelectedIds(new Set());
      fetchScans(true);
    }
    prevTeamIdRef.current = user?.team_id ?? null;
  }, [user?.team_id]);

  // 轮询活跃任务进度（使用 ref 避免复杂依赖）
  const activeRef = useRef(false);
  
  useEffect(() => {
    const hasActive = scans.some(s => s.status === 'running' || s.status === 'pending');
    
    if (hasActive && !activeRef.current) {
      activeRef.current = true;
      const timer = setInterval(() => fetchScans(false), 3000);  // 后台刷新，不显示loading
      return () => {
        clearInterval(timer);
        activeRef.current = false;
      };
    } else if (!hasActive && activeRef.current) {
      activeRef.current = false;
    }
  }, [scans]);

  // 根据数据来源和团队过滤
  const filteredScans = scans.filter(s => {
    if (dataSource === 'all') return true;
    if (dataSource === 'personal') return s.data_source === 'personal';
    if (dataSource === 'team') {
      // [单团队模式] 直接匹配团队数据源
      return s.data_source === 'team';
    }
    return true;
  });

  const personalCount = scans.filter(s => s.data_source === 'personal').length;
  const teamCount = scans.filter(s => s.data_source === 'team').length;

  const toggleGroup = (group: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      next.has(group) ? next.delete(group) : next.add(group);
      return next;
    });
  };

  const toggleModule = (mod: string) => {
    setSelectedModules(prev => {
      const next = new Set(prev);
      next.has(mod) ? next.delete(mod) : next.add(mod);
      return next;
    });
  };

  const selectGroup = (group: string) => {
    setSelectedModules(prev => {
      const next = new Set(prev);
      (MODULE_GROUPS[group] || []).forEach(m => next.add(m));
      return next;
    });
  };

  const handleCreate = async () => {
    if (!targetUrl) return;
    if (createDataSource === 'team' && !createTeamId) {
      alert('请选择一个团队');
      return;
    }
    setCreating(true);
    try {
      const payload: any = { 
        target: targetUrl, 
        scanner_type: scanType,
        timeout_minutes: timeoutMinutes,  // 使用用户设置的超时时间
        data_source: createDataSource,   // 添加数据来源
      };
      // 如果选择团队身份，添加团队ID
      if (createDataSource === 'team' && createTeamId) {
        payload.team_id = createTeamId;
      }
      if (scanType === 'custom') {
        payload.selected_modules = Array.from(selectedModules).join(',');
        payload.thread_count = threadCount;
        payload.parallel_modules = parallelModules;
        payload.hardware_usage = hardwareUsage;
      }
      if (scanType === 'deep' || scanType === 'quick') {
        payload.thread_count = threadCount;
        payload.parallel_modules = parallelModules;
        payload.hardware_usage = hardwareUsage;
      }
      await scansApi.create(payload);
      setTargetUrl('');
      setShowAdvanced(false);
      fetchScans();
    } catch (err: any) {
      alert(err.message || '创建失败');
    } finally { setCreating(false); }
  };

  const handleDelete = async (id: number) => {
    console.log('🗑️ 删除任务:', id);
    
    if (!confirm(`确定要删除任务 #${id} 吗？此操作不可恢复！`)) {
      console.log('❌ 用户取消删除');
      return;
    }
    
    try {
      console.log('📤 发送删除请求...');
      const response = await scansApi.delete(id);
      console.log('✅ 删除成功:', response);
      
      setSelectedIds(prev => { const next = new Set(prev); next.delete(id); return next; });
      
      alert(`✅ 任务 #${id} 已成功删除`);
      fetchScans();
    } catch (err: any) {
      console.error('❌ 删除失败:', err);
      
      let errorMsg = '删除失败';
      if (err?.message) {
        if (err.message.includes('运行中')) {
          errorMsg = '⚠️ 运行中的任务无法删除！请先点击"取消"按钮停止扫描';
        } else if (err.message.includes('无权')) {
          errorMsg = '❌ 无权删除此任务（只能删除自己创建的任务）';
        } else if (err.message.includes('401') || err.message.includes('登录')) {
          errorMsg = '❌ 登录已过期，请重新登录';
        } else {
          errorMsg = `❌ ${err.message}`;
        }
      }
      
      alert(errorMsg);
    }
  };

  const handleCancel = async (id: number) => {
    if (!confirm('确定要取消此扫描任务吗？')) return;
    try {
      await scansApi.cancel(id);
      fetchScans();
    } catch (err: any) {
      alert(err.message || '取消失败');
    }
  };

  const handleRetry = async (id: number) => {
    if (!confirm('确定要重新运行此任务吗？')) return;
    try {
      await scansApi.retry(id);
      fetchScans();
    } catch (err: any) {
      alert(err.message || '重试失败');
    }
  };

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === scans.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(scans.map(s => s.id)));
    }
  };

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) {
      alert('请先选择要删除的任务');
      return;
    }
    if (!confirm(`确定要删除选中的 ${selectedIds.size} 个任务吗？`)) return;
    
    setBatchDeleting(true);
    try {
      const result = await scansApi.batchDelete(Array.from(selectedIds));
      alert(result.message || `成功删除 ${result.deleted} 个任务`);
      setSelectedIds(new Set());
      fetchScans();
    } catch (err: any) {
      alert(err.message || '批量删除失败');
    } finally {
      setBatchDeleting(false);
    }
  };

  const statusInfo = (s: string) => {
    const map: Record<string, { label: string; color: string; bg: string }> = {
      pending: { label: '排队中', color: 'text-yellow-400', bg: 'bg-yellow-400' },
      running: { label: '运行中', color: 'text-cyan-400', bg: 'bg-cyan-400' },
      finished: { label: '已完成', color: 'text-green-400', bg: 'bg-green-400' },
      failed: { label: '失败', color: 'text-red-400', bg: 'bg-red-400' },
      cancelled: { label: '已取消', color: 'text-gray-400', bg: 'bg-gray-400' },
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
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
              className="px-4 py-2.5 bg-dark-card border border-primary/50 text-primary rounded-lg hover:bg-primary/10 transition-all flex items-center space-x-2 text-sm font-medium disabled:opacity-50">
              {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              <span>{importing ? '导入中...' : '导入外部结果'}</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setImporting(true);
                try {
                  const formData = new FormData();
                  formData.append('file', file);
                  const res = await fetch('/api/scans/import', { method: 'POST', body: formData });
                  const data = await res.json();
                  if (data.success) {
                    alert(`导入完成！成功: ${data.imported}, 跳过重复: ${data.skipped_duplicate}, 错误: ${data.errors}`);
                    fetchScans();
                  } else {
                    alert('导入失败: ' + (data.detail || JSON.stringify(data)));
                  }
                } catch (err: any) {
                  alert('导入失败: ' + (err.message || '网络错误'));
                } finally {
                  setImporting(false);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }
              }}
              className="hidden"
            />
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
              
              {/* 身份选择：个人/团队 */}
              <div>
                <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">创建身份</label>
                <div className="flex space-x-2">
                  <button
                    type="button"
                    onClick={() => { setCreateDataSource('personal'); setCreateTeamId(null); }}
                    className={`flex-1 px-4 py-3 rounded-lg text-sm font-medium transition-all flex items-center justify-center space-x-2 ${
                      createDataSource === 'personal'
                        ? 'bg-blue-500/20 border-blue-500/50 text-blue-400'
                        : 'bg-dark-bg border-dark-border text-gray-400 hover:text-white hover:border-gray-500'
                    } border`}>
                    <User className="w-4 h-4" />
                    <span>个人</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCreateDataSource('team')}
                    className={`flex-1 px-4 py-3 rounded-lg text-sm font-medium transition-all flex items-center justify-center space-x-2 ${
                      createDataSource === 'team'
                        ? 'bg-green-500/20 border-green-500/50 text-green-400'
                        : 'bg-dark-bg border-dark-border text-gray-400 hover:text-white hover:border-gray-500'
                    } border`}>
                    <Building className="w-4 h-4" />
                    <span>团队</span>
                  </button>
                </div>
                
                {/* 团队选择下拉框 */}
                {createDataSource === 'team' && (
                  <div className="mt-2">
                    <select 
                      value={createTeamId || ''} 
                      onChange={(e) => setCreateTeamId(parseInt(e.target.value) || null)}
                      className="w-full px-4 py-3 bg-dark-bg border border-dark-border rounded-lg text-white focus:outline-none focus:border-primary cursor-pointer"
                    >
                      <option value="">-- 选择团队 --</option>
                      {userTeams.filter((t: any) => t.status === 'accepted').map((team: any) => (
                        <option key={team.team_id} value={team.team_id}>
                          {team.team_name} ({team.role_label})
                        </option>
                      ))}
                    </select>
                    {!createTeamId && (
                      <p className="mt-1 text-xs text-yellow-500">请选择一个团队</p>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="mt-4">
              <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">扫描配置模板</label>
                  <select value={scanType} onChange={(e) => { setScanType(e.target.value); if (e.target.value === 'custom') setShowAdvanced(true); }}
                    className="w-full px-4 py-3 bg-dark-bg border border-dark-border rounded-lg text-white focus:outline-none focus:border-primary cursor-pointer">
                    <option value="deep">深度扫描 (Deep)</option>
                    <option value="quick">快速扫描 (Quick)</option>
                    <option value="custom">自定义扫描 (Custom)</option>
                  </select>
            </div>

            {/* 高级配置 */}
            <button onClick={() => setShowAdvanced(!showAdvanced)}
              className="mt-4 flex items-center space-x-2 text-sm text-gray-400 hover:text-primary transition-colors">
              <Settings2 className="w-4 h-4" />
              <span>高级配置</span>
              {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {showAdvanced && (
              <div className="mt-4 p-5 bg-dark-bg rounded-xl border border-dark-border space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
                  <div>
                    <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
                      超时 (分钟) <span className="text-primary font-bold">{timeoutMinutes}</span>
                    </label>
                    <input 
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={timeoutInputValue}
                      onChange={(e) => {
                        const raw = e.target.value;
                        // 允许空字符串或纯数字
                        if (raw === '' || /^\d+$/.test(raw)) {
                          setTimeoutInputValue(raw);
                          const num = parseInt(raw);
                          if (!isNaN(num) && num >= 1 && num <= 999) {
                            setTimeoutMinutes(num);
                          }
                        }
                      }}
                      onBlur={(e) => {
                        const num = parseInt(e.target.value);
                        if (isNaN(num) || num < 1 || num > 999) {
                          setTimeoutInputValue('60');
                          setTimeoutMinutes(60);
                        } else {
                          setTimeoutInputValue(String(num));
                          setTimeoutMinutes(num);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          (e.target as HTMLInputElement).blur();
                        }
                      }}
                      placeholder="例如: 30"
                      className="w-full px-4 py-2.5 bg-dark-card border border-dark-border rounded-lg text-white placeholder-gray-600 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all cursor-text [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <p className="mt-1 text-xs text-gray-500">范围: 1-999 分钟 (建议: quick=5, deep=10, custom=15)</p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
                      线程数 (-t) <span className="text-primary">{threadCount}</span>
                    </label>
                    <input type="range" min={1} max={50} value={threadCount}
                      onChange={(e) => setThreadCount(Number(e.target.value))}
                      className="w-full accent-primary" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
                      并行模块 (-M) <span className="text-primary">{parallelModules}</span>
                    </label>
                    <input type="range" min={1} max={20} value={parallelModules}
                      onChange={(e) => setParallelModules(Number(e.target.value))}
                      className="w-full accent-primary" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">硬件使用级别</label>
                    <select value={hardwareUsage} onChange={(e) => setHardwareUsage(e.target.value)}
                      className="w-full px-4 py-2.5 bg-dark-card border border-dark-border rounded-lg text-white focus:outline-none focus:border-primary cursor-pointer">
                      <option value="low">低 (Low)</option>
                      <option value="normal">正常 (Normal)</option>
                      <option value="high">高 (High)</option>
                      <option value="maximum">最大 (Maximum)</option>
                    </select>
                  </div>
                </div>

                {/* 自定义模块选择 */}
                {scanType === 'custom' && (
                  <div>
                    <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">扫描模块选择</label>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {Object.entries(MODULE_GROUPS).map(([group, modules]) => (
                        <div key={group} className="bg-dark-card border border-dark-border rounded-lg overflow-hidden">
                          <button onClick={() => toggleGroup(group)}
                            className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-dark-hover transition-colors">
                            <span className="text-sm font-medium text-white">{group}</span>
                            <div className="flex items-center space-x-2">
                              <button onClick={(e) => { e.stopPropagation(); selectGroup(group); }}
                                className="text-xs text-primary hover:text-primary/80">全选</button>
                              {expandedGroups.has(group) ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
                            </div>
                          </button>
                          {expandedGroups.has(group) && (
                            <div className="px-4 pb-3 space-y-1.5 max-h-48 overflow-y-auto">
                              {modules.map(mod => (
                                <label key={mod} className="flex items-center space-x-2 cursor-pointer">
                                  <input type="checkbox" checked={selectedModules.has(mod)}
                                    onChange={() => toggleModule(mod)}
                                    className="rounded bg-dark-bg border-dark-border accent-primary" />
                                  <span className="text-xs text-gray-400">{mod}</span>
                                </label>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="mt-4">
              <button onClick={handleCreate} disabled={creating || !targetUrl || (scanType === 'custom' && selectedModules.size === 0)}
                className="px-8 py-3 bg-gradient-to-r from-primary to-cyan-400 text-white font-medium rounded-lg hover:shadow-lg hover:shadow-primary/25 transition-all flex items-center space-x-2 disabled:opacity-50">
                {creating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5" />}
                <span>{creating ? '创建中...' : '立即开始'}</span>
              </button>
            </div>
          </div>

          <div className="bg-dark-card border border-dark-border rounded-xl overflow-hidden">
            <div className="p-6 border-b border-dark-border flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <Filter className="w-5 h-5 text-primary" />
                  <h3 className="text-lg font-semibold text-white">扫描任务列表</h3>
                </div>
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
                {selectedIds.size > 0 && (
                  <button onClick={handleBatchDelete} disabled={batchDeleting}
                    className="px-4 py-2 bg-red-500/20 border border-red-500/50 text-red-400 rounded-lg hover:bg-red-500/30 transition-all flex items-center space-x-2 text-sm font-medium disabled:opacity-50">
                    <Trash2 className="w-4 h-4" />
                    <span>{batchDeleting ? '删除中...' : `批量删除 (${selectedIds.size})`}</span>
                  </button>
                )}
              </div>
              <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                className="px-4 py-2 bg-dark-bg border border-dark-border rounded-lg text-sm text-white focus:outline-none focus:border-primary cursor-pointer">
                <option value="">全部状态</option>
                <option value="pending">排队中</option>
                <option value="running">运行中</option>
                <option value="finished">已完成</option>
                <option value="failed">失败</option>
                <option value="cancelled">已取消</option>
              </select>
            </div>

            <table className="w-full">
              <thead>
                <tr className="border-b border-dark-border">
                  <th className="text-left px-4 py-4 text-xs font-medium text-gray-400 uppercase tracking-wider w-12">
                    <input type="checkbox" checked={selectedIds.size === filteredScans.length && filteredScans.length > 0}
                      onChange={selectAll}
                      className="rounded bg-dark-bg border-dark-border accent-primary" />
                  </th>
                  <th className="text-left px-6 py-4 text-xs font-medium text-gray-400 uppercase tracking-wider">任务ID</th>
                  <th className="text-left px-6 py-4 text-xs font-medium text-gray-400 uppercase tracking-wider">目标 URL</th>
                  <th className="text-left px-6 py-4 text-xs font-medium text-gray-400 uppercase tracking-wider">类型</th>
                  <th className="text-left px-6 py-4 text-xs font-medium text-gray-400 uppercase tracking-wider">状态</th>
                  <th className="text-left px-6 py-4 text-xs font-medium text-gray-400 uppercase tracking-wider">进度</th>
                  <th className="text-left px-6 py-4 text-xs font-medium text-gray-400 uppercase tracking-wider">发现数</th>
                  <th className="text-left px-6 py-4 text-xs font-medium text-gray-400 uppercase tracking-wider">来源</th>
                  <th className="text-left px-6 py-4 text-xs font-medium text-gray-400 uppercase tracking-wider">创建时间</th>
                  <th className="text-left px-6 py-4 text-xs font-medium text-gray-400 uppercase tracking-wider w-48">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-border">
                {loading ? (
                  <tr><td colSpan={10} className="px-6 py-12 text-center"><Loader2 className="w-6 h-6 text-primary animate-spin mx-auto" /></td></tr>
                ) : filteredScans.length === 0 ? (
                  <tr><td colSpan={10} className="px-6 py-12 text-center text-gray-500">暂无扫描任务，请创建新任务</td></tr>
                ) : filteredScans.map((task) => {
                  const si = statusInfo(task.status);
                  const canDelete = task.status !== 'running';
                  const canCancel = task.status === 'running';
                  const canRetry = ['failed', 'cancelled', 'finished'].includes(task.status);
                  
                  return (
                    <tr key={task.id} className={`hover:bg-dark-hover transition-colors ${selectedIds.has(task.id) ? 'bg-primary/5' : ''}`}>
                      <td className="px-4 py-4">
                        <input type="checkbox" checked={selectedIds.has(task.id)}
                          onChange={() => toggleSelect(task.id)}
                          className="rounded bg-dark-bg border-dark-border accent-primary" />
                      </td>
                      <td className="px-6 py-4"><span className="text-sm font-mono text-primary">{task.scan_id || `SC-${task.id}`}</span></td>
                      <td className="px-6 py-4"><span className="text-sm text-gray-300">{task.target}</span></td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          task.scanner_type === 'deep' ? 'bg-purple-500/20 text-purple-400' :
                          task.scanner_type === 'quick' ? 'bg-cyan-500/20 text-cyan-400' :
                          'bg-orange-500/20 text-orange-400'
                        }`}>
                          {task.scanner_type === 'deep' ? '深度' : task.scanner_type === 'quick' ? '快速' : task.scanner_type === 'custom' ? '自定义' : task.scanner_type}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${si.color} bg-opacity-10`} style={{ backgroundColor: `${si.bg}20` }}>
                          {si.label}
                        </span>
                      </td>
                      <td className="px-6 py-4 min-w-[180px]">
                        <div className="flex items-center space-x-3">
                          {task.status === 'running' ? (
                            <>
                              <div className="flex-1 h-2 bg-dark-bg rounded-full overflow-hidden">
                                <div className="h-full bg-gradient-to-r from-primary to-cyan-400 rounded-full transition-all duration-500"
                                  style={{ width: `${task.progress || 0}%` }} />
                              </div>
                              <span className="text-xs text-cyan-400 font-mono whitespace-nowrap">{task.progress || 0}%</span>
                            </>
                          ) : task.status === 'finished' ? (
                            <div className="flex items-center space-x-2">
                              <div className="flex-1 h-2 bg-green-500/30 rounded-full overflow-hidden">
                                <div className="h-full bg-green-500 rounded-full" style={{ width: '100%' }} />
                              </div>
                              <span className="text-xs text-green-400 font-mono">100%</span>
                            </div>
                          ) : task.status === 'failed' || task.status === 'cancelled' ? (
                            <div className="flex items-center space-x-2">
                              <div className="flex-1 h-2 bg-red-500/30 rounded-full overflow-hidden">
                                <div className="h-full bg-red-500 rounded-full" style={{ width: `${task.progress || 0}%` }} />
                              </div>
                              <span className="text-xs text-red-400 font-mono">{task.progress || 0}%</span>
                            </div>
                          ) : (
                            <span className="text-xs text-yellow-400">排队中...</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4"><span className="text-sm font-bold text-white">{task.findings_count ?? '--'}</span></td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                          task.data_source === 'personal'
                            ? 'bg-blue-500/20 text-blue-400'
                            : 'bg-green-500/20 text-green-400'
                        }`}>
                          {task.data_source === 'personal' ? '👤 个人' : `🏢 ${task.source_name || '团队'}`}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap"><span className="text-sm text-gray-400">{task.created_at?.substring(0, 10)}</span></td>
                      <td className="px-6 py-4">
                        <div className="flex items-center space-x-2">
                          {canDelete && (
                            <button onClick={() => handleDelete(task.id)}
                              className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                              title="删除任务">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                          {canCancel && (
                            <button onClick={() => handleCancel(task.id)}
                              className="p-1.5 text-gray-400 hover:text-orange-400 hover:bg-orange-500/10 rounded transition-colors"
                              title="取消扫描">
                              <XCircle className="w-4 h-4" />
                            </button>
                          )}
                          {canRetry && (
                            <button onClick={() => handleRetry(task.id)}
                              className="p-1.5 text-gray-400 hover:text-green-400 hover:bg-green-500/10 rounded transition-colors"
                              title="重新运行">
                              <RotateCw className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
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
