import { LucideIcon } from 'lucide-react';
import { ComponentType } from 'react';

export interface Vulnerability {
  id: string;
  title: string;
  description: string;
  severity: '关键' | '高' | '中' | '低';
  severityColor: string;
  status: '待分派' | '处理中' | '已修复' | '已验证' | '忽略';
  statusColor: string;
  assignee: string;
  date: string;
}

export interface Asset {
  id: string;
  name: string;
  type: '服务器' | 'Web应用' | '数据库' | 'API服务';
  icon: any;
  ip?: string;
  url?: string;
  status: '在线' | '警告' | '离线';
  statusColor: string;
  vulnerabilities: number;
  lastScan: string;
  criticality: '关键' | '高' | '中';
  criticalityColor: string;
}

export interface ScanTask {
  id: string;
  name: string;
  url: string;
  status: '运行中' | '已排队' | '已完成' | '失败';
  statusColor: string;
  progress: number;
  findings: number | string;
  lastRun: string;
}

export interface DashboardStats {
  title?: string;
  value: number | string;
  change: string;
  icon: LucideIcon;
  unit?: string;
  color?: string;
  bgColor?: string;
}

export interface VulnerabilityTrend {
  name: string;
  value: number;
  color?: string;
}

export interface RecentVulnerability {
  id: string;
  title: string;
  severity: string;
  severityColor?: string;
  assignee: string;
  date: string;
}

export interface TeamMember {
  id: number;
  name: string;
  email: string;
  role: string;
  roleColor?: string;
  lastActive: string;
  avatar: string;
}

export interface AuditLog {
  user: string;
  action: string;
  ip: string;
  time: string;
  icon?: ComponentType<any>;
  iconColor?: string;
}

export interface ReportChart {
  name: string;
  value: number;
}
