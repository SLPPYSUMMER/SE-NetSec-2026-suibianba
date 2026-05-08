const API_BASE = '/api/secguard';

const HTTP_MSG_MAP: Record<number, string> = {
  400: '请求参数有误，请检查输入内容',
  401: '登录已过期，请重新登录',
  403: '没有权限执行此操作',
  404: '请求的资源不存在',
  409: '数据冲突，请刷新后重试',
  422: '提交的数据格式不正确',
  429: '操作太频繁，请稍后重试',
  500: '服务器内部错误，请稍后重试',
  502: '服务器暂时不可用',
  503: '服务正在维护中',
};

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    credentials: 'include',
    ...options,
  });
  if (!res.ok) {
    let msg = HTTP_MSG_MAP[res.status] || `请求失败 (HTTP ${res.status})`;
    try {
      const err = await res.json();
      if (typeof err.detail === 'string') {
        msg = err.detail;
      } else if (Array.isArray(err.detail)) {
        const msgs = err.detail.map((e: any) => e.msg || JSON.stringify(e));
        msg = msgs.join('；');
      } else if (err.message && typeof err.message === 'string') {
        msg = err.message;
      } else if (err.detail && typeof err.detail === 'string') {
        msg = err.detail;
      }
    } catch {}
    throw new Error(msg);
  }
  return res.json();
}

export const authApi = {
  login: (username: string, password: string) =>
    request<{ success: boolean; message: string; user_id: number; username: string; is_staff: boolean }>('/auth/login', {
      method: 'POST', body: JSON.stringify({ username, password }),
    }),
  register: (data: { username: string; password: string; email?: string; team_action?: string; team_name?: string; team_id?: number }) =>
    request<{ success: boolean; message: string; user_id: number; username: string; is_staff: boolean }>('/auth/register', {
      method: 'POST', body: JSON.stringify(data),
    }),
  logout: () => request<{ success: boolean }>('/auth/logout', { method: 'POST' }),
  me: () => request<{ id: number; username: string; email: string; is_staff: boolean; team_id: number | null; team_name: string | null; role: string | null }>('/auth/me'),
  check: () => request<{ authenticated: boolean; user_id: number | null; username: string | null; is_staff: boolean; team_id: number | null; team_name: string | null; role: string | null }>('/auth/check'),
};

export const reportApi = {
  list: (params?: Record<string, string | number>) => {
    const qs = new URLSearchParams(params as Record<string, string>).toString();
    return request<{ items: any[]; total_count: number; page: number; per_page: number }>(`/reports${qs ? `?${qs}` : ''}`);
  },
  get: (vulnId: string) => request<any>(`/reports/${vulnId}`),
  create: (data: any) => request<any>('/reports', { method: 'POST', body: JSON.stringify(data) }),
  update: (vulnId: string, data: any) => request<any>(`/reports/${vulnId}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (vulnId: string) => request<{ success: boolean }>(`/reports/${vulnId}`, { method: 'DELETE' }),
  assign: (vulnId: string, assigneeId: number, comment?: string) =>
    request<any>(`/reports/${vulnId}/assign`, { method: 'POST', body: JSON.stringify({ assignee_id: assigneeId, comment }) }),
  transition: (vulnId: string, action: string, comment?: string) =>
    request<any>(`/reports/${vulnId}/transition`, { method: 'POST', body: JSON.stringify({ action, comment }) }),
  auditLogs: (vulnId: string) => request<any[]>(`/reports/${vulnId}/audit-logs`),
  checkDuplicate: (data: any) => request<any>('/reports/check-duplicate', { method: 'POST', body: JSON.stringify(data) }),
  export: (params?: Record<string, string>) =>
    request<any>('/reports-export', { method: 'POST', body: JSON.stringify(params || { format: 'pdf' }) }),
};

export const statsApi = {
  overview: () => request<any>('/statistics/overview'),
};

export const auditApi = {
  list: (params?: Record<string, string | number>) => {
    const qs = new URLSearchParams(params as Record<string, string>).toString();
    return request<any[]>(`/audit-logs${qs ? `?${qs}` : ''}`);
  },
};

export const SEVERITY_MAP: Record<string, { label: string; color: string; bg: string }> = {
  critical: { label: '极危', color: 'text-red-500', bg: 'bg-red-500' },
  high: { label: '高危', color: 'text-orange-500', bg: 'bg-orange-500' },
  medium: { label: '中危', color: 'text-yellow-500', bg: 'bg-yellow-500' },
  low: { label: '低危', color: 'text-green-500', bg: 'bg-green-500' },
};

export const STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending: { label: '待分派', color: 'text-red-400' },
  processing: { label: '处理中', color: 'text-yellow-400' },
  fixed: { label: '已修复', color: 'text-green-400' },
  reviewing: { label: '已复核', color: 'text-blue-400' },
  closed: { label: '已关闭', color: 'text-gray-400' },
};

export const scansApi = {
  list: (params?: Record<string, string | number>) => {
    const qs = new URLSearchParams(params as Record<string, string>).toString();
    return request<{ items: any[]; total_count: number; page: number; per_page: number }>(`/scans${qs ? `?${qs}` : ''}`);
  },
  create: (data: { target: string; scanner_type: string }) =>
    request<any>('/scans', { method: 'POST', body: JSON.stringify(data) }),
};

export const assetsApi = {
  list: () => request<{ items: any[]; total_count: number }>('/assets'),
};

export const teamsApi = {
  list: (search?: string) => {
    const qs = search ? `?search=${encodeURIComponent(search)}` : '';
    return request<{ items: { id: number; name: string; member_count: number; admin_name: string }[] }>(`/teams${qs}`);
  },
  members: () => request<{ items: any[]; team_id: number; team_name: string }>('/teams/members'),
  pending: () => request<{ items: any[] }>('/teams/pending'),
  handleMember: (memberId: number, data: { action: string; role?: string }) =>
    request<any>(`/teams/members/${memberId}/handle`, { method: 'POST', body: JSON.stringify(data) }),
  invite: (username: string) =>
    request<any>('/teams/invite', { method: 'POST', body: JSON.stringify({ username }) }),
};
