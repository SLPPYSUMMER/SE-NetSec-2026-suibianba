'use client';

import { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import { teamsApi } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';
import { Users, UserPlus, Check, X, Mail, Shield, Loader2, AlertCircle, Trash2, Search, Building, ArrowLeftRight, AlertTriangle, LogOut, PlusCircle } from 'lucide-react';

const ROLE_OPTIONS = [
  { value: 'team_lead', label: '安全负责人' },
  { value: 'developer', label: '开发人员' },
  { value: 'observer', label: '观察者' },
];
const ROLE_LABELS: Record<string, string> = {
  admin: '团队管理员', team_lead: '安全负责人', developer: '开发人员', observer: '观察者',
};

export default function TeamPage() {
  const { user, refreshUser } = useAuth();
  const [members, setMembers] = useState<any[]>([]);
  const [pending, setPending] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'members' | 'pending' | 'invite'>('members');
  const [inviteName, setInviteName] = useState('');
  const [inviting, setInviting] = useState(false);
  const [actionMsg, setActionMsg] = useState('');
  const [teamName, setTeamName] = useState('');
  const [joinTeamId, setJoinTeamId] = useState('');
  const [adminData, setAdminData] = useState<any>(null);
  const [expandedTeam, setExpandedTeam] = useState<number | null>(null);
  const [hasPendingInvite, setHasPendingInvite] = useState(false);
  const [pendingInviteInfo, setPendingInviteInfo] = useState<any>(null);
  const [myTeams, setMyTeams] = useState<any[]>([]);
  const [switching, setSwitching] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const isAdmin = user?.role === '团队管理员' || user?.is_staff;
  const hasTeam = !!(user?.team_id);

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      try {
        if (hasTeam) {
          const [m, p] = await Promise.all([
            teamsApi.members().catch(() => ({ items: [], team_id: 0, team_name: '' })),
            isAdmin ? teamsApi.pending().catch(() => ({ items: [] })) : Promise.resolve({ items: [] }),
          ]);
          setMembers(m.items || []);
          setPending(p.items || []);
        }
        if (user?.is_staff) {
          const d = await teamsApi.adminDashboard().catch(() => null);
          setAdminData(d);
        }
        const inv = await teamsApi.pendingInvitation().catch(() => ({ has_pending: false }));
        setHasPendingInvite(inv.has_pending);
        setPendingInviteInfo(inv);
        const mt = await teamsApi.myTeams().catch(() => ({ items: [] }));
        setMyTeams(mt.items || []);
      } catch {} finally { setLoading(false); }
    };
    fetch();
  }, [hasTeam, isAdmin]);

  const showMsg = (msg: string) => { setActionMsg(msg); setTimeout(() => setActionMsg(''), 3500); };

  const handleApprove = async (id: number) => {
    try { await teamsApi.handleMember(id, { action: 'approve' }); showMsg('已通过申请'); setPending(p => p.filter(m => m.id !== id)); const m = await teamsApi.members().catch(() => ({ items: [] })); setMembers(m.items || []); } catch (err: any) { showMsg(err.message); }
  };
  const handleReject = async (id: number) => {
    try { await teamsApi.handleMember(id, { action: 'reject' }); showMsg('已拒绝申请'); setPending(p => p.filter(m => m.id !== id)); } catch (err: any) { showMsg(err.message); }
  };
  const handleKick = async (id: number) => {
    if (!confirm('确定要将该成员移出团队吗？')) return;
    try { await teamsApi.kick(id); showMsg('已移出团队'); setMembers(p => p.filter(m => m.id !== id)); } catch (err: any) { showMsg(err.message); }
  };
  const handleChangeRole = async (id: number, role: string) => {
    try { await teamsApi.handleMember(id, { action: 'change_role', role }); showMsg('角色已更新'); setMembers(prev => prev.map(m => m.id === id ? { ...m, role, role_label: ROLE_LABELS[role] || role } : m)); } catch (err: any) { showMsg(err.message); }
  };
  const handleInvite = async () => {
    if (!inviteName.trim()) return; setInviting(true);
    try { await teamsApi.invite(inviteName.trim()); showMsg(`已邀请 ${inviteName.trim()}，等待对方确认`); setInviteName(''); } catch (err: any) { showMsg(err.message); } finally { setInviting(false); }
  };
  const handleCreateTeam = async () => {
    if (!teamName.trim()) { showMsg('请输入团队名称'); return; }
    try { const r = await teamsApi.create(teamName.trim()); showMsg(r.message || '团队创建成功'); await refreshUser(); setTeamName(''); } catch (err: any) { showMsg(err.message); }
  };
  const handleJoinTeam = async () => {
    if (!joinTeamId) { showMsg('请输入团队ID'); return; }
    try { const r = await teamsApi.join(parseInt(joinTeamId)); showMsg(r.message || '申请已提交'); setJoinTeamId(''); } catch (err: any) { showMsg(err.message); }
  };
  const handleAcceptInvite = async () => {
    try { await teamsApi.acceptInvite(); await refreshUser(); showMsg('成功加入团队'); } catch (err: any) { showMsg(err.message); }
  };
  const handleDeclineInvite = async () => {
    try { await teamsApi.declineInvite(); showMsg('已拒绝邀请'); } catch (err: any) { showMsg(err.message); }
  };
  const handleSwitchTeam = async (teamId: number) => {
    if (teamId === user?.team_id) return;
    setSwitching(true);
    try {
      const r = await teamsApi.switchTeam(teamId);
      await refreshUser();
      setTab('members');
      showMsg(r.message || '已切换团队');
    } catch (err: any) {
      showMsg(err.message);
    } finally {
      setSwitching(false);
    }
  };

  const handleLeave = async () => {
    if (!confirm('确定要退出当前团队吗？退出后您将无法查看团队数据，但仍可看到自己创建的个人数据。')) return;
    setActionLoading(true);
    try {
      const r = await teamsApi.leave();
      await refreshUser();
      showMsg(r.message || '已成功退出团队');
      setTimeout(() => window.location.reload(), 1000);
    } catch (err: any) {
      showMsg(err.message || '退出失败');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDissolve = async () => {
    if (!confirm('⚠️ 确定要解散团队吗？此操作不可恢复！团队将被永久删除。')) return;
    if (!confirm('再次确认：确定要解散团队吗？')) return;
    setActionLoading(true);
    try {
      const r = await teamsApi.dissolve();
      await refreshUser();
      showMsg(r.message || '团队已解散');
      setTimeout(() => window.location.reload(), 1000);
    } catch (err: any) {
      showMsg(err.message || '解散失败');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) return <div className="min-h-screen bg-dark-bg"><Sidebar /><div className="ml-64"><Header /><div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="w-8 h-8 text-primary animate-spin" /></div></div></div>;

  // Super admin gets global dashboard by default
  if (user?.is_staff) {
    return (
      <div className="min-h-screen bg-dark-bg"><Sidebar /><div className="ml-64"><Header />
        <main className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div><h1 className="text-3xl font-bold text-white">团队看板</h1><p className="text-sm text-gray-400 mt-1">超级管理员全局视图</p></div>
            {/* team switcher for admin */}
            {myTeams.length > 0 && (
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-400">活跃团队:</span>
                <select value={user.team_id || ''} onChange={(e) => e.target.value && handleSwitchTeam(parseInt(e.target.value))} disabled={switching}
                  className="px-3 py-2 bg-dark-card border border-dark-border rounded-lg text-sm text-white cursor-pointer disabled:opacity-50">
                  <option value="">全局视图</option>
                  {myTeams.map((t: any) => (
                    <option key={t.team_id} value={t.team_id}>{t.team_name} ({t.role_label}){t.is_active ? ' ←' : ''}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
          {actionMsg && <div className="bg-primary/10 border border-primary/30 text-primary px-4 py-3 rounded-lg text-sm">{actionMsg}</div>}

          {hasTeam && (
            <div className="flex space-x-1 bg-dark-card border border-dark-border rounded-xl p-1 w-fit flex-wrap">
              {[{ key: 'members', label: `我的团队`, icon: Users }].map(t => (
                <button key={t.key} onClick={() => setTab(t.key as any)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center space-x-2 ${tab === t.key ? 'bg-primary text-white' : 'text-gray-400 hover:text-white'}`}><t.icon className="w-4 h-4" /><span>{t.label}</span></button>
              ))}
            </div>
          )}

          <div className="space-y-4">
            {(adminData?.teams || []).map((t: any) => (
              <div key={t.id} className="bg-dark-card border border-dark-border rounded-xl overflow-hidden">
                <div onClick={() => setExpandedTeam(expandedTeam === t.id ? null : t.id)} className="p-4 flex items-center justify-between cursor-pointer hover:bg-dark-hover transition-colors">
                  <div><h3 className="text-white font-medium">{t.name}</h3><p className="text-xs text-gray-500">管理员: {t.admin_name || '无'} | {t.members.length} 人</p></div>
                  <span className="text-gray-400 text-xs">{expandedTeam === t.id ? '收起' : '展开'}</span>
                </div>
                {expandedTeam === t.id && (
                  <div className="border-t border-dark-border p-4">
                    <table className="w-full text-sm">
                      <thead><tr className="text-left text-gray-400"><th className="py-2">用户名</th><th className="py-2">角色</th></tr></thead>
                      <tbody>{t.members.map((m: any) => (
                        <tr key={m.user_id} className="border-t border-dark-border"><td className="py-2 text-white">{m.username}</td><td className="py-2 text-gray-300">{m.role_label}</td></tr>
                      ))}</tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </div>
          {(adminData?.users_without_team || []).length > 0 && (
            <div className="bg-dark-card border border-dark-border rounded-xl p-6">
              <h3 className="text-lg font-semibold text-white mb-4">无团队用户 ({adminData.users_without_team.length})</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {adminData.users_without_team.map((u: any) => (
                  <div key={u.id} className="p-3 bg-dark-bg rounded-lg"><p className="text-sm text-white">{u.username}</p><p className="text-xs text-gray-500">{u.email || '—'}{u.is_staff ? ' · 管理员' : ''}</p></div>
                ))}
              </div>
            </div>
          )}
        </main>
      </div></div>
    );
  }

  // Regular user without team
  if (!hasTeam) {
    return (
      <div className="min-h-screen bg-dark-bg"><Sidebar /><div className="ml-64"><Header />
        <main className="p-6 space-y-6">
          <div><h1 className="text-3xl font-bold text-white">团队管理</h1><p className="text-sm text-gray-400 mt-1">您尚未加入任何团队</p></div>
          {actionMsg && <div className="bg-primary/10 border border-primary/30 text-primary px-4 py-3 rounded-lg text-sm">{actionMsg}</div>}

          {hasPendingInvite && (
            <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-6">
              <p className="text-sm text-green-400 mb-3">📨 <strong>{pendingInviteInfo.team_name}</strong> 邀请您加入团队</p>
              <div className="flex space-x-3">
                <button onClick={handleAcceptInvite} className="px-4 py-2 bg-green-500/10 border border-green-500/30 text-green-400 rounded-lg hover:bg-green-500/20 text-sm">接受邀请</button>
                <button onClick={handleDeclineInvite} className="px-4 py-2 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg hover:bg-red-500/20 text-sm">拒绝</button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 单团队模式提示 */}
            <div className="lg:col-span-2 bg-blue-500/10 border border-blue-500/30 rounded-xl p-4">
              <div className="flex items-start space-x-3">
                <AlertTriangle className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm text-blue-300 font-medium">单团队模式说明</p>
                  <ul className="text-xs text-blue-200/80 mt-2 space-y-1 list-disc list-inside">
                    <li>每位用户只能属于<strong className="text-blue-300">一个团队</strong></li>
                    <li>加入或创建新团队前，需先退出当前团队</li>
                    <li>退出后可以随时创建或加入其他团队</li>
                    <li>所有漏洞报告、扫描任务等数据将按团队隔离</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="bg-dark-card border border-dark-border rounded-xl p-6">
              <div className="flex items-center space-x-2 mb-4"><Building className="w-5 h-5 text-primary" /><h3 className="text-lg font-semibold text-white">创建团队</h3></div>
              <p className="text-xs text-gray-500 mb-3">创建后您将自动成为团队管理员。每位用户只能拥有一个团队。</p>
              <div className="flex space-x-3">
                <input type="text" value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder="输入团队名称" onKeyDown={(e) => e.key === 'Enter' && handleCreateTeam()}
                  className="flex-1 px-4 py-3 bg-dark-bg border border-dark-border rounded-lg text-white placeholder-gray-600 focus:outline-none focus:border-primary transition-colors" />
                <button onClick={handleCreateTeam} disabled={!teamName.trim()} className="px-6 py-3 bg-gradient-to-r from-primary to-cyan-400 text-white font-medium rounded-lg hover:shadow-lg hover:shadow-primary/25 transition-all disabled:opacity-50">创建</button>
              </div>
            </div>
            <div className="bg-dark-card border border-dark-border rounded-xl p-6">
              <div className="flex items-center space-x-2 mb-4"><Search className="w-5 h-5 text-primary" /><h3 className="text-lg font-semibold text-white">加入团队</h3></div>
              <p className="text-xs text-gray-500 mb-3">输入团队ID申请加入，等待管理员审核。每位用户只能属于一个团队。</p>
              <div className="flex space-x-3">
                <input type="text" value={joinTeamId} onChange={(e) => setJoinTeamId(e.target.value)} placeholder="输入团队ID" onKeyDown={(e) => e.key === 'Enter' && handleJoinTeam()}
                  className="flex-1 px-4 py-3 bg-dark-bg border border-dark-border rounded-lg text-white placeholder-gray-600 focus:outline-none focus:border-primary transition-colors" />
                <button onClick={handleJoinTeam} disabled={!joinTeamId} className="px-6 py-3 bg-gradient-to-r from-primary to-cyan-400 text-white font-medium rounded-lg hover:shadow-lg hover:shadow-primary/25 transition-all disabled:opacity-50">加入</button>
              </div>
            </div>
          </div>
        </main>
      </div></div>
    );
  }

  // Regular user with team
  return (
    <div className="min-h-screen bg-dark-bg"><Sidebar /><div className="ml-64"><Header />
      <main className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div><h1 className="text-3xl font-bold text-white">团队管理</h1><p className="text-sm text-gray-400 mt-1">{user.team_name} — ID: <span className="text-primary font-mono">{user.team_id}</span> — 您的角色: {user.role}</p></div>
          
          {/* 单团队模式：移除切换团队功能 */}
        </div>

        {/* 单团队模式信息提示 */}
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4">
          <div className="flex items-start space-x-3">
            <AlertTriangle className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm text-blue-300 font-medium">单团队模式</p>
              <p className="text-xs text-blue-200/80 mt-1">您当前属于团队 <strong className="text-blue-300">{user.team_name}</strong>。如需加入其他团队，请先退出当前团队。</p>
            </div>
          </div>
        </div>

        {hasPendingInvite && (
          <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-6">
            <p className="text-sm text-green-400 mb-3">📨 <strong>{pendingInviteInfo.team_name}</strong> 邀请您加入团队</p>
            <div className="flex space-x-3">
              <button onClick={handleAcceptInvite} className="px-4 py-2 bg-green-500/10 border border-green-500/30 text-green-400 rounded-lg hover:bg-green-500/20 text-sm">接受</button>
              <button onClick={handleDeclineInvite} className="px-4 py-2 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg hover:bg-red-500/20 text-sm">拒绝</button>
            </div>
          </div>
        )}
        {actionMsg && <div className="bg-primary/10 border border-primary/30 text-primary px-4 py-3 rounded-lg text-sm">{actionMsg}</div>}

        <div className="flex space-x-1 bg-dark-card border border-dark-border rounded-xl p-1 w-fit flex-wrap">
          {[{ key: 'members', label: `成员 (${members.length})`, icon: Users },
            ...(isAdmin ? [{ key: 'pending', label: `待审核 (${pending.length})`, icon: AlertCircle }] : []),
            ...(isAdmin ? [{ key: 'invite', label: '邀请成员', icon: UserPlus }] : []),
          ].map(t => (
            <button key={t.key} onClick={() => setTab(t.key as any)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center space-x-2 ${tab === t.key ? 'bg-primary text-white' : 'text-gray-400 hover:text-white'}`}><t.icon className="w-4 h-4" /><span>{t.label}</span></button>
          ))}
        </div>

        <div className="flex items-center justify-between mt-6">
          <div className="text-sm text-gray-500">
            {isAdmin && members.length <= 1 && (
              <span className="text-yellow-500">⚠️ 您是唯一成员，可以安全解散团队</span>
            )}
            {!isAdmin && (
              <span>退出后仍可查看个人数据</span>
            )}
          </div>
          <div className="flex items-center space-x-3">
            {isAdmin && members.length <= 1 && (
              <button onClick={handleDissolve} disabled={actionLoading}
                className="px-5 py-2.5 bg-red-600/20 border border-red-500/30 text-red-400 rounded-lg hover:bg-red-600/30 font-medium text-sm flex items-center space-x-2 transition-all">
                <AlertTriangle className="w-4 h-4" /><span>解散团队</span>
              </button>
            )}
            {!isAdmin && (
              <button onClick={handleLeave} disabled={actionLoading}
                className="px-5 py-2.5 bg-orange-600/20 border border-orange-500/30 text-orange-400 rounded-lg hover:bg-orange-600/30 font-medium text-sm flex items-center space-x-2 transition-all">
                <LogOut className="w-4 h-4" /><span>退出团队</span>
              </button>
            )}
          </div>
        </div>

        {tab === 'members' && (
          <div className="bg-dark-card border border-dark-border rounded-xl overflow-hidden">
            <table className="w-full"><thead><tr className="border-b border-dark-border"><th className="text-left px-6 py-4 text-xs font-medium text-gray-400 uppercase">用户</th><th className="text-left px-6 py-4 text-xs font-medium text-gray-400 uppercase">角色</th><th className="text-left px-6 py-4 text-xs font-medium text-gray-400 uppercase">加入</th><th className="text-right px-6 py-4 text-xs font-medium text-gray-400 uppercase">操作</th></tr></thead>
            <tbody className="divide-y divide-dark-border">
              {members.map(m => (
                <tr key={m.id} className="hover:bg-dark-hover transition-colors">
                  <td className="px-6 py-4"><p className="text-sm font-medium text-white">{m.username}</p><p className="text-xs text-gray-500">{m.email}</p></td>
                  <td className="px-6 py-4">
                    {isAdmin && m.user_id !== user.id && m.role !== 'admin' ? (
                      <select value={m.role} onChange={(e) => handleChangeRole(m.id, e.target.value)} className="px-3 py-1.5 bg-dark-bg border border-dark-border rounded text-sm text-white cursor-pointer">
                        {ROLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    ) : <span className="text-sm text-gray-300">{m.role_label}</span>}
                  </td>
                  <td className="px-6 py-4"><span className="text-sm text-gray-400">{m.joined_at?.substring(0, 10) || '—'}</span></td>
                  <td className="px-6 py-4 text-right">
                    {isAdmin && m.user_id !== user.id && m.role !== 'admin' && (
                      <button onClick={() => handleKick(m.id)} className="px-3 py-1.5 bg-red-500/10 text-red-400 rounded text-sm hover:bg-red-500/20 flex items-center space-x-1 ml-auto"><Trash2 className="w-3.5 h-3.5" /><span>踢出</span></button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody></table>
          </div>
        )}

        {tab === 'pending' && (
          <div className="bg-dark-card border border-dark-border rounded-xl overflow-hidden">
            <table className="w-full"><thead><tr className="border-b border-dark-border"><th className="text-left px-6 py-4 text-xs font-medium text-gray-400 uppercase">用户</th><th className="text-left px-6 py-4 text-xs font-medium text-gray-400 uppercase">申请时间</th><th className="text-right px-6 py-4 text-xs font-medium text-gray-400 uppercase">操作</th></tr></thead>
            <tbody className="divide-y divide-dark-border">
              {pending.length === 0 ? <tr><td colSpan={3} className="px-6 py-8 text-center text-gray-500">暂无待审核成员</td></tr>
              : pending.map(m => (
                <tr key={m.id} className="hover:bg-dark-hover transition-colors">
                  <td className="px-6 py-4"><p className="text-sm font-medium text-white">{m.username}</p><p className="text-xs text-gray-500">{m.email}</p></td>
                  <td className="px-6 py-4"><span className="text-sm text-gray-400">{m.joined_at?.substring(0, 10)}</span></td>
                  <td className="px-6 py-4 text-right"><div className="flex items-center justify-end space-x-2">
                    <button onClick={() => handleApprove(m.id)} className="px-4 py-1.5 bg-green-500/10 text-green-400 rounded-lg text-sm hover:bg-green-500/20"><Check className="w-3.5 h-3.5 inline mr-1" />通过</button>
                    <button onClick={() => handleReject(m.id)} className="px-4 py-1.5 bg-red-500/10 text-red-400 rounded-lg text-sm hover:bg-red-500/20"><X className="w-3.5 h-3.5 inline mr-1" />拒绝</button>
                  </div></td>
                </tr>
              ))}
            </tbody></table>
          </div>
        )}

        {tab === 'invite' && (
          <div className="bg-dark-card border border-dark-border rounded-xl p-6 max-w-lg">
            <h3 className="text-lg font-semibold text-white mb-4">邀请新成员</h3>
            <div className="flex items-center space-x-3">
              <div className="flex-1 relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input type="text" placeholder="输入要邀请的用户名" value={inviteName} onChange={(e) => setInviteName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
                  className="w-full pl-10 pr-4 py-3 bg-dark-bg border border-dark-border rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-primary" />
              </div>
              <button onClick={handleInvite} disabled={inviting || !inviteName.trim()} className="px-6 py-3 bg-gradient-to-r from-primary to-cyan-400 text-white font-medium rounded-lg hover:shadow-lg hover:shadow-primary/25 transition-all disabled:opacity-50 flex items-center space-x-2">
                {inviting ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}<span>邀请</span>
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-3">邀请后需对方接受才能加入团队</p>
          </div>
        )}

        {/* 📋 我的所有团队列表 */}
        {myTeams.length > 0 && (
          <div className="bg-dark-card border border-dark-border rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white flex items-center space-x-2">
                <Building className="w-5 h-5 text-primary" />
                <span>我的所有团队 ({myTeams.length})</span>
              </h3>
              <span className="text-xs text-gray-500">点击切换管理不同团队</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {myTeams.map((team: any) => {
                const isCurrentTeam = team.team_id === user?.team_id;
                const isAccepted = team.status === 'accepted';
                const isPending = team.status === 'pending';

                return (
                  <div
                    key={team.team_id}
                    className={`relative p-4 rounded-lg border transition-all ${
                      isCurrentTeam
                        ? 'bg-primary/10 border-primary/30 shadow-lg shadow-primary/10'
                        : isPending
                          ? 'bg-gray-500/5 border-gray-600/30 opacity-60'
                          : 'bg-dark-bg border-dark-border hover:border-primary/30 hover:bg-primary/5'
                    }`}
                  >
                    {/* 当前团队标识 */}
                    {isCurrentTeam && isAccepted && (
                      <div className="absolute -top-2 -right-2 px-2 py-0.5 bg-primary text-white text-xs rounded-full font-medium">
                        当前
                      </div>
                    )}

                    {/* 待审批标识 */}
                    {isPending && (
                      <div className="absolute -top-2 -right-2 px-2 py-0.5 bg-yellow-500 text-black text-xs rounded-full font-medium">
                        待审批
                      </div>
                    )}

                    {/* 团队信息 */}
                    <div className="space-y-2">
                      <div className="flex items-start justify-between">
                        <h4 className={`font-medium ${isPending ? 'text-gray-400' : 'text-white'}`}>
                          {team.team_name}
                        </h4>
                        <span className={`text-xs px-2 py-0.5 rounded ${
                          team.role === 'admin'
                            ? 'bg-purple-500/20 text-purple-400'
                            : 'bg-blue-500/20 text-blue-400'
                        }`}>
                          {team.role_label}
                        </span>
                      </div>

                      {/* 数据统计 */}
                      <div className="grid grid-cols-3 gap-2 text-xs text-gray-500">
                        <div className="text-center p-1.5 bg-dark-card/50 rounded">
                          <p className="font-medium text-white">{team.scan_count}</p>
                          <p>任务</p>
                        </div>
                        <div className="text-center p-1.5 bg-dark-card/50 rounded">
                          <p className="font-medium text-white">{team.vuln_count}</p>
                          <p>漏洞</p>
                        </div>
                        <div className="text-center p-1.5 bg-dark-card/50 rounded">
                          <p className="font-medium text-white">{team.asset_count}</p>
                          <p>资产</p>
                        </div>
                      </div>

                      {/* 操作按钮 */}
                      {!isCurrentTeam && isAccepted && (
                        <button
                          onClick={() => handleSwitchTeam(team.team_id)}
                          disabled={switching}
                          className="w-full mt-2 px-3 py-1.5 bg-primary/10 border border-primary/30 text-primary rounded-lg text-xs font-medium hover:bg-primary/20 transition-all disabled:opacity-50 flex items-center justify-center space-x-1"
                        >
                          <ArrowLeftRight className="w-3 h-3" />
                          <span>切换到此团队</span>
                        </button>
                      )}

                      {isCurrentTeam && (
                        <div className="mt-2 text-xs text-center text-primary font-medium">
                          ✓ 正在管理此团队
                        </div>
                      )}

                      {isPending && (
                        <div className="mt-2 text-xs text-center text-yellow-400">
                          等待管理员审核...
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 提示信息 */}
            <p className="text-xs text-gray-500 mt-4 text-center">
              💡 提示：切换团队后，此页面的成员管理、数据统计等都会更新为该团队的信息
            </p>
          </div>
        )}

        <div className="mt-8 border-t border-dark-border pt-8">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center space-x-2"><PlusCircle className="w-5 h-5 text-primary" /><span>其他操作</span></h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-dark-card border border-dark-border rounded-xl p-6">
              <div className="flex items-center space-x-2 mb-4"><Building className="w-5 h-5 text-primary" /><h3 className="text-lg font-semibold text-white">创建新团队</h3></div>
              <input type="text" value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder="输入新团队名称"
                className="w-full px-4 py-3 bg-dark-bg border border-dark-border rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-primary mb-3" />
              <button onClick={handleCreateTeam} disabled={!teamName.trim() || actionLoading}
                className="w-full px-4 py-3 bg-gradient-to-r from-primary to-cyan-400 text-white font-medium rounded-lg hover:shadow-lg hover:shadow-primary/25 transition-all disabled:opacity-50 flex items-center justify-center space-x-2">
                {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Building className="w-4 h-4" />}<span>创建新团队</span>
              </button>
              <p className="text-xs text-gray-500 mt-3">创建后将自动成为该团队的管理员</p>
            </div>

            <div className="bg-dark-card border border-dark-border rounded-xl p-6">
              <div className="flex items-center space-x-2 mb-4"><Search className="w-5 h-5 text-primary" /><h3 className="text-lg font-semibold text-white">加入其他团队</h3></div>
              <input type="text" value={joinTeamId} onChange={(e) => setJoinTeamId(e.target.value)} placeholder="输入要加入的团队ID"
                className="w-full px-4 py-3 bg-dark-bg border border-dark-border rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-primary mb-3" />
              <button onClick={handleJoinTeam} disabled={!joinTeamId.trim() || actionLoading}
                className="w-full px-4 py-3 bg-gradient-to-r from-purple-600 to-pink-500 text-white font-medium rounded-lg hover:shadow-lg hover:shadow-purple-500/25 transition-all disabled:opacity-50 flex items-center justify-center space-x-2">
                {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}<span>申请加入</span>
              </button>
              <p className="text-xs text-gray-500 mt-3">需要等待目标团队管理员审核通过</p>
            </div>
          </div>
        </div>
      </main>
    </div></div>
  );
}
