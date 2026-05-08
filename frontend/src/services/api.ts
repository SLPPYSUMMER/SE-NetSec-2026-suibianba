const API_BASE = '/api/secguard';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    credentials: 'include',
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || err.message || `HTTP ${res.status}`);
  }
  return res.json();
}

export const authApi = {
  login: (username: string, password: string) =>
    request<{ success: boolean; message: string; user_id: number; username: string; is_staff: boolean }>('/auth/login', {
      method: 'POST', body: JSON.stringify({ username, password }),
    }),
  logout: () => request<{ success: boolean }>('/auth/logout', { method: 'POST' }),
  me: () => request<{ id: number; username: string; email: string; is_staff: boolean }>('/auth/me'),
  check: () => request<{ authenticated: boolean; user_id: number | null; username: string | null; is_staff: boolean }>('/auth/check'),
};

export const reportApi = {
  list: (params?: Record<string, string | number>) => {
    const qs = new URLSearchParams(params as Record<string, string>).toString();
    return request<any[]>(`/reports${qs ? `?${qs}` : ''}`);
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
