'use client';

import { useState } from 'react';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import {
  AlertTriangle,
  AlertCircle,
  Info,
  Bold,
  Italic,
  Link,
  Image,
  Code,
  List,
  Quote,
  Upload,
  Save,
  Send,
  Eye,
} from 'lucide-react';

export default function ReportVulnerabilityPage() {
  const [formData, setFormData] = useState({
    title: '',
    category: '',
    severity: '',
    description: '',
    poc: '',
    attachments: [],
  });

  return (
    <div className="min-h-screen bg-dark-bg">
      <Sidebar />
      <div className="ml-64">
        <Header />

        <main className="p-6 space-y-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold text-white">上报新漏洞报告</h1>
              <p className="text-sm text-gray-400 mt-1">
                请尽可能详尽地填写漏洞信息，以帮助安全团队快速定位与修复。
              </p>
            </div>
          </div>

          <div className="max-w-4xl mx-auto bg-dark-card border border-dark-border rounded-xl p-8 space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                漏洞标题
              </label>
              <input
                type="text"
                placeholder="请输入漏洞标题..."
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="w-full px-4 py-3 bg-dark-bg border border-dark-border rounded-lg text-white placeholder-gray-600 focus:outline-none focus:border-primary transition-colors"
              />
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  漏洞分类
                </label>
                <select
                  value={formData.category}
                  onChange={(e) =>
                    setFormData({ ...formData, category: e.target.value })
                  }
                  className="w-full px-4 py-3 bg-dark-bg border border-dark-border rounded-lg text-white focus:outline-none focus:border-primary cursor-pointer"
                >
                  <option value="">请选择分类</option>
                  <option value="web">Web 安全</option>
                  <option value="network">网络安全</option>
                  <option value="system">系统安全</option>
                  <option value="application">应用安全</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  严重程度
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    {
                      value: 'critical',
                      label: '极危',
                      icon: AlertTriangle,
                      color: 'bg-red-500/10 border-red-500/50 text-red-500 hover:bg-red-500/20',
                    },
                    {
                      value: 'high',
                      label: '高危',
                      icon: AlertTriangle,
                      color: 'bg-orange-500/10 border-orange-500/50 text-orange-500 hover:bg-orange-500/20',
                    },
                    {
                      value: 'medium',
                      label: '中危',
                      icon: AlertCircle,
                      color: 'bg-yellow-500/10 border-yellow-500/50 text-yellow-500 hover:bg-yellow-500/20',
                    },
                    {
                      value: 'low',
                      label: '低危',
                      icon: Info,
                      color: 'bg-gray-500/10 border-gray-500/50 text-gray-400 hover:bg-gray-500/20',
                    },
                  ].map((item) => (
                    <button
                      key={item.value}
                      onClick={() =>
                        setFormData({ ...formData, severity: item.value })
                      }
                      className={`px-4 py-3 rounded-lg border flex flex-col items-center justify-center space-y-1 transition-all ${
                        formData.severity === item.value
                          ? item.color.replace('hover:', '')
                          : 'bg-dark-bg border-dark-border text-gray-500 hover:border-gray-600'
                      }`}
                    >
                      <item.icon className="w-5 h-5" />
                      <span className="text-xs font-medium">{item.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-300">
                  漏洞详情 & 复现步骤
                </label>
                <button className="text-xs text-primary hover:text-cyan-400 flex items-center space-x-1 transition-colors">
                  <Eye className="w-3 h-3" />
                  <span>MARKDOWN 实时预览</span>
                </button>
              </div>

              <div className="border border-dark-border rounded-lg overflow-hidden">
                <div className="flex items-center space-x-1 p-3 bg-dark-bg border-b border-dark-border">
                  <button className="p-2 text-gray-400 hover:text-white hover:bg-dark-hover rounded transition-colors">
                    <Bold className="w-4 h-4" />
                  </button>
                  <button className="p-2 text-gray-400 hover:text-white hover:bg-dark-hover rounded transition-colors">
                    <Italic className="w-4 h-4" />
                  </button>
                  <button className="p-2 text-gray-400 hover:text-white hover:bg-dark-hover rounded transition-colors">
                    <Link className="w-4 h-4" />
                  </button>
                  <button className="p-2 text-gray-400 hover:text-white hover:bg-dark-hover rounded transition-colors" aria-label="插入图片">
                    <Image className="w-4 h-4" />
                  </button>
                  <button className="p-2 text-gray-400 hover:text-white hover:bg-dark-hover rounded transition-colors">
                    <Code className="w-4 h-4" />
                  </button>
                  <button className="p-2 text-gray-400 hover:text-white hover:bg-dark-hover rounded transition-colors">
                    <List className="w-4 h-4" />
                  </button>
                  <button className="p-2 text-gray-400 hover:text-white hover:bg-dark-hover rounded transition-colors">
                    <Quote className="w-4 h-4" />
                  </button>
                </div>

                <textarea
                  placeholder={`### 漏洞详情\n\n请输入关于漏洞的详细技术描述...\n\n### 复现步骤\n\n1. 访问受影响的URL...\n2. 在参数处输入 Payload...`}
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  rows={12}
                  className="w-full px-4 py-3 bg-transparent text-white placeholder-gray-600 focus:outline-none resize-none"
                ></textarea>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-6">
                <div className="bg-dark-bg rounded-lg p-4 border border-dark-border">
                  <h4 className="text-sm font-medium text-white mb-3">漏洞详情</h4>
                  <div className="prose prose-invert prose-sm max-w-none">
                    <p className="text-gray-400 text-sm leading-relaxed">
                      预览区域将实时显示您的 Markdown 渲染效果。
                      您可以使用在线编辑器 Playground:
                    </p>
                    <pre className="mt-3 bg-black/50 rounded p-3 text-xs text-green-400 overflow-x-auto">
                      &lt;script&gt;alert(&apos;XSS POC&apos;);&lt;/script&gt;
                    </pre>
                  </div>
                </div>

                <div className="bg-dark-bg rounded-lg p-4 border border-dark-border">
                  <h4 className="text-sm font-medium text-white mb-3">复现步骤</h4>
                  <textarea
                    placeholder="等待输入..."
                    rows={5}
                    className="w-full bg-transparent text-gray-400 text-sm placeholder-gray-600 focus:outline-none resize-none"
                  ></textarea>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                附件上传 (POC / 截图)
              </label>
              <div className="border-2 border-dashed border-dark-border rounded-lg p-12 text-center hover:border-primary/50 transition-colors cursor-pointer group">
                <Upload className="w-16 h-16 text-gray-600 mx-auto mb-4 group-hover:text-primary transition-colors" />
                <p className="text-gray-300 mb-2">点击或拖拽 POC 脚本 / 数据至此处</p>
                <p className="text-xs text-gray-600">
                  支持格式: ZIP, PDF, PY, JPG, GIF (MAX 50MB)
                </p>
                <div className="mt-4 max-w-md mx-auto">
                  <div className="flex items-center justify-between px-3 py-2 bg-dark-bg rounded border border-dark-border">
                    <span className="text-sm text-gray-300 truncate">POC_exploit.zip</span>
                    <span className="text-xs text-green-400 ml-2">88%</span>
                  </div>
                  <div className="mt-2 w-full bg-dark-border rounded-full h-1.5 overflow-hidden">
                    <div className="bg-gradient-to-r from-primary to-cyan-400 h-full" style={{ width: '88%' }}></div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-6 border-t border-dark-border">
              <button className="px-6 py-3 bg-dark-bg border border-dark-border rounded-lg text-gray-300 hover:bg-dark-hover hover:border-gray-600 transition-all flex items-center space-x-2">
                <Save className="w-4 h-4" />
                <span>保存到草稿</span>
              </button>
              <button className="px-8 py-3 bg-gradient-to-r from-primary to-cyan-400 text-white font-semibold rounded-lg hover:shadow-lg hover:shadow-primary/25 transform hover:scale-[1.02] transition-all flex items-center space-x-2">
                <Send className="w-5 h-5" />
                <span>提交漏洞报告</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-6 max-w-4xl mx-auto mt-8">
            <div className="bg-dark-card border border-dark-border rounded-lg p-6 text-center">
              <div className="text-3xl font-bold text-white mb-1">1,248</div>
              <div className="text-xs text-gray-500">已提交数量</div>
            </div>
            <div className="bg-dark-card border border-dark-border rounded-lg p-6 text-center">
              <div className="text-3xl font-bold text-white mb-1">2.4h</div>
              <div className="text-xs text-gray-500">平均响应时间</div>
            </div>
            <div className="bg-dark-card border border-dark-border rounded-lg p-6 text-center">
              <div className="text-3xl font-bold text-white mb-1">98.2%</div>
              <div className="text-xs text-gray-500">修复完成率</div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
