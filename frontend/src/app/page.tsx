'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { authApi } from '@/services/api';
import { Shield, Eye, EyeOff, Loader2, UserPlus, LogIn, Users, Search } from 'lucide-react';

export default function LoginPage() {
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [email, setEmail] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [teamAction, setTeamAction] = useState<'create' | 'join' | ''>('');
  const [teamName, setTeamName] = useState('');
  const [teamId, setTeamId] = useState('');
  const { login } = useAuth();
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username, password);
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message || '登录失败，请检查用户名和密码');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) { setError('密码长度至少6位'); return; }
    if (password !== confirmPassword) { setError('两次输入的密码不一致'); return; }
    if (teamAction && !teamName && !teamId) { setError('请选择创建团队或加入已有团队'); return; }
    if (teamAction === 'create' && !teamName.trim()) { setError('请输入团队名称'); return; }
    if (teamAction === 'join' && !teamId) { setError('请输入要加入的团队ID'); return; }

    setLoading(true);
    try {
      const payload: any = { username, password, email };
      if (teamAction === 'create') { payload.team_action = 'create'; payload.team_name = teamName.trim(); }
      else if (teamAction === 'join') { payload.team_action = 'join'; payload.team_id = parseInt(teamId); }

      const res = await authApi.register(payload);
      if (res.success) {
        setError('');
        setTab('login');
        setUsername(res.username);
        setPassword('');
        setConfirmPassword('');
        alert(teamAction === 'join' ? '注册成功！团队加入申请已提交，请等待审核。' : '注册成功！请登录');
      }
    } catch (err: any) {
      setError(err.message || '注册失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-dark-bg flex items-center justify-center relative overflow-hidden">
      <div className="absolute inset-0 opacity-5">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-cyan-500 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-md px-8">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-primary/25">
            <Shield className="w-9 h-9 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">SecGuard</h1>
          <p className="text-gray-500 text-sm">漏洞管理与跟踪平台</p>
        </div>

        <div className="flex mb-6 bg-dark-card border border-dark-border rounded-xl p-1">
          <button onClick={() => { setTab('login'); setError(''); }}
            className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center justify-center space-x-2 ${
              tab === 'login' ? 'bg-primary text-white shadow-lg shadow-primary/25' : 'text-gray-400 hover:text-white'
            }`}>
            <LogIn className="w-4 h-4" /><span>登录</span>
          </button>
          <button onClick={() => { setTab('register'); setError(''); }}
            className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center justify-center space-x-2 ${
              tab === 'register' ? 'bg-primary text-white shadow-lg shadow-primary/25' : 'text-gray-400 hover:text-white'
            }`}>
            <UserPlus className="w-4 h-4" /><span>注册</span>
          </button>
        </div>

        {tab === 'login' ? (
          <form onSubmit={handleLogin} className="bg-dark-card border border-dark-border rounded-2xl p-8 space-y-6">
            {error && <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg text-sm">{error}</div>}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">用户名</label>
              <input type="text" value={username} onChange={(e) => setUsername(e.target.value)}
                placeholder="请输入用户名" required
                className="w-full px-4 py-3 bg-dark-bg border border-dark-border rounded-lg text-white placeholder-gray-600 focus:outline-none focus:border-primary transition-colors" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">密码</label>
              <div className="relative">
                <input type={showPassword ? 'text' : 'password'} value={password}
                  onChange={(e) => setPassword(e.target.value)} placeholder="请输入密码" required
                  className="w-full px-4 py-3 bg-dark-bg border border-dark-border rounded-lg text-white placeholder-gray-600 focus:outline-none focus:border-primary transition-colors pr-12" />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors">
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>
            <button type="submit" disabled={loading}
              className="w-full py-3 bg-gradient-to-r from-primary to-cyan-400 text-white font-semibold rounded-lg hover:shadow-lg hover:shadow-primary/25 transition-all disabled:opacity-50 flex items-center justify-center space-x-2">
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <span>登 录</span>}
            </button>
          </form>
        ) : (
          <form onSubmit={handleRegister} className="bg-dark-card border border-dark-border rounded-2xl p-8 space-y-5 max-h-[80vh] overflow-y-auto">
            {error && <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg text-sm">{error}</div>}

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">用户名 *</label>
              <input type="text" value={username} onChange={(e) => setUsername(e.target.value)}
                placeholder="3-150个字符" required minLength={3} maxLength={150}
                className="w-full px-4 py-3 bg-dark-bg border border-dark-border rounded-lg text-white placeholder-gray-600 focus:outline-none focus:border-primary transition-colors" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">密码 *</label>
              <div className="relative">
                <input type={showPassword ? 'text' : 'password'} value={password}
                  onChange={(e) => setPassword(e.target.value)} placeholder="至少6位密码" required minLength={6}
                  className="w-full px-4 py-3 bg-dark-bg border border-dark-border rounded-lg text-white placeholder-gray-600 focus:outline-none focus:border-primary transition-colors pr-12" />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors">
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">确认密码 *</label>
              <input type={showPassword ? 'text' : 'password'} value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)} placeholder="再次输入密码" required minLength={6}
                className="w-full px-4 py-3 bg-dark-bg border border-dark-border rounded-lg text-white placeholder-gray-600 focus:outline-none focus:border-primary transition-colors" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">邮箱</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="选填，用于找回密码"
                className="w-full px-4 py-3 bg-dark-bg border border-dark-border rounded-lg text-white placeholder-gray-600 focus:outline-none focus:border-primary transition-colors" />
            </div>

            <div className="pt-2 border-t border-dark-border">
              <label className="block text-sm font-medium text-gray-300 mb-3">团队（可选）</label>
              <div className="flex space-x-1 bg-dark-bg rounded-lg p-1 mb-3">
                <button type="button"
                  onClick={() => { setTeamAction('create'); setTeamId(''); }}
                  className={`flex-1 py-2 rounded text-sm font-medium transition-all ${
                    teamAction === 'create' ? 'bg-primary text-white' : 'text-gray-400 hover:text-white'
                  }`}>创建团队</button>
                <button type="button"
                  onClick={() => { setTeamAction('join'); setTeamName(''); }}
                  className={`flex-1 py-2 rounded text-sm font-medium transition-all ${
                    teamAction === 'join' ? 'bg-primary text-white' : 'text-gray-400 hover:text-white'
                  }`}>加入团队</button>
              </div>

              {teamAction === 'create' && (
                <div>
                  <label className="block text-xs text-gray-500 mb-1">您将成为团队管理员，可管理成员和分配角色</label>
                  <input type="text" value={teamName} onChange={(e) => setTeamName(e.target.value)}
                    placeholder="输入团队名称" required
                    className="w-full px-4 py-3 bg-dark-bg border border-dark-border rounded-lg text-white placeholder-gray-600 focus:outline-none focus:border-primary transition-colors" />
                </div>
              )}
              {teamAction === 'join' && (
                <div>
                  <label className="block text-xs text-gray-500 mb-1">输入团队ID，提交后将由管理员审核</label>
                  <input type="text" value={teamId} onChange={(e) => setTeamId(e.target.value)}
                    placeholder="输入团队ID" required
                    className="w-full px-4 py-3 bg-dark-bg border border-dark-border rounded-lg text-white placeholder-gray-600 focus:outline-none focus:border-primary transition-colors" />
                </div>
              )}
              {!teamAction && (
                <p className="text-xs text-gray-500">可稍后在团队管理页面创建或加入</p>
              )}
            </div>

            <button type="submit" disabled={loading}
              className="w-full py-3 bg-gradient-to-r from-primary to-cyan-400 text-white font-semibold rounded-lg hover:shadow-lg hover:shadow-primary/25 transition-all disabled:opacity-50 flex items-center justify-center space-x-2">
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <UserPlus className="w-5 h-5" />}
              <span>注 册</span>
            </button>
            <p className="text-center text-gray-500 text-xs">注册即表示同意平台使用条款</p>
          </form>
        )}

        <p className="text-center text-gray-600 text-xs mt-6">
          SecGuard Sentinel v2.4 &middot; Powered by OWASP BLT
        </p>
      </div>
    </div>
  );
}
