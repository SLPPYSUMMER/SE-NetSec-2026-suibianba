'use client';

import { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import { scansApi } from '@/services/api';
import { Search, Plus, Play, Globe, Filter, Upload, ChevronLeft, ChevronRight, Activity, Loader2, Settings2, ChevronDown, ChevronUp } from 'lucide-react';

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
  const [targetUrl, setTargetUrl] = useState('');
  const [scanType, setScanType] = useState('deep');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [threadCount, setThreadCount] = useState(10);
  const [parallelModules, setParallelModules] = useState(5);
  const [hardwareUsage, setHardwareUsage] = useState('high');
  const [selectedModules, setSelectedModules] = useState<Set<string>>(new Set());
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(["端口扫描", "子域名", "Web发现", "SSL/TLS"]));
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

  // 轮询活跃任务进度
  useEffect(() => {
    const hasActive = scans.some(s => s.status === 'running' || s.status === 'pending');
    if (!hasActive) return;
    const timer = setInterval(fetchScans, 3000);
    return () => clearInterval(timer);
  }, [scans.some(s => s.status === 'running' || s.status === 'pending')]);

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
    setCreating(true);
    try {
      const payload: any = { target: targetUrl, scanner_type: scanType };
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
                  <select value={scanType} onChange={(e) => { setScanType(e.target.value); if (e.target.value === 'custom') setShowAdvanced(true); }}
                    className="w-full px-4 py-3 bg-dark-bg border border-dark-border rounded-lg text-white focus:outline-none focus:border-primary cursor-pointer">
                    <option value="deep">深度扫描 (Deep)</option>
                    <option value="quick">快速扫描 (Quick)</option>
                    <option value="custom">自定义扫描 (Custom)</option>
                  </select>
                </div>
              </div>
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
                      超时 (分钟) <span className="text-gray-600">不杀进程</span>
                    </label>
                    <input type="number" min={10} max={600} value={60}
                      className="w-full px-4 py-2.5 bg-dark-card border border-dark-border rounded-lg text-white focus:outline-none focus:border-primary" />
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
                  <th className="text-left px-6 py-4 text-xs font-medium text-gray-400 uppercase tracking-wider">进度</th>
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
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          task.scanner_type === 'deep' ? 'bg-purple-500/20 text-purple-400' :
                          task.scanner_type === 'quick' ? 'bg-cyan-500/20 text-cyan-400' :
                          'bg-orange-500/20 text-orange-400'
                        }`}>
                          {task.scanner_type === 'deep' ? '深度' : task.scanner_type === 'quick' ? '快速' : task.scanner_type === 'custom' ? '自定义' : task.scanner_type}
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
                          ) : task.status === 'failed' ? (
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
