'use client';

import { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import { assetsApi } from '@/services/api';
import { Search, Filter, Plus, Server, Globe, Database, Cloud, Monitor, Smartphone, MoreVertical, Edit, Trash2, Eye, Download, RefreshCw, AlertTriangle, CheckCircle, XCircle, Clock, Loader2 } from 'lucide-react';

const assetTypes = ['全部', 'web_app'];
const statuses = ['全部', 'online', 'unknown'];

export default function AssetsPage() {
  const [assets, setAssets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedType, setSelectedType] = useState('全部');
  const [selectedStatus, setSelectedStatus] = useState('全部');
  const [searchQuery, setSearchQuery] = useState('');

  const fetchAssets = async () => {
    setLoading(true);
    try {
      const data = await assetsApi.list();
      setAssets(Array.isArray(data.items) ? data.items : []);
    } catch {} finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAssets(); }, []);

  const filteredAssets = assets.filter((asset) => {
    const matchesType = selectedType === '全部' || asset.type === selectedType;
    const matchesStatus = selectedStatus === '全部' || asset.status === selectedStatus;
    const matchesSearch = asset.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      String(asset.id).includes(searchQuery);
    return matchesType && matchesStatus && matchesSearch;
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-dark-bg">
        <Sidebar />
        <div className="ml-64"><Header title="资产管理" />
          <div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="w-8 h-8 text-primary animate-spin" /></div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-dark-bg">
      <Sidebar />
      <div className="ml-64">
        <Header title="资产管理" />
        <main className="p-6">
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
                  <p className="text-3xl font-bold text-green-400">{assets.filter(a => a.status === 'online').length}</p>
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
                  <p className="text-3xl font-bold text-yellow-400">{assets.filter(a => a.vulnerabilities > 0).length}</p>
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
                  <p className="text-3xl font-bold text-red-400">{assets.filter(a => a.criticality === 'high').length}</p>
                </div>
                <div className="w-12 h-12 bg-red-500/20 rounded-lg flex items-center justify-center">
                  <XCircle className="w-6 h-6 text-red-400" />
                </div>
              </div>
            </div>
          </div>

          <div className="bg-dark-card rounded-xl border border-dark-border p-4 mb-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input type="text" placeholder="搜索资产名称或URL..." value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 pr-4 py-2 bg-dark-bg border border-dark-border rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-primary w-80" />
                </div>
                <select value={selectedType} onChange={(e) => setSelectedType(e.target.value)}
                  className="px-4 py-2 bg-dark-bg border border-dark-border rounded-lg text-sm text-white focus:outline-none focus:border-primary">
                  {assetTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
                <select value={selectedStatus} onChange={(e) => setSelectedStatus(e.target.value)}
                  className="px-4 py-2 bg-dark-bg border border-dark-border rounded-lg text-sm text-white focus:outline-none focus:border-primary">
                  {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="flex items-center space-x-3">
                <button onClick={fetchAssets} className="flex items-center space-x-2 px-4 py-2 bg-dark-hover text-white rounded-lg hover:bg-primary transition-colors">
                  <RefreshCw className="w-4 h-4" /><span className="text-sm">刷新</span>
                </button>
              </div>
            </div>
          </div>

          <div className="bg-dark-card rounded-xl border border-dark-border overflow-hidden">
            <table className="w-full">
              <thead className="bg-dark-bg/50">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">资产信息</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">类型</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">状态</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">漏洞数</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">重要性</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">最后扫描</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-border">
                {filteredAssets.length === 0 ? (
                  <tr><td colSpan={6} className="px-6 py-12 text-center text-gray-500">暂无资产数据</td></tr>
                ) : filteredAssets.map((asset) => (
                  <tr key={asset.id} className="hover:bg-dark-hover/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-primary/20 rounded-lg flex items-center justify-center">
                          <Globe className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-white truncate max-w-xs">{asset.name}</p>
                          <p className="text-xs text-gray-500">ID: {asset.id}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/20 text-blue-400">Web应用</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center space-x-1 ${asset.status === 'online' ? 'text-green-400' : 'text-gray-400'}`}>
                        {asset.status === 'online' ? <CheckCircle className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
                        <span className="text-sm">{asset.status === 'online' ? '在线' : '未知'}</span>
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {asset.vulnerabilities > 0 ? (
                        <span className={`text-sm font-bold ${asset.vulnerabilities >= 10 ? 'text-red-400' : asset.vulnerabilities >= 5 ? 'text-yellow-400' : 'text-green-400'}`}>
                          {asset.vulnerabilities}
                        </span>
                      ) : <span className="text-sm text-gray-500">--</span>}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                        asset.criticality === 'high' ? 'bg-red-500/20 text-red-400 border-red-500/30' :
                        asset.criticality === 'medium' ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' :
                        'bg-green-500/20 text-green-400 border-green-500/30'
                      }`}>
                        {asset.criticality === 'high' ? '高' : asset.criticality === 'medium' ? '中' : '低'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-gray-400">{asset.last_scan?.substring(0, 10) || '--'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </main>
      </div>
    </div>
  );
}
