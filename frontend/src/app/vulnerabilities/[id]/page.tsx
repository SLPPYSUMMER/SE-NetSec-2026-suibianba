'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import { reportApi, teamsApi, attachmentApi, SEVERITY_MAP, STATUS_MAP } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';
import { AlertTriangle, FileText, User, Loader2, CheckCircle2, XCircle, Paperclip, Upload, Download, Trash2, File, FileCode } from 'lucide-react';

export default function VulnerabilityDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { user } = useAuth();
  const [report, setReport] = useState<any>(null);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState('');
  const [members, setMembers] = useState<any[]>([]);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedAssignee, setSelectedAssignee] = useState(0);
  const [showCommentModal, setShowCommentModal] = useState(false);
  const [pendingAction, setPendingAction] = useState('');
  const [commentText, setCommentText] = useState('');
  const [attachments, setAttachments] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const isStaff = user?.is_staff;
  const role = user?.role;
  const userId = user?.id;
  const isAssignee = report?.assignee?.id === userId;
  const isReporter = report?.reporter?.id === userId;
  const isTeamAdmin = role === '管理员';
  const isSecurityLead = role === '项目经理';
  const isDeveloper = role === '开发人员';
  const isObserver = role === '安全测试员';
  const hasTeam = !!(user?.team_id);
  const canManage = isStaff || isTeamAdmin || isSecurityLead || (!hasTeam && isReporter);
  const canAssign = isStaff || isTeamAdmin || isSecurityLead;
  const canFix = isStaff || (isAssignee && !isObserver) || (isDeveloper && isAssignee);
  const canReview = isStaff || isTeamAdmin || isSecurityLead || isReporter;
  const canClose = isStaff || isTeamAdmin || isSecurityLead || (!hasTeam && isReporter);

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      try {
        const data = await reportApi.get(id);
        setReport(data);
        const logs = await reportApi.auditLogs(id).catch(() => []);
        setAuditLogs(Array.isArray(logs) ? logs : []);
        const m = await teamsApi.members().catch(() => ({ items: [] }));
        setMembers(m.items || []);
        const a = await attachmentApi.list(id).catch(() => []);
        setAttachments(Array.isArray(a) ? a : []);
      } catch (err: any) { setError(err.message); }
      finally { setLoading(false); }
    };
    if (id) fetch();
  }, [id]);

  const handleAction = async (action: string) => {
    if (action === 'fix' || action === 'review_fail' || action === 'reopen') {
      setPendingAction(action);
      setCommentText('');
      setShowCommentModal(true);
      return;
    }
    await executeAction(action, '');
  };

  const executeAction = async (action: string, comment: string) => {
    setActionLoading(action);
    try {
      if (action === 'fix') await reportApi.transition(id, 'submit_fix', comment || undefined);
      else if (action === 'review') await reportApi.transition(id, 'confirm_review', comment || undefined);
      else if (action === 'review_fail') await reportApi.transition(id, 'review_fail', comment || undefined);
      else if (action === 'close') await reportApi.transition(id, 'close', comment || undefined);
      else if (action === 'reopen') await reportApi.transition(id, 'reopen', comment || undefined);
      const data = await reportApi.get(id);
      setReport(data);
      const logs = await reportApi.auditLogs(id).catch(() => []);
      setAuditLogs(Array.isArray(logs) ? logs : []);
      setShowCommentModal(false);
      setCommentText('');
    } catch (err: any) { alert(err.message); }
    finally { setActionLoading(''); }
  };

  const handleCommentSubmit = async () => {
    if (pendingAction === 'reopen' && !commentText.trim()) {
      alert('重新打开漏洞必须填写原因说明');
      return;
    }
    await executeAction(pendingAction, commentText);
  };

  const handleAssign = async () => {
    if (!selectedAssignee) { alert('请选择处理人'); return; }
    setActionLoading('assign');
    try {
      await reportApi.assign(id, selectedAssignee);
      const data = await reportApi.get(id);
      setReport(data);
      const logs = await reportApi.auditLogs(id).catch(() => []);
      setAuditLogs(Array.isArray(logs) ? logs : []);
      setShowAssignModal(false);
    } catch (err: any) { alert(err.message); }
    finally { setActionLoading(''); }
  };

  const refreshAttachments = async () => {
    const a = await attachmentApi.list(id).catch(() => []);
    setAttachments(Array.isArray(a) ? a : []);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setSelectedFile(file);
    e.target.value = '';
  };

  const handleUploadClick = async () => {
    if (!selectedFile) return;
    setUploading(true);
    try {
      await attachmentApi.upload(id, selectedFile);
      await refreshAttachments();
      setSelectedFile(null);
    } catch (err: any) {
      alert(err.message || '上传失败');
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteAttachment = async (attachmentId: number) => {
    if (!confirm('确定要删除此附件吗？')) return;
    try {
      await attachmentApi.delete(attachmentId);
      await refreshAttachments();
    } catch (err: any) {
      alert(err.message || '删除失败');
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileIcon = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif'].includes(ext || '')) return <FileText className="w-4 h-4 text-green-400" />;
    if (['py', 'js', 'sh', 'txt', 'diff', 'patch'].includes(ext || '')) return <FileCode className="w-4 h-4 text-yellow-400" />;
    if (['zip', 'tar', 'gz'].includes(ext || '')) return <File className="w-4 h-4 text-blue-400" />;
    if (ext === 'pdf') return <FileText className="w-4 h-4 text-red-400" />;
    return <Paperclip className="w-4 h-4 text-gray-400" />;
  };

  const sev = (s: string) => SEVERITY_MAP[s] || { label: s, color: 'text-gray-400', bg: 'bg-gray-500' };
  const sta = (s: string) => STATUS_MAP[s] || { label: s, color: 'text-gray-400' };

  if (loading) return <div className="min-h-screen bg-dark-bg flex items-center justify-center"><Loader2 className="w-8 h-8 text-primary animate-spin" /></div>;
  if (error || !report) return <div className="min-h-screen bg-dark-bg flex items-center justify-center"><p className="text-red-400">{error || '未找到该漏洞'}</p></div>;

  const statusSteps = [
    { label: '漏洞发现', key: 'pending', desc: '待分派给处理人' },
    { label: '处理中', key: 'processing', desc: '处理人: ' + (report.assignee?.username || '—') },
    { label: '已修复', key: 'fixed', desc: '等待复核' },
    { label: '已复核', key: 'reviewing', desc: '复审通过' },
    { label: '已关闭', key: 'closed', desc: '' },
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
                  <span className="px-3 py-1 bg-primary/10 text-primary rounded-full text-xs font-mono">{report.vuln_id}</span>
                  <span className={`px-3 py-1 ${sev(report.severity).bg}/10 ${sev(report.severity).color} rounded-full text-xs font-bold flex items-center space-x-1`}>
                    <AlertTriangle className="w-3 h-3" /><span>{sev(report.severity).label}</span>
                  </span>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${sta(report.status).color} bg-dark-bg`}>{sta(report.status).label}</span>
                </div>
                <h1 className="text-3xl font-bold text-white mb-2">{report.title}</h1>
                {report.cve_id && <p className="text-sm text-gray-500 font-mono">CVE: {report.cve_id}</p>}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-6">
                <div className="bg-dark-bg rounded-lg p-6 border border-dark-border">
                  <div className="flex items-center space-x-2 mb-4"><FileText className="w-5 h-5 text-primary" /><h3 className="text-lg font-semibold text-white">漏洞描述</h3></div>
                  <p className="text-gray-300 leading-relaxed whitespace-pre-wrap">{report.description || '暂无描述'}</p>
                </div>
                {report.reproduction_steps && (
                  <div className="bg-dark-bg rounded-lg p-6 border border-dark-border">
                    <div className="flex items-center space-x-2 mb-4"><FileText className="w-5 h-5 text-yellow-500" /><h3 className="text-lg font-semibold text-white">复现步骤</h3></div>
                    <pre className="bg-black/50 rounded-lg p-4 overflow-x-auto text-sm"><code className="text-green-400">{report.reproduction_steps}</code></pre>
                  </div>
                )}
                <div className="bg-dark-bg rounded-lg p-6 border border-dark-border">
                  <h3 className="text-lg font-semibold text-white mb-4">处理轨迹</h3>
                  {auditLogs.length === 0 ? <p className="text-gray-500 text-sm">暂无处理记录</p> : (
                    <div className="space-y-3">
                      {auditLogs.map((log, i) => (
                        <div key={i} className="flex space-x-3 pb-3 border-b border-dark-border last:border-0">
                          <div className="w-8 h-8 bg-dark-hover rounded-full flex items-center justify-center flex-shrink-0"><User className="w-4 h-4 text-gray-400" /></div>
                          <div>
                            <div className="flex items-center space-x-2"><span className="text-sm font-medium text-white">{log.user?.username || '系统'}</span><span className="text-xs text-gray-600">{log.timestamp?.substring(0, 19).replace('T', ' ')}</span></div>
                            <p className="text-sm text-gray-400">{log.detail || log.action}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-6">
                <div className="bg-dark-bg rounded-lg p-6 border border-dark-border">
                  <h3 className="text-lg font-semibold text-white mb-4">流程状态</h3>
                  <div className="space-y-3">
                    {statusSteps.map((step, i) => (
                      <div key={i} className="flex items-center space-x-3">
                        <div className={`w-3 h-3 rounded-full ${i < currentStepIdx ? 'bg-green-500' : i === currentStepIdx ? 'bg-primary ring-4 ring-primary/20' : 'bg-gray-700'}`} />
                        <div><span className={`text-sm ${i < currentStepIdx ? 'text-green-400' : i === currentStepIdx ? 'text-white font-medium' : 'text-gray-500'}`}>{step.label}</span>
                        {step.desc && <p className="text-xs text-gray-600">{step.desc}</p>}</div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-6 space-y-2">
                    {report.status === 'pending' && canAssign && (
                      <button onClick={() => setShowAssignModal(true)} disabled={!!actionLoading}
                        className="w-full py-3 bg-primary text-white font-medium rounded-lg hover:bg-primary/80 disabled:opacity-50">
                        分派漏洞给处理人
                      </button>
                    )}
                    {report.status === 'processing' && canFix && (
                      <button onClick={() => handleAction('fix')} disabled={!!actionLoading}
                        className="w-full py-3 bg-green-600 text-white font-medium rounded-lg hover:bg-green-500 disabled:opacity-50">
                        {actionLoading === 'fix' ? '处理中...' : '提交修复'}
                      </button>
                    )}
                    {report.status === 'fixed' && canReview && (
                      <>
                        <button onClick={() => handleAction('review')} disabled={!!actionLoading}
                          className="w-full py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-500 disabled:opacity-50">
                          {actionLoading === 'review' ? '处理中...' : '确认复核通过'}
                        </button>
                        <button onClick={() => handleAction('review_fail')} disabled={!!actionLoading}
                          className="w-full py-3 bg-red-600/80 text-white font-medium rounded-lg hover:bg-red-500 disabled:opacity-50">
                          {actionLoading === 'review_fail' ? '处理中...' : '复核不通过'}
                        </button>
                      </>
                    )}
                    {report.status === 'reviewing' && canClose && (
                      <button onClick={() => handleAction('close')} disabled={!!actionLoading}
                        className="w-full py-3 bg-gray-600 text-white font-medium rounded-lg hover:bg-gray-500 disabled:opacity-50">
                        {actionLoading === 'close' ? '处理中...' : '关闭漏洞'}
                      </button>
                    )}
                    {(report.status === 'closed' || report.status === 'reviewing') && canClose && (
                      <button onClick={() => handleAction('reopen')} disabled={!!actionLoading}
                        className="w-full py-3 bg-yellow-600 text-white font-medium rounded-lg hover:bg-yellow-500 disabled:opacity-50">
                        {actionLoading === 'reopen' ? '处理中...' : '重新打开'}
                      </button>
                    )}
                    {!canManage && report.status === 'pending' && <p className="text-xs text-gray-500 text-center">等待分派</p>}
                  </div>

                  <div className="mt-6 pt-6 border-t border-dark-border space-y-4">
                    <div><h4 className="text-xs font-medium text-gray-500 uppercase mb-2">漏洞等级</h4><span className={`text-2xl font-bold ${sev(report.severity).color}`}>{sev(report.severity).label}</span></div>
                    <div><h4 className="text-xs font-medium text-gray-500 uppercase mb-2">处理人</h4><p className="text-sm text-gray-300">{report.assignee?.username || '未分派'}</p></div>
                    <div><h4 className="text-xs font-medium text-gray-500 uppercase mb-2">报告人</h4><p className="text-sm text-gray-400">{report.reporter?.username || '未知'}</p></div>
                    {report.affected_url && <div><h4 className="text-xs font-medium text-gray-500 uppercase mb-2">受影响 URL</h4><p className="text-sm text-primary break-all">{report.affected_url}</p></div>}
                    {report.impact_scope && <div><h4 className="text-xs font-medium text-gray-500 uppercase mb-2">影响范围</h4><p className="text-sm text-gray-300">{report.impact_scope}</p></div>}
                    <div><h4 className="text-xs font-medium text-gray-500 uppercase mb-2">上报时间</h4><p className="text-sm text-gray-400">{report.created_at?.substring(0, 19).replace('T', ' ')}</p></div>
                  </div>

                  <div className="mt-6 pt-6 border-t border-dark-border">
                    <div className="flex items-center space-x-2 mb-4">
                      <Paperclip className="w-5 h-5 text-primary" />
                      <h3 className="text-lg font-semibold text-white">附件</h3>
                      <span className="text-xs text-gray-600">({attachments.length})</span>
                    </div>

                    <div className="space-y-3">
                      <label className={`block p-4 border-2 border-dashed rounded-lg text-center cursor-pointer transition-all ${
                        selectedFile ? 'border-green-500/50 bg-green-500/5' : 'border-dark-border hover:border-gray-500 hover:bg-dark-hover'
                      }`}>
                        {selectedFile ? (
                          <div className="flex items-center justify-center space-x-2 text-green-400">
                            <FileText className="w-5 h-5" />
                            <span className="text-sm truncate max-w-[200px]">{selectedFile.name}</span>
                            <span className="text-xs text-gray-500">({formatSize(selectedFile.size)})</span>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center space-x-2 text-gray-400">
                            <Upload className="w-5 h-5" />
                            <span className="text-sm">选择文件</span>
                          </div>
                        )}
                        <input type="file" className="hidden" onChange={handleFileSelect} disabled={uploading}
                          accept=".jpg,.jpeg,.png,.gif,.pdf,.zip,.tar,.gz,.doc,.docx,.txt,.py,.js,.sh" />
                      </label>

                      {selectedFile && (
                        <div className="flex space-x-2">
                          <button onClick={handleUploadClick} disabled={uploading}
                            className="flex-1 py-2.5 bg-primary text-white font-medium rounded-lg hover:bg-primary/80 disabled:opacity-50 flex items-center justify-center space-x-2">
                            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                            <span>{uploading ? '上传中...' : '上传文件'}</span>
                          </button>
                          <button onClick={() => setSelectedFile(null)} disabled={uploading}
                            className="px-4 py-2.5 bg-dark-bg border border-dark-border rounded-lg text-gray-400 hover:text-white disabled:opacity-50">
                            取消
                          </button>
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-gray-600 mt-2">支持 jpg/png/gif/pdf/zip/tar/gz/doc/docx/txt/py/js/sh，最大 50MB</p>

                    {attachments.length > 0 && (
                      <div className="mt-4 space-y-2 max-h-64 overflow-y-auto">
                        {attachments.map(att => (
                          <div key={att.id}
                            className="bg-dark-bg rounded-lg p-3 border border-dark-border flex items-center justify-between group hover:border-gray-600 transition-colors">
                            <div className="flex items-center space-x-3 min-w-0">
                              {getFileIcon(att.filename)}
                              <div className="min-w-0">
                                <p className="text-sm text-white truncate" title={att.filename}>{att.filename}</p>
                                <p className="text-xs text-gray-500">
                                  {formatSize(att.size)}
                                  {att.uploader_name && <span className="ml-2">· {att.uploader_name}</span>}
                                  <span className="ml-2">· {att.uploaded_at?.substring(0, 10)}</span>
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <a href={attachmentApi.downloadUrl(att.id)}
                                className="p-1.5 text-gray-400 hover:text-primary hover:bg-dark-hover rounded transition-colors"
                                title="下载">
                                <Download className="w-4 h-4" />
                              </a>
                              {(isStaff || att.uploader_name === user?.name) && (
                                <button onClick={() => handleDeleteAttachment(att.id)}
                                  className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-dark-hover rounded transition-colors"
                                  title="删除">
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>

      {showAssignModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={() => setShowAssignModal(false)}>
          <div className="bg-dark-card border border-dark-border rounded-xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">分派漏洞</h3>
              <button onClick={() => setShowAssignModal(false)} className="text-gray-400 hover:text-white"><XCircle className="w-5 h-5" /></button>
            </div>
            <p className="text-sm text-gray-400 mb-4">选择团队成员作为此漏洞的处理人</p>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {members.map(m => (
                <div key={m.user_id}
                  onClick={() => setSelectedAssignee(m.user_id)}
                  className={`p-3 rounded-lg cursor-pointer border transition-all flex items-center justify-between ${
                    selectedAssignee === m.user_id ? 'border-primary bg-primary/10' : 'border-dark-border bg-dark-bg hover:border-gray-600'
                  }`}>
                  <div><p className="text-sm text-white font-medium">{m.username}</p><p className="text-xs text-gray-500">{m.role_label}</p></div>
                  {selectedAssignee === m.user_id && <CheckCircle2 className="w-5 h-5 text-primary" />}
                </div>
              ))}
              {members.length === 0 && <p className="text-sm text-gray-500 text-center py-4">暂无团队成员</p>}
            </div>
            <div className="flex space-x-3 mt-4">
              <button onClick={() => setShowAssignModal(false)} className="flex-1 py-2.5 bg-dark-bg border border-dark-border rounded-lg text-gray-300 hover:bg-dark-hover">取消</button>
              <button onClick={handleAssign} disabled={!selectedAssignee || !!actionLoading}
                className="flex-1 py-2.5 bg-primary text-white font-medium rounded-lg hover:bg-primary/80 disabled:opacity-50">
                {actionLoading === 'assign' ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : '确认分派'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showCommentModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={() => setShowCommentModal(false)}>
          <div className="bg-dark-card border border-dark-border rounded-xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">
                {pendingAction === 'fix' ? '提交修复说明' : pendingAction === 'review_fail' ? '复核不通过原因' : '重新打开原因'}
              </h3>
              <button onClick={() => setShowCommentModal(false)} className="text-gray-400 hover:text-white"><XCircle className="w-5 h-5" /></button>
            </div>
            <p className="text-sm text-gray-400 mb-4">
              {pendingAction === 'reopen' ? '请填写重新打开漏洞的原因（必填）' : '请填写相关说明信息'}
            </p>
            <textarea
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder={
                pendingAction === 'fix' ? '描述修复方案和变更内容...' :
                pendingAction === 'review_fail' ? '描述复核未通过的具体原因...' :
                '请填写重新打开此漏洞的原因...'
              }
              rows={4}
              className="w-full px-4 py-3 bg-dark-bg border border-dark-border rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-primary resize-none"
            />
            <div className="flex space-x-3 mt-4">
              <button onClick={() => setShowCommentModal(false)} className="flex-1 py-2.5 bg-dark-bg border border-dark-border rounded-lg text-gray-300 hover:bg-dark-hover">取消</button>
              <button onClick={handleCommentSubmit} disabled={!!actionLoading}
                className="flex-1 py-2.5 bg-primary text-white font-medium rounded-lg hover:bg-primary/80 disabled:opacity-50">
                {actionLoading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : '确认提交'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
