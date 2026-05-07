'use client';

import { useState } from 'react';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import {
  Search,
  Filter,
  Plus,
  Server,
  Globe,
  Database,
  Cloud,
  Monitor,
  Smartphone,
  MoreVertical,
  Edit,
  Trash2,
  Eye,
  Download,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
} from 'lucide-react';

const assets = [
  {
    id: 'AST-001',
    name: 'auth-prod-v2-internal',
    type: '服务器',
    icon: Server,
    ip: '192.168.1.100',
    status: '在线',
    statusColor: 'text-green-400',
    vulnerabilities: 3,
    lastScan: '2024-05-18',
    criticality: '高',
    criticalityColor: 'bg-red-500/20 text-red-400 border-red-500/30',
  },
  {
    id: 'AST-002',
    name: 'web-portal-public',
    type: 'Web应用',
    icon: Globe,
    url: 'https://portal.example.com',
    status: '在线',
    statusColor: 'text-green-400',
    vulnerabilities: 7,
    lastScan: '2024-05-17',
    criticality: '关键',
    criticalityColor: 'bg-red-500/20 text-red-400 border-red-500/30',
  },
  {
    id: 'AST-003',
    name: 'db-master-cluster',
    type: '数据库',
    icon: Database,
    ip: '10.0.0.50',
    status: '在线',
    statusColor: 'text-green-400',
    vulnerabilities: 2,
    lastScan: '2024-05-16',
    criticality: '高',
    criticalityColor: 'bg-red-500/20 text-red-400 border-red-500/30',
  },
  {
    id: 'AST-004',
    name: 'api-gateway-prod',
    type: 'API服务',
    icon: Cloud,
    url: 'https://api.example.com',
    status: '警告',
    statusColor: 'text-yellow-400',
    vulnerabilities: 12,
    lastScan: '2024-05-15',
    criticality: '关键',
    criticalityColor: 'bg-red-500/20 text-red-400 border-red-500/30',
  },
  {
    id: 'AST-005',
    name: 'monitoring-dashboard',
    type: 'Web应用',
    icon: Monitor,
    url: 'https://monitor.example.com',
    status: '离线',
    statusColor: 'text-red-400',
    vulnerabilities: 0,
    lastScan: '2024-05-10',
    criticality: '中',
    criticalityColor: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  },
  {
    id: 'AST-006',
    name: 'mobile-app-backend',
    type: 'API服务',
    icon: Smartphone,
    url: 'https://mapi.example.com',
    status: '在线',
    statusColor: 'text-green-400',
    vulnerabilities: 5,
    lastScan: '2024-05-14',
    criticality: '中',
    criticalityColor: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  },
];

const assetTypes = ['全部', '服务器', 'Web应用', '数据库', 'API服务'];
const statuses = ['全部', '在线', '警告', '离线'];

export default function AssetsPage() {
  const [selectedType, setSelectedType] = useState('全部');
  const [selectedStatus, setSelectedStatus] = useState('全部');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredAssets = assets.filter((asset) => {
    const matchesType = selectedType === '全部' || asset.type === selectedType;
    const matchesStatus = selectedStatus === '全部' || asset.status === selectedStatus;
    const matchesSearch =
      asset.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      asset.id.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesType && matchesStatus && matchesSearch;
  });

  return (
    <div className="min-h-screen bg-dark-bg">
      <Sidebar />
      <div className="ml-64">
        <Header title="资产管理" />

        <main className="p-6">
          {/* 统计卡片 */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div className="bg-dark-card rounded-xl p-6 border border-dark-border">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-400 mb-1">总资产数</p>
                  <p className="text-3xl font-bold text-white">{assets.length}</p>
                </div>
                <div className="w-12 h-12 bg-primary/20 rounded-lg flex items-center justify-center">
                  <Server className="w-6 h-6 text-primary" />
                </div>
              </div>
            </div>

            <div className="bg-dark-card rounded-xl p-6 border border-dark-border">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-400 mb-1">在线资产</p>
                  <p className="text-3xl font-bold text-green-400">
                    {assets.filter((a) => a.status === '在线').length}
                  </p>
                </div>
                <div className="w-12 h-12 bg-green-500/20 rounded-lg flex items-center justify-center">
                  <CheckCircle className="w-6 h-6 text-green-400" />
                </div>
              </div>
            </div>

            <div className="bg-dark-card rounded-xl p-6 border border-dark-border">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-400 mb-1">存在漏洞</p>
                  <p className="text-3xl font-bold text-yellow-400">
                    {assets.filter((a) => a.vulnerabilities > 0).length}
                  </p>
                </div>
                <div className="w-12 h-12 bg-yellow-500/20 rounded-lg flex items-center justify-center">
                  <AlertTriangle className="w-6 h-6 text-yellow-400" />
                </div>
              </div>
            </div>

            <div className="bg-dark-card rounded-xl p-6 border border-dark-border">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-400 mb-1">高危资产</p>
                  <p className="text-3xl font-bold text-red-400">
                    {assets.filter(
                      (a) => a.criticality === '关键' || a.criticality === '高'
                    ).length}
                  </p>
                </div>
                <div className="w-12 h-12 bg-red-500/20 rounded-lg flex items-center justify-center">
                  <XCircle className="w-6 h-6 text-red-400" />
                </div>
              </div>
            </div>
          </div>

          {/* 操作栏 */}
          <div className="bg-dark-card rounded-xl border border-dark-border p-4 mb-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input
                    type="text"
                    placeholder="搜索资产名称或ID..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 pr-4 py-2 bg-dark-bg border border-dark-border rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-primary w-80"
                  />
                </div>

                <select
                  value={selectedType}
                  onChange={(e) => setSelectedType(e.target.value)}
                  className="px-4 py-2 bg-dark-bg border border-dark-border rounded-lg text-sm text-white focus:outline-none focus:border-primary"
                >
                  {assetTypes.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>

                <select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                  className="px-4 py-2 bg-dark-bg border border-dark-border rounded-lg text-sm text-white focus:outline-none focus:border-primary"
                >
                  {statuses.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center space-x-3">
                <button className="flex items-center space-x-2 px-4 py-2 bg-dark-hover text-white rounded-lg hover:bg-primary transition-colors">
                  <RefreshCw className="w-4 h-4" />
                  <span className="text-sm">同步资产</span>
                </button>
                <button className="flex items-center space-x-2 px-4 py-2 bg-dark-hover text-white rounded-lg hover:bg-primary transition-colors">
                  <Download className="w-4 h-4" />
                  <span className="text-sm">导出</span>
                </button>
                <button className="flex items-center space-x-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors">
                  <Plus className="w-4 h-4" />
                  <span className="text-sm">添加资产</span>
                </button>
              </div>
            </div>
          </div>

          {/* 资产列表 */}
          <div className="bg-dark-card rounded-xl border border-dark-border overflow-hidden">
            <table className="w-full">
              <thead className="bg-dark-bg/50">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    资产信息
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    类型
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    状态
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    漏洞数
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    重要性
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    最后扫描
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-border">
                {filteredAssets.map((asset) => (
                  <tr key={asset.id} className="hover:bg-dark-hover/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-primary/20 rounded-lg flex items-center justify-center">
                          <asset.icon className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-white">{asset.name}</p>
                          <p className="text-xs text-gray-500">{asset.id}</p>
                          {(asset.ip || asset.url) && (
                            <p className="text-xs text-gray-600 mt-0.5">
                              {asset.ip || asset.url}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/20 text-blue-400">
                        {asset.type}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center space-x-1 ${asset.statusColor}`}>
                        {asset.status === '在线' && <CheckCircle className="w-4 h-4" />}
                        {asset.status === '警告' && <AlertTriangle className="w-4 h-4" />}
                        {asset.status === '离线' && <XCircle className="w-4 h-4" />}
                        <span className="text-sm">{asset.status}</span>
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {asset.vulnerabilities > 0 ? (
                        <span className={`text-sm font-bold ${
                          asset.vulnerabilities >= 10
                            ? 'text-red-400'
                            : asset.vulnerabilities >= 5
                            ? 'text-yellow-400'
                            : 'text-green-400'
                        }`}>
                          {asset.vulnerabilities}
                        </span>
                      ) : (
                        <span className="text-sm text-gray-500">--</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${asset.criticalityColor}`}
                      >
                        {asset.criticality}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center space-x-2 text-sm text-gray-400">
                        <Clock className="w-4 h-4" />
                        <span>{asset.lastScan}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center space-x-2">
                        <button className="p-2 text-gray-400 hover:text-primary hover:bg-dark-hover rounded-lg transition-colors">
                          <Eye className="w-4 h-4" />
                        </button>
                        <button className="p-2 text-gray-400 hover:text-green-400 hover:bg-dark-hover rounded-lg transition-colors">
                          <Edit className="w-4 h-4" />
                        </button>
                        <button className="p-2 text-gray-400 hover:text-cyan-400 hover:bg-dark-hover rounded-lg transition-colors">
                          <RefreshCw className="w-4 h-4" />
                        </button>
                        <button className="p-2 text-gray-400 hover:text-red-400 hover:bg-dark-hover rounded-lg transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {filteredAssets.length === 0 && (
              <div className="text-center py-12">
                <p className="text-gray-500">未找到匹配的资产</p>
              </div>
            )}
          </div>

          {/* 分页 */}
          <div className="mt-6 flex items-center justify-between">
            <p className="text-sm text-gray-400">
              显示 {filteredAssets.length} 个资产，共 {assets.length} 个
            </p>
            <div className="flex items-center space-x-2">
              <button className="px-3 py-1.5 bg-dark-hover text-gray-400 rounded-lg hover:text-white disabled:opacity-50">
                上一页
              </button>
              <button className="px-3 py-1.5 bg-primary text-white rounded-lg">1</button>
              <button className="px-3 py-1.5 bg-dark-hover text-gray-400 rounded-lg hover:text-white">
                下一页
              </button>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
