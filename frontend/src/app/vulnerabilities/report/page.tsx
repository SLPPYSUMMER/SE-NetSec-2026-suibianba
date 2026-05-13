'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import { reportApi, teamsApi } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';
import { Save, Send, Loader2, AlertCircle, User } from 'lucide-react';

export default function ReportVulnerabilityPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [duplicateWarn, setDuplicateWarn] = useState('');
  const [members, setMembers] = useState<any[]>([]);
  const [formData, setFormData] = useState({
    title: '',
    severity: 'high',
    description: '',
    affected_url: '',
    reproduction_steps: '',
    impact_scope: '',
    cve_id: '',
    project_id: 1,
    assignee_id: 0,
  });

  const { user } = useAuth();
  const isStaff = user?.is_staff;
  const canAssignAnyone = isStaff || user?.role === '管理员' || user?.role === '项目经理';

  const assignableMembers = canAssignAnyone
    ? members
    : members.filter((m: any) => m.user_id === user?.id);

  useEffect(() => {
    teamsApi.members().then(m => setMembers(m.items || [])).catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setDuplicateWarn('');
    if (!formData.title.trim()) { setError('请输入漏洞标题'); return; }
    if (!formData.description.trim()) { setError('请输入漏洞描述'); return; }
    if (formData.description.trim().length < 10) { setError('漏洞描述至少需要10个字符'); return; }

    setLoading(true);
    try {
      const payload = { ...formData };
      if (!payload.assignee_id) delete (payload as any).assignee_id;
      await reportApi.create(payload);
      router.push('/vulnerabilities');
    } catch (err: any) {
      setError(err.message || '提交失败');
    } finally {
      setLoading(false);
    }
  };

  const update = (key: string, value: any) => setFormData({ ...formData, [key]: value });

  return (
    <div className="min-h-screen bg-dark-bg">
      <Sidebar />
      <div className="ml-64">
        <Header />
        <main className="p-6 space-y-6">
          <div>
            <h1 className="text-3xl font-bold text-white">漏洞上报</h1>
            <p className="text-sm text-gray-400 mt-1">提交新的安全漏洞报告</p>
          </div>

          <form onSubmit={handleSubmit} className="max-w-4xl mx-auto bg-dark-card border border-dark-border rounded-xl p-8 space-y-6">
            {error && <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg text-sm">{error}</div>}

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">漏洞标题 *</label>
              <input type="text" placeholder="请输入漏洞标题" value={formData.title}
                onChange={(e) => update('title', e.target.value)}
                className="w-full px-4 py-3 bg-dark-bg border border-dark-border rounded-lg text-white placeholder-gray-600 focus:outline-none focus:border-primary transition-colors" />
            </div>

            <div className="grid grid-cols-3 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">严重程度 *</label>
                <select value={formData.severity} onChange={(e) => update('severity', e.target.value)}
                  className="w-full px-4 py-3 bg-dark-bg border border-dark-border rounded-lg text-white focus:outline-none focus:border-primary cursor-pointer">
                  <option value="critical">极危</option>
                  <option value="high">高危</option>
                  <option value="medium">中危</option>
                  <option value="low">低危</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">指派处理人</label>
                <select value={formData.assignee_id || ''} onChange={(e) => update('assignee_id', parseInt(e.target.value) || 0)}
                  className="w-full px-4 py-3 bg-dark-bg border border-dark-border rounded-lg text-white focus:outline-none focus:border-primary cursor-pointer">
                  <option value="">不指派（待分派）</option>
                  {assignableMembers.map(m => (
                    <option key={m.user_id} value={m.user_id}>{m.username} ({m.role_label})</option>
                  ))}
                </select>
                {assignableMembers.length === 0 && <p className="text-xs text-gray-500 mt-1">暂无团队成员，不指派将进入待分派状态</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">CVE 编号</label>
                <input type="text" placeholder="CVE-2024-XXXX" value={formData.cve_id}
                  onChange={(e) => update('cve_id', e.target.value)}
                  className="w-full px-4 py-3 bg-dark-bg border border-dark-border rounded-lg text-white placeholder-gray-600 focus:outline-none focus:border-primary transition-colors" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">受影响 URL</label>
              <input type="url" placeholder="https://example.com/vulnerable-endpoint" value={formData.affected_url}
                onChange={(e) => update('affected_url', e.target.value)}
                className="w-full px-4 py-3 bg-dark-bg border border-dark-border rounded-lg text-white placeholder-gray-600 focus:outline-none focus:border-primary transition-colors" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">漏洞描述 *（至少10个字符）</label>
              <textarea rows={5} placeholder="请详细描述漏洞..." value={formData.description}
                onChange={(e) => update('description', e.target.value)}
                className="w-full px-4 py-3 bg-dark-bg border border-dark-border rounded-lg text-white placeholder-gray-600 focus:outline-none focus:border-primary transition-colors resize-none" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">影响范围 *</label>
              <textarea rows={3} placeholder="请描述漏洞的影响范围，如受影响系统、用户数量等..." value={formData.impact_scope}
                onChange={(e) => update('impact_scope', e.target.value)}
                className="w-full px-4 py-3 bg-dark-bg border border-dark-border rounded-lg text-white placeholder-gray-600 focus:outline-none focus:border-primary transition-colors resize-none" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">复现步骤</label>
              <textarea rows={4} placeholder="请描述漏洞复现步骤..." value={formData.reproduction_steps}
                onChange={(e) => update('reproduction_steps', e.target.value)}
                className="w-full px-4 py-3 bg-dark-bg border border-dark-border rounded-lg text-white placeholder-gray-600 focus:outline-none focus:border-primary transition-colors resize-none" />
            </div>

            <div className="flex items-center justify-between pt-6 border-t border-dark-border">
              <button type="button" onClick={() => router.push('/vulnerabilities')}
                className="px-6 py-3 bg-dark-bg border border-dark-border rounded-lg text-gray-300 hover:bg-dark-hover hover:border-gray-600 transition-all">取消</button>
              <button type="submit" disabled={loading}
                className="px-8 py-3 bg-gradient-to-r from-primary to-cyan-400 text-white font-semibold rounded-lg hover:shadow-lg hover:shadow-primary/25 transition-all flex items-center space-x-2 disabled:opacity-50">
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                <span>提交漏洞报告</span>
              </button>
            </div>
          </form>
        </main>
      </div>
    </div>
  );
}
