'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import { statsApi, reportApi, SEVERITY_MAP, STATUS_MAP } from '@/services/api';
import { ShieldCheck, AlertTriangle, CheckCircle, Clock, TrendingUp, ArrowRight, ExternalLink, Plus, Loader2, User, Building } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const PIE_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e'];

export default function DashboardPage() {
  const router = useRouter();
  const [stats, setStats] = useState<any>(null);
  const [recentVulns, setRecentVulns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      try {
        const s = await statsApi.overview().catch(() => null);
        setStats(s);
        const r = await reportApi.list({ page: '1', per_page: '5', sort_by: 'created_at', order: 'desc' }).catch(() => ({ items: [], total_count: 0 }));
        setRecentVulns(Array.isArray(r.items) ? r.items : []);
      } catch {}
      finally { setLoading(false); }
    };
    fetch();
  }, []);

  const sev = (s: string) => SEVERITY_MAP[s] || { label: s, color: 'text-gray-400', bg: 'bg-gray-500' };
  const sta = (s: string) => STATUS_MAP[s] || { label: s, color: 'text-gray-400' };

  const statCards = [
    { title: '漏洞总数', value: stats?.total_reports ?? '--', icon: ShieldCheck, color: 'text-primary', bgColor: 'bg-primary/10' },
    { title: '待处理', value: stats?.pending_count ?? '--', icon: AlertTriangle, color: 'text-red-400', bgColor: 'bg-red-500/10' },
    { title: '已修复', value: stats?.fixed_count ?? '--', icon: CheckCircle, color: 'text-green-400', bgColor: 'bg-green-500/10' },
    { title: '处理中', value: stats?.processing_count ?? '--', icon: Clock, color: 'text-yellow-400', bgColor: 'bg-yellow-500/10' },
    { title: '修复率', value: stats?.fix_rate != null ? `${stats.fix_rate}%` : '--', icon: CheckCircle, color: 'text-blue-400', bgColor: 'bg-blue-500/10' },
  ];

  const severityMap: Record<string, number> = {};
  if (Array.isArray(stats?.severity_distribution)) {
    stats.severity_distribution.forEach((item: any) => { severityMap[item.severity] = item.count; });
  }
  const pieData = Object.keys(SEVERITY_MAP).map((key, i) => ({
    name: SEVERITY_MAP[key].label, value: severityMap[key] || 0, color: PIE_COLORS[i % PIE_COLORS.length],
  }));

  if (loading) return <div className="min-h-screen bg-dark-bg flex items-center justify-center"><Loader2 className="w-8 h-8 text-primary animate-spin" /></div>;

  return (
    <div className="min-h-screen bg-dark-bg">
      <Sidebar />
      <div className="ml-64">
        <Header title="安全概览" />
        <main className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6">
            {statCards.map((s, i) => (
              <div key={i} className="bg-dark-card border border-dark-border rounded-xl p-6 hover:border-primary/50 transition-all">
                <div className="flex items-start justify-between mb-4">
                  <div className={`p-3 rounded-lg ${s.bgColor}`}><s.icon className={`w-6 h-6 ${s.color}`} /></div>
                </div>
                <p className="text-sm text-gray-400 mb-1">{s.title}</p>
                <h3 className="text-3xl font-bold text-white">{s.value}</h3>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-dark-card border border-dark-border rounded-xl p-6">
              <h3 className="text-lg font-semibold text-white mb-6">漏洞等级分布</h3>
              <div className="flex items-center justify-center">
                <div className="relative w-64 h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart><Pie data={pieData} cx="50%" cy="50%" innerRadius={70} outerRadius={100} paddingAngle={5} dataKey="value">
                      {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie></PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex items-center justify-center flex-col">
                    <span className="text-4xl font-bold text-white">{stats?.total_reports ?? 0}</span>
                    <span className="text-sm text-gray-400">漏洞总数</span>
                  </div>
                </div>
                <div className="ml-8 space-y-3">
                  {pieData.map((item, i) => (
                    <div key={i} className="flex items-center space-x-3">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                      <span className="text-sm text-gray-300">{item.name}: {item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-dark-card border border-dark-border rounded-xl p-6">
              <h3 className="text-lg font-semibold text-white mb-6">最近漏洞</h3>
              <div className="space-y-4">
                {recentVulns.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">暂无漏洞数据</p>
                ) : recentVulns.map((v, i) => (
                  <div key={i} className="flex items-center justify-between p-4 bg-dark-bg rounded-lg hover:bg-dark-hover transition-colors group cursor-pointer"
                    onClick={() => router.push(`/vulnerabilities/${v.vuln_id}`)}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-3 mb-1">
                        <span className="text-xs text-gray-500 font-mono">{v.vuln_id}</span>
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${sev(v.severity).bg} text-white`}>{sev(v.severity).label}</span>
                        <span className={`text-xs ${sta(v.status).color}`}>{sta(v.status).label}</span>
                        {/* 数据来源标签 */}
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          v.data_source === 'personal'
                            ? 'bg-blue-500/20 text-blue-400'
                            : 'bg-green-500/20 text-green-400'
                        }`}>
                          {v.data_source === 'personal' ? '👤 个人' : `🏢 ${v.source_name || '团队'}`}
                        </span>
                      </div>
                      <h4 className="text-sm font-medium text-white truncate">{v.title}</h4>
                    </div>
                    <span className="text-xs text-gray-500 ml-4">{v.created_at?.substring(0, 10)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {stats?.monthly_trend && stats.monthly_trend.length > 0 && (
            <div className="bg-dark-card border border-dark-border rounded-xl p-6">
              <h3 className="text-lg font-semibold text-white mb-6">修复趋势（近6个月）</h3>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={stats.monthly_trend.map((m: any) => ({
                  month: m.month,
                  新增: m.pending || 0,
                  已修复: (m.fixed || 0) + (m.closed || 0),
                  处理中: m.processing || 0,
                }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="month" stroke="#94a3b8" fontSize={12} />
                  <YAxis stroke="#94a3b8" fontSize={12} />
                  <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }} />
                  <Area type="monotone" dataKey="新增" stroke="#0ea5e9" fill="#0ea5e9" fillOpacity={0.2} />
                  <Area type="monotone" dataKey="已修复" stroke="#22c55e" fill="#22c55e" fillOpacity={0.2} />
                  <Area type="monotone" dataKey="处理中" stroke="#eab308" fill="#eab308" fillOpacity={0.2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
