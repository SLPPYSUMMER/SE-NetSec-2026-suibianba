'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import { reportApi } from '@/services/api';
import { Save, Send, Loader2, AlertCircle } from 'lucide-react';

export default function ReportVulnerabilityPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [duplicateWarn, setDuplicateWarn] = useState('');
  const [formData, setFormData] = useState({
    title: '',
    severity: 'high',
    description: '',
    affected_url: '',
    reproduction_steps: '',
    cve_id: '',
    project_id: 1,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setDuplicateWarn('');
    setLoading(true);
    try {
      await reportApi.create(formData);
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
            {duplicateWarn && (
              <div className="bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 px-4 py-3 rounded-lg text-sm flex items-start space-x-2">
                <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" /><span>{duplicateWarn}</span>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">漏洞标题 *</label>
              <input type="text" placeholder="请输入漏洞标题..." value={formData.title}
                onChange={(e) => update('title', e.target.value)} required
                className="w-full px-4 py-3 bg-dark-bg border border-dark-border rounded-lg text-white placeholder-gray-600 focus:outline-none focus:border-primary transition-colors" />
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">严重程度 *</label>
                <select value={formData.severity} onChange={(e) => update('severity', e.target.value)}
                  className="w-full px-4 py-3 bg-dark-bg border border-dark-border rounded-lg text-white focus:outline-none focus:border-primary cursor-pointer">
                  <option value="critical">极危 (Critical)</option>
                  <option value="high">高危 (High)</option>
                  <option value="medium">中危 (Medium)</option>
                  <option value="low">低危 (Low)</option>
                </select>
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
              <label className="block text-sm font-medium text-gray-300 mb-2">漏洞描述 *</label>
              <textarea rows={5} placeholder="请详细描述漏洞..." value={formData.description}
                onChange={(e) => update('description', e.target.value)} required
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
                className="px-6 py-3 bg-dark-bg border border-dark-border rounded-lg text-gray-300 hover:bg-dark-hover hover:border-gray-600 transition-all">
                取消
              </button>
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
