'use client';

import { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import { teamsApi } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';
import { Users, UserPlus, Check, X, Mail, Shield, Loader2, AlertCircle } from 'lucide-react';

const ROLE_OPTIONS = [
  { value: 'admin', label: '团队管理员' },
  { value: 'team_lead', label: '团队负责人' },
  { value: 'developer', label: '开发人员' },
  { value: 'observer', label: '观察者' },
];

const ROLE_LABELS: Record<string, string> = Object.fromEntries(ROLE_OPTIONS.map(r => [r.value, r.label]));

const STATUS_LABELS: Record<string, string> = {
  pending: '待审核',
  accepted: '已通过',
  rejected: '已拒绝',
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

  const isAdmin = user?.role === '团队管理员' || user?.is_staff;

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      try {
        const [m, p] = await Promise.all([
          teamsApi.members().catch(() => ({ items: [], team_id: 0, team_name: '' })),
          isAdmin ? teamsApi.pending().catch(() => ({ items: [] })) : Promise.resolve({ items: [] }),
        ]);
        setMembers(m.items || []);
        setPending(p.items || []);
      } catch {} finally { setLoading(false); }
    };
    fetch();
  }, [isAdmin]);

  const showMsg = (msg: string) => {
    setActionMsg(msg);
    setTimeout(() => setActionMsg(''), 3000);
  };

  const handleApprove = async (id: number) => {
    try {
      await teamsApi.handleMember(id, { action: 'approve' });
      showMsg('已通过申请');
      setPending(p => p.filter(m => m.id !== id));
      const m = await teamsApi.members().catch(() => ({ items: [] }));
      setMembers(m.items || []);
    } catch (err: any) { showMsg(err.message || '操作失败'); }
  };

  const handleReject = async (id: number) => {
    try {
      await teamsApi.handleMember(id, { action: 'reject' });
      showMsg('已拒绝申请');
      setPending(p => p.filter(m => m.id !== id));
    } catch (err: any) { showMsg(err.message || '操作失败'); }
  };

  const handleChangeRole = async (id: number, role: string) => {
    try {
      await teamsApi.handleMember(id, { action: 'change_role', role });
      showMsg('角色已更新');
      setMembers(prev => prev.map(m => m.id === id ? { ...m, role, role_label: ROLE_LABELS[role] } : m));
      refreshUser();
    } catch (err: any) { showMsg(err.message || '操作失败'); }
  };

  const handleInvite = async () => {
    if (!inviteName.trim()) return;
    setInviting(true);
    try {
      await teamsApi.invite(inviteName.trim());
      showMsg(`已邀请 ${inviteName.trim()} 加入团队`);
      setInviteName('');
      const m = await teamsApi.members().catch(() => ({ items: [] }));
      setMembers(m.items || []);
    } catch (err: any) { showMsg(err.message || '邀请失败'); }
    finally { setInviting(false); }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-dark-bg">
        <Sidebar />
        <div className="ml-64">
          <Header />
          <div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="w-8 h-8 text-primary animate-spin" /></div>
        </div>
      </div>
    );
  }

  if (!user?.team_id) {
    return (
      <div className="min-h-screen bg-dark-bg">
        <Sidebar />
        <div className="ml-64">
          <Header />
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
            <Shield className="w-16 h-16 text-gray-600 mb-4" />
            <h2 className="text-2xl font-bold text-white mb-2">未加入任何团队</h2>
            <p className="text-gray-400 mb-6">请联系团队管理员获取邀请，或在注册时创建团队</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-dark-bg">
      <Sidebar />
      <div className="ml-64">
        <Header />
        <main className="p-6 space-y-6">
          <div>
            <h1 className="text-3xl font-bold text-white">团队管理</h1>
            <p className="text-sm text-gray-400 mt-1">{user.team_name} — 您的角色: {user.role}</p>
          </div>

          {actionMsg && (
            <div className="bg-primary/10 border border-primary/30 text-primary px-4 py-3 rounded-lg text-sm">{actionMsg}</div>
          )}

          <div className="flex space-x-1 bg-dark-card border border-dark-border rounded-xl p-1 w-fit">
            {[
              { key: 'members', label: `团队成员 (${members.length})`, icon: Users },
              ...(isAdmin ? [{ key: 'pending', label: `待审核 (${pending.length})`, icon: AlertCircle }] : []),
              ...(isAdmin ? [{ key: 'invite', label: '邀请成员', icon: UserPlus }] : []),
            ].map((t) => (
              <button key={t.key}
                onClick={() => setTab(t.key as any)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center space-x-2 ${
                  tab === t.key ? 'bg-primary text-white shadow-lg shadow-primary/25' : 'text-gray-400 hover:text-white'
                }`}>
                <t.icon className="w-4 h-4" /><span>{t.label}</span>
              </button>
            ))}
          </div>

          {tab === 'members' && (
            <div className="bg-dark-card border border-dark-border rounded-xl overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-dark-border">
                    <th className="text-left px-6 py-4 text-xs font-medium text-gray-400 uppercase">用户</th>
                    <th className="text-left px-6 py-4 text-xs font-medium text-gray-400 uppercase">角色</th>
                    <th className="text-left px-6 py-4 text-xs font-medium text-gray-400 uppercase">加入时间</th>
                    {isAdmin && <th className="text-right px-6 py-4 text-xs font-medium text-gray-400 uppercase">操作</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-dark-border">
                  {members.map((m) => (
                    <tr key={m.id} className="hover:bg-dark-hover transition-colors">
                      <td className="px-6 py-4">
                        <div>
                          <p className="text-sm font-medium text-white">{m.username}</p>
                          <p className="text-xs text-gray-500">{m.email}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {isAdmin && m.user_id !== user.id ? (
                          <select value={m.role} onChange={(e) => handleChangeRole(m.id, e.target.value)}
                            className="px-3 py-1.5 bg-dark-bg border border-dark-border rounded text-sm text-white cursor-pointer">
                            {ROLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                        ) : (
                          <span className="text-sm text-gray-300">{m.role_label}</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-gray-400">{m.joined_at?.substring(0, 10)}</span>
                      </td>
                      {isAdmin && (
                        <td className="px-6 py-4 text-right">
                          {m.user_id !== user.id && m.status === 'pending' && (
                            <div className="flex items-center justify-end space-x-2">
                              <button onClick={() => handleApprove(m.id)}
                                className="px-3 py-1.5 bg-green-500/10 text-green-400 rounded text-sm hover:bg-green-500/20">通过</button>
                              <button onClick={() => handleReject(m.id)}
                                className="px-3 py-1.5 bg-red-500/10 text-red-400 rounded text-sm hover:bg-red-500/20">拒绝</button>
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'pending' && (
            <div className="bg-dark-card border border-dark-border rounded-xl overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-dark-border">
                    <th className="text-left px-6 py-4 text-xs font-medium text-gray-400 uppercase">用户</th>
                    <th className="text-left px-6 py-4 text-xs font-medium text-gray-400 uppercase">申请时间</th>
                    <th className="text-right px-6 py-4 text-xs font-medium text-gray-400 uppercase">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-dark-border">
                  {pending.length === 0 ? (
                    <tr><td colSpan={3} className="px-6 py-8 text-center text-gray-500">暂无待审核成员</td></tr>
                  ) : pending.map((m) => (
                    <tr key={m.id} className="hover:bg-dark-hover transition-colors">
                      <td className="px-6 py-4">
                        <p className="text-sm font-medium text-white">{m.username}</p>
                        <p className="text-xs text-gray-500">{m.email}</p>
                      </td>
                      <td className="px-6 py-4"><span className="text-sm text-gray-400">{m.joined_at?.substring(0, 10)}</span></td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end space-x-2">
                          <button onClick={() => handleApprove(m.id)}
                            className="px-4 py-1.5 bg-green-500/10 text-green-400 rounded-lg text-sm hover:bg-green-500/20 flex items-center space-x-1">
                            <Check className="w-3.5 h-3.5" /><span>通过</span>
                          </button>
                          <button onClick={() => handleReject(m.id)}
                            className="px-4 py-1.5 bg-red-500/10 text-red-400 rounded-lg text-sm hover:bg-red-500/20 flex items-center space-x-1">
                            <X className="w-3.5 h-3.5" /><span>拒绝</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'invite' && (
            <div className="bg-dark-card border border-dark-border rounded-xl p-6 max-w-lg">
              <h3 className="text-lg font-semibold text-white mb-4">邀请新成员</h3>
              <div className="flex items-center space-x-3">
                <div className="flex-1 relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input type="text" placeholder="输入要邀请的用户名" value={inviteName}
                    onChange={(e) => setInviteName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
                    className="w-full pl-10 pr-4 py-3 bg-dark-bg border border-dark-border rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-primary" />
                </div>
                <button onClick={handleInvite} disabled={inviting || !inviteName.trim()}
                  className="px-6 py-3 bg-gradient-to-r from-primary to-cyan-400 text-white font-medium rounded-lg hover:shadow-lg hover:shadow-primary/25 transition-all disabled:opacity-50 flex items-center space-x-2">
                  {inviting ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                  <span>邀请</span>
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-3">邀请的用户将自动通过并加入团队</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
