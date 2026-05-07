'use client';

import { useState } from 'react';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import {
  Share2,
  Bookmark,
  Clock,
  AlertTriangle,
  Shield,
  FileText,
  Download,
  CheckCircle2,
  User,
  Calendar,
  MessageSquare,
} from 'lucide-react';

export default function VulnerabilityDetailPage() {
  const [activeTab, setActiveTab] = useState('description');

  return (
    <div className="min-h-screen bg-dark-bg">
      <Sidebar />
      <div className="ml-64">
        <Header />

        <main className="p-6 space-y-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-3 text-sm text-gray-400">
              <span>首页</span>
              <span>/</span>
              <span>漏洞管理</span>
              <span>/</span>
              <span className="text-white">漏洞详情</span>
            </div>
          </div>

          <div className="bg-dark-card border border-dark-border rounded-xl p-6">
            <div className="flex items-start justify-between mb-6">
              <div className="flex-1">
                <div className="flex items-center space-x-3 mb-3">
                  <span className="px-3 py-1 bg-primary/10 text-primary rounded-full text-xs font-mono font-medium">
                    VUL-2024-081-001
                  </span>
                  <span className="px-3 py-1 bg-red-500/10 text-red-500 rounded-full text-xs font-bold uppercase flex items-center space-x-1">
                    <AlertTriangle className="w-3 h-3" />
                    <span>Critical</span>
                  </span>
                </div>
                <h1 className="text-3xl font-bold text-white mb-2">
                  核心认证组件拒绝服务漏洞 (RCE)
                </h1>
              </div>

              <div className="flex items-center space-x-3">
                <button className="p-2.5 text-gray-400 hover:text-white hover:bg-dark-hover rounded-lg transition-colors">
                  <Share2 className="w-5 h-5" />
                </button>
                <button className="px-4 py-2.5 bg-dark-bg border border-dark-border rounded-lg text-sm text-gray-300 hover:bg-dark-hover transition-all flex items-center space-x-2">
                  <Bookmark className="w-4 h-4" />
                  <span>导出报告</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-6">
                <div className="bg-dark-bg rounded-lg p-6 border border-dark-border">
                  <div className="flex items-center space-x-2 mb-4">
                    <FileText className="w-5 h-5 text-primary" />
                    <h3 className="text-lg font-semibold text-white">漏洞描述</h3>
                  </div>
                  <div className="prose prose-invert max-w-none">
                    <p className="text-gray-300 leading-relaxed">
                      该漏洞存在于核心认证组件的会话处理逻辑中，由于未正确处理超大规模请求导致内存耗尽，
                      攻击者可通过发送特制的HTTP请求触发拒绝服务（DoS）攻击。
                    </p>
                    <ul className="mt-4 space-y-2 text-gray-400">
                      <li className="flex items-start space-x-2">
                        <CheckCircle2 className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                        <span>Auth-Core-Service 版本 2.4.0 至 2.5.8 受影响</span>
                      </li>
                      <li className="flex items-start space-x-2">
                        <CheckCircle2 className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                        <span>生产环境已部署至集群（WebUI）</span>
                      </li>
                      <li className="flex items-start space-x-2">
                        <CheckCircle2 className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                        <span>所有暴露了 OAuth2.0 接口认证的内部网关</span>
                      </li>
                    </ul>
                  </div>
                </div>

                <div className="bg-dark-bg rounded-lg p-6 border border-dark-border">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-2">
                      <FileText className="w-5 h-5 text-yellow-500" />
                      <h3 className="text-lg font-semibold text-white">复现步骤 (POC)</h3>
                    </div>
                    <span className="text-xs text-gray-500 px-2 py-1 bg-dark-card rounded">
                      LANGUAGE: PYTHON 3.x
                    </span>
                  </div>
                  <pre className="bg-black/50 rounded-lg p-4 overflow-x-auto text-sm">
                    <code className="text-green-400">{`import requests
import json

target = "https://core-auth.prod.internal/api/v2/login"
payload = {
  "username": "admin",
  "password": "admin",
  "remember": True,
  "payload": "massive_payload"
}

try:
  response = requests.post(target, json=payload, timeout=5)
  print(f"Status: {response.status_code}")
except requests.exceptions.Timeout:
  print("Service unresponsive - Potential vulnerability confirmed")`}</code>
                  </pre>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div className="bg-dark-bg rounded-lg p-6 border border-dark-border">
                    <div className="flex items-center space-x-2 mb-4">
                      <Shield className="w-5 h-5 text-cyan-500" />
                      <h3 className="text-lg font-semibold text-white">修复建议</h3>
                    </div>
                    <div className="space-y-3">
                      <div>
                        <h4 className="text-sm font-medium text-white mb-2">升级版本</h4>
                        <p className="text-sm text-gray-400">
                          升级 Auth-Core-Service 至最新版 v2.6.0 或更高版本
                        </p>
                      </div>
                      <div>
                        <h4 className="text-sm font-medium text-white mb-2">临时缓解</h4>
                        <p className="text-sm text-gray-400">
                          在网关层增加速率限制策略，限制 JSON 请求体不超过 1MB
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-dark-bg rounded-lg p-6 border border-dark-border">
                    <div className="flex items-center space-x-2 mb-4">
                      <FileText className="w-5 h-5 text-orange-500" />
                      <h3 className="text-lg font-semibold text-white">附件区</h3>
                    </div>
                    <div className="border-2 border-dashed border-dark-border rounded-lg p-8 text-center hover:border-primary/50 transition-colors cursor-pointer group">
                      <Download className="w-12 h-12 text-gray-600 mx-auto mb-3 group-hover:text-primary transition-colors" />
                      <p className="text-sm text-gray-400 mb-1">POC_exploit.py</p>
                      <p className="text-xs text-gray-600">点击或拖拽文件至此处上传</p>
                    </div>
                  </div>
                </div>

                <div className="bg-dark-bg rounded-lg p-6 border border-dark-border">
                  <h3 className="text-lg font-semibold text-white mb-4">处理轨迹</h3>
                  <div className="space-y-4">
                    {[
                      {
                        user: '漏洞组',
                        role: '管理员',
                        action:
                          '漏洞已确认，任务分派给安全团队，优先级设置为 高危。',
                        time: '2024-05-18 09:23',
                        color: 'bg-red-500',
                      },
                      {
                        user: '张景瑞',
                        role: '开发人员',
                        action:
                          '已提交修复方案，修改方案见 JSON 提交记录之新增了限流计数器。PR #4302 已开启。',
                        time: '2024-05-18 14:15',
                        color: 'bg-blue-500',
                      },
                      {
                        user: '测试人员',
                        role: '',
                        action:
                          '复现中：在 staging 环境下模拟大规模流量进行验证和性能测试...',
                        time: '2024-05-19 08:30',
                        color: 'bg-yellow-500',
                      },
                    ].map((item, index) => (
                      <div key={index} className="flex space-x-4">
                        <div className="flex-shrink-0">
                          <div
                            className={`w-10 h-10 ${item.color} rounded-full flex items-center justify-center`}
                          >
                            <User className="w-5 h-5 text-white" />
                          </div>
                        </div>
                        <div className="flex-1 pb-4 border-l-2 border-dark-border pl-4 -ml-5">
                          <div className="flex items-center space-x-2 mb-1">
                            <span className="text-sm font-medium text-white">
                              {item.user}
                            </span>
                            {item.role && (
                              <span className="text-xs text-gray-500">
                                ({item.role})
                              </span>
                            )}
                            <span className="text-xs text-gray-600 ml-auto">
                              {item.time}
                            </span>
                          </div>
                          <p className="text-sm text-gray-400">{item.action}</p>
                          {index === 1 && (
                            <button className="mt-2 text-xs text-primary hover:text-cyan-400 flex items-center space-x-1">
                              <MessageSquare className="w-3 h-3" />
                              <span>查看提交文档</span>
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <div className="bg-dark-bg rounded-lg p-6 border border-dark-border sticky top-24">
                  <h3 className="text-lg font-semibold text-white mb-4">流程状态</h3>
                  <div className="space-y-3">
                    {[
                      { label: '漏洞发现', status: 'completed' },
                      { label: '待审核', status: 'current' },
                      { label: '待修复', status: 'pending' },
                      { label: '关闭归档', status: 'pending' },
                    ].map((step, index) => (
                      <div key={index} className="flex items-center space-x-3">
                        <div
                          className={`w-3 h-3 rounded-full ${
                            step.status === 'completed'
                              ? 'bg-green-500'
                              : step.status === 'current'
                              ? 'bg-primary ring-4 ring-primary/20'
                              : 'bg-gray-700'
                          }`}
                        ></div>
                        <span
                          className={`text-sm ${
                            step.status === 'completed'
                              ? 'text-green-400'
                              : step.status === 'current'
                              ? 'text-white font-medium'
                              : 'text-gray-500'
                          }`}
                        >
                          {step.label}
                        </span>
                      </div>
                    ))}
                  </div>

                  <button className="w-full mt-6 py-3 bg-gradient-to-r from-primary to-cyan-400 text-white font-medium rounded-lg hover:shadow-lg hover:shadow-primary/25 transition-all">
                    提交修复
                  </button>

                  <div className="mt-6 pt-6 border-t border-dark-border space-y-4">
                    <div>
                      <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
                        漏洞等级
                      </h4>
                      <div className="flex items-center space-x-2">
                        <AlertTriangle className="w-5 h-5 text-red-500" />
                        <span className="text-2xl font-bold text-red-500">
                          CRITICAL
                        </span>
                      </div>
                    </div>

                    <div>
                      <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
                        负责人 / 报告人
                      </h4>
                      <div className="space-y-2">
                        <div className="flex items-center space-x-2">
                          <User className="w-4 h-4 text-gray-500" />
                          <span className="text-sm text-gray-300">
                            核心门户组
                          </span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Shield className="w-4 h-4 text-gray-500" />
                          <span className="text-sm text-gray-300">张景瑞</span>
                        </div>
                      </div>
                    </div>

                    <div>
                      <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
                        检测来源时间
                      </h4>
                      <div className="flex items-center space-x-2">
                        <Clock className="w-5 h-5 text-yellow-500" />
                        <span className="text-2xl font-bold text-yellow-500">
                          23:16:42
                        </span>
                      </div>
                      <p className="text-xs text-gray-600 mt-1">
                        DETECTED: 2024-05-17 16:30:00
                      </p>
                    </div>

                    <div className="pt-4 border-t border-dark-border">
                      <div className="flex items-start space-x-2">
                        <div className="w-2 h-2 bg-primary rounded-full mt-1.5"></div>
                        <div>
                          <h4 className="text-sm font-medium text-white mb-1">
                            最新动态
                          </h4>
                          <p className="text-xs text-gray-400 leading-relaxed">
                            该漏洞为严重级别核心认证组件拒绝服务漏洞（RCE），
                            当前状态为待修复阶段。建议在72小时内完成紧急修复方案。
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
