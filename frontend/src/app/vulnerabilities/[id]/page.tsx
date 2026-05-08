'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import { reportApi, SEVERITY_MAP, STATUS_MAP } from '@/services/api';
import { Share2, Bookmark, Clock, AlertTriangle, Shield, FileText, Download, CheckCircle2, User, Calendar, MessageSquare, Loader2 } from 'lucide-react';

export default function VulnerabilityDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [report, setReport] = useState<any>(null);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState('');

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      try {
        const data = await reportApi.get(id);
        setReport(data);
        const logs = await reportApi.auditLogs(id).catch(() => []);
        setAuditLogs(Array.isArray(logs) ? logs : []);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    if (id) fetch();
  }, [id]);

  const handleAction = async (action: string) => {
    setActionLoading(action);
    try {
      if (action === 'assign') await reportApi.assign(id, 1);
      else if (action === 'fix') await reportApi.transition(id, 'submit_fix');
      else if (action === 'review') await reportApi.transition(id, 'confirm_review');
      else if (action === 'close') await reportApi.transition(id, 'close');
      const data = await reportApi.get(id);
      setReport(data);
      const logs = await reportApi.auditLogs(id).catch(() => []);
      setAuditLogs(Array.isArray(logs) ? logs : []);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading('');
    }
  };

  const sev = (s: string) => SEVERITY_MAP[s] || { label: s, color: 'text-gray-400', bg: 'bg-gray-500' };
  const sta = (s: string) => STATUS_MAP[s] || { label: s, color: 'text-gray-400' };

  if (loading) return <div className="min-h-screen bg-dark-bg flex items-center justify-center"><Loader2 className="w-8 h-8 text-primary animate-spin" /></div>;
  if (error || !report) return <div className="min-h-screen bg-dark-bg flex items-center justify-center"><p className="text-red-400">{error || '未找到该漏洞'}</p></div>;

  const statusSteps = [
    { label: '漏洞发现', key: 'pending' },
    { label: '处理中', key: 'processing' },
    { label: '已修复', key: 'fixed' },
    { label: '已复核', key: 'reviewing' },
    { label: '已关闭', key: 'closed' },
  ];
  const currentStepIdx = statusSteps.findIndex(s => s.key === report.status);

  return (
    <div className="min-h-screen bg-dark-bg">
      <Sidebar />
      <div className="ml-64">
        <Header />
        <main className="p-6 space-y-6">
          <div className="flex items-center space-x-3 text-sm text-gray-400">
            <span className="cursor-pointer hover:text-white" onClick={() => router.push('/vulnerabilities')}>漏洞管理</span>
            <span>/</span>
            <span className="text-white">{report.vuln_id}</span>
          </div>

          <div className="bg-dark-card border border-dark-border rounded-xl p-6">
            <div className="flex items-start justify-between mb-6">
              <div className="flex-1">
                <div className="flex items-center space-x-3 mb-3">
                  <span className="px-3 py-1 bg-primary/10 text-primary rounded-full text-xs font-mono font-medium">{report.vuln_id}</span>
                  <span className={`px-3 py-1 ${sev(report.severity).bg}/10 ${sev(report.severity).color} rounded-full text-xs font-bold uppercase flex items-center space-x-1`}>
                    <AlertTriangle className="w-3 h-3" /><span>{sev(report.severity).label}</span>
                  </span>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${sta(report.status).color} bg-dark-bg`}>{sta(report.status).label}</span>
                </div>
                <h1 className="text-3xl font-bold text-white mb-2">{report.title}</h1>
                {report.cve_id && <p className="text-sm text-gray-500 font-mono">CVE: {report.cve_id}</p>}
              </div>
              <button className="px-4 py-2.5 bg-dark-bg border border-dark-border rounded-lg text-sm text-gray-300 hover:bg-dark-hover transition-all flex items-center space-x-2">
                <Bookmark className="w-4 h-4" /><span>导出报告</span>
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-6">
                <div className="bg-dark-bg rounded-lg p-6 border border-dark-border">
                  <div className="flex items-center space-x-2 mb-4">
                    <FileText className="w-5 h-5 text-primary" />
                    <h3 className="text-lg font-semibold text-white">漏洞描述</h3>
                  </div>
                  <p className="text-gray-300 leading-relaxed whitespace-pre-wrap">{report.description || '暂无描述'}</p>
                </div>

                {report.reproduction_steps && (
                  <div className="bg-dark-bg rounded-lg p-6 border border-dark-border">
                    <div className="flex items-center space-x-2 mb-4">
                      <FileText className="w-5 h-5 text-yellow-500" />
                      <h3 className="text-lg font-semibold text-white">复现步骤 (POC)</h3>
                    </div>
                    <pre className="bg-black/50 rounded-lg p-4 overflow-x-auto text-sm">
                      <code className="text-green-400">{report.reproduction_steps}</code>
                    </pre>
                  </div>
                )}

                <div className="bg-dark-bg rounded-lg p-6 border border-dark-border">
                  <h3 className="text-lg font-semibold text-white mb-4">处理轨迹</h3>
                  {auditLogs.length === 0 ? (
                    <p className="text-gray-500 text-sm">暂无处理记录</p>
                  ) : (
                    <div className="space-y-4">
                      {auditLogs.map((log, i) => (
                        <div key={i} className="flex space-x-4">
                          <div className="flex-shrink-0">
                            <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center">
                              <User className="w-5 h-5 text-white" />
                            </div>
                          </div>
                          <div className="flex-1 pb-4 border-l-2 border-dark-border pl-4 -ml-5">
                            <div className="flex items-center space-x-2 mb-1">
                              <span className="text-sm font-medium text-white">{log.user?.username || '系统'}</span>
                            <span className="text-xs text-gray-600 ml-auto">{log.timestamp?.substring(0, 19).replace('T', ' ')}</span>
                            </div>
                            <p className="text-sm text-gray-400">{log.detail || log.action}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-6">
                <div className="bg-dark-bg rounded-lg p-6 border border-dark-border sticky top-24">
                  <h3 className="text-lg font-semibold text-white mb-4">流程状态</h3>
                  <div className="space-y-3">
                    {statusSteps.map((step, i) => (
                      <div key={i} className="flex items-center space-x-3">
                        <div className={`w-3 h-3 rounded-full ${i < currentStepIdx ? 'bg-green-500' : i === currentStepIdx ? 'bg-primary ring-4 ring-primary/20' : 'bg-gray-700'}`} />
                        <span className={`text-sm ${i < currentStepIdx ? 'text-green-400' : i === currentStepIdx ? 'text-white font-medium' : 'text-gray-500'}`}>{step.label}</span>
                      </div>
                    ))}
                  </div>

                  <div className="mt-6 space-y-2">
                    {report.status === 'pending' && (
                      <button onClick={() => handleAction('assign')} disabled={!!actionLoading}
                        className="w-full py-3 bg-gradient-to-r from-primary to-cyan-400 text-white font-medium rounded-lg hover:shadow-lg hover:shadow-primary/25 transition-all disabled:opacity-50">
                        {actionLoading === 'assign' ? '处理中...' : '分派漏洞'}
                      </button>
                    )}
                    {report.status === 'processing' && (
                      <button onClick={() => handleAction('fix')} disabled={!!actionLoading}
                        className="w-full py-3 bg-gradient-to-r from-primary to-cyan-400 text-white font-medium rounded-lg hover:shadow-lg hover:shadow-primary/25 transition-all disabled:opacity-50">
                        {actionLoading === 'fix' ? '处理中...' : '提交修复'}
                      </button>
                    )}
                    {report.status === 'fixed' && (
                      <button onClick={() => handleAction('review')} disabled={!!actionLoading}
                        className="w-full py-3 bg-gradient-to-r from-primary to-cyan-400 text-white font-medium rounded-lg hover:shadow-lg hover:shadow-primary/25 transition-all disabled:opacity-50">
                        {actionLoading === 'review' ? '处理中...' : '确认复核'}
                      </button>
                    )}
                    {report.status === 'reviewing' && (
                      <button onClick={() => handleAction('close')} disabled={!!actionLoading}
                        className="w-full py-3 bg-gradient-to-r from-primary to-cyan-400 text-white font-medium rounded-lg hover:shadow-lg hover:shadow-primary/25 transition-all disabled:opacity-50">
                        {actionLoading === 'close' ? '处理中...' : '关闭漏洞'}
                      </button>
                    )}
                  </div>

                  <div className="mt-6 pt-6 border-t border-dark-border space-y-4">
                    <div>
                      <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">漏洞等级</h4>
                      <span className={`text-2xl font-bold ${sev(report.severity).color}`}>{sev(report.severity).label.toUpperCase()}</span>
                    </div>
                    <div>
                      <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">负责人 / 报告人</h4>
                      <p className="text-sm text-gray-300">{report.assignee?.username || '未分派'}</p>
                      <p className="text-sm text-gray-400">上报人: {report.reporter?.username || '未知'}</p>
                    </div>
                    {report.affected_url && (
                      <div>
                        <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">受影响 URL</h4>
                        <p className="text-sm text-primary break-all">{report.affected_url}</p>
                      </div>
                    )}
                    <div>
                      <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">上报时间</h4>
                      <p className="text-sm text-gray-400">{report.created_at?.substring(0, 19).replace('T', ' ')}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
