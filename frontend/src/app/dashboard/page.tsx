'use client';

import { useState } from 'react';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import {
  mockDashboardStats,
  mockVulnerabilityData,
  mockTrendData,
  mockRecentVulnerabilities,
} from '@/services/mockData';
import {
  ShieldCheck,
  AlertTriangle,
  CheckCircle,
  Clock,
  TrendingUp,
  ArrowRight,
  ExternalLink,
  Plus,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-dark-bg">
      <Sidebar />
      <div className="ml-64">
        <Header title="安全概览" />

        <main className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div></div>
            <button className="px-6 py-2.5 bg-gradient-to-r from-primary to-cyan-400 text-white font-medium rounded-lg hover:shadow-lg hover:shadow-primary/25 transition-all flex items-center space-x-2">
              <span>开启全量扫描</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {mockDashboardStats.map((stat, index) => (
              <div
                key={index}
                className="bg-dark-card border border-dark-border rounded-xl p-6 hover:border-primary/50 transition-all group"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className={`p-3 rounded-lg ${stat.bgColor}`}>
                    <stat.icon className={`w-6 h-6 ${stat.color}`} />
                  </div>
                  {stat.change && (
                    <span className="text-xs font-medium text-gray-400 px-2 py-1 bg-dark-bg rounded">
                      {stat.change}
                    </span>
                  )}
                </div>
                <div>
                  <p className="text-sm text-gray-400 mb-1">{stat.title}</p>
                  <div className="flex items-baseline space-x-1">
                    <h3 className="text-3xl font-bold text-white">{stat.value}</h3>
                    {stat.unit && (
                      <span className="text-sm text-gray-500">{stat.unit}</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-dark-card border border-dark-border rounded-xl p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-white">漏洞等级分布</h3>
                <button className="text-gray-400 hover:text-white">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                  </svg>
                </button>
              </div>
              <div className="flex items-center justify-center">
                <div className="relative w-64 h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={mockVulnerabilityData}
                        cx="50%"
                        cy="50%"
                        innerRadius={70}
                        outerRadius={100}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {mockVulnerabilityData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex items-center justify-center flex-col">
                    <span className="text-4xl font-bold text-white">58%</span>
                    <span className="text-sm text-gray-400">关键漏洞</span>
                  </div>
                </div>
                <div className="ml-8 space-y-3">
                  {mockVulnerabilityData.map((item, index) => (
                    <div key={index} className="flex items-center space-x-3">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: item.color }}
                      ></div>
                      <span className="text-sm text-gray-300">{item.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-dark-card border border-dark-border rounded-xl p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-lg font-semibold text-white">近七日漏洞趋势</h3>
                  <p className="text-xs text-gray-500 mt-1">
                    VULNERABILITY INFLUX OVER TIME
                  </p>
                </div>
                <div className="text-xs text-gray-500">05/01 - 05/07</div>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={mockTrendData}>
                    <defs>
                      <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e2433" />
                    <XAxis dataKey="name" stroke="#6b7280" fontSize={12} />
                    <YAxis stroke="#6b7280" fontSize={12} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#151922',
                        border: '1px solid #1e2433',
                        borderRadius: '8px',
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="value"
                      stroke="#06b6d4"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#colorValue)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-dark-card border border-dark-border rounded-xl p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-white">
                  最高优先级待办漏洞
                </h3>
                <button className="text-sm text-primary hover:text-cyan-400 flex items-center space-x-1 transition-colors">
                  <span>查看全部</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
              <div className="space-y-4">
                {mockRecentVulnerabilities.map((vuln, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-4 bg-dark-bg rounded-lg hover:bg-dark-hover transition-colors group"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-3 mb-2">
                        <span className="text-xs text-gray-500 font-mono">
                          {vuln.id}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-medium ${vuln.severityColor} text-white`}
                        >
                          {vuln.severity}
                        </span>
                      </div>
                      <h4 className="text-sm font-medium text-white truncate">
                        {vuln.title}
                      </h4>
                      <p className="text-xs text-gray-500 mt-1">
                        负责人: {vuln.assignee} · Gateway-Server-01
                      </p>
                    </div>
                    <div className="flex items-center space-x-3 ml-4">
                      <span className="text-xs text-gray-500 whitespace-nowrap">
                        {vuln.date}
                      </span>
                      <button className="p-2 text-gray-400 hover:text-white opacity-0 group-hover:opacity-100 transition-all">
                        <ExternalLink className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-dark-card border border-dark-border rounded-xl p-6">
              <h3 className="text-lg font-semibold text-white mb-6">系统安全评分</h3>
              <div className="flex flex-col items-center">
                <div className="relative w-48 h-48">
                  <svg className="w-full h-full transform -rotate-90">
                    <circle
                      cx="96"
                      cy="96"
                      r="88"
                      stroke="#1e2433"
                      strokeWidth="12"
                      fill="none"
                    />
                    <circle
                      cx="96"
                      cy="96"
                      r="88"
                      stroke="url(#gradient)"
                      strokeWidth="12"
                      fill="none"
                      strokeLinecap="round"
                      strokeDasharray={`${85 * 5.52} 552`}
                    />
                    <defs>
                      <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#06b6d4" />
                        <stop offset="100%" stopColor="#22d3ee" />
                      </linearGradient>
                    </defs>
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-5xl font-bold text-white">85</span>
                    <span className="text-sm text-gray-400">SCORE</span>
                  </div>
                </div>

                <div className="mt-6 w-full space-y-3">
                  <div className="flex items-center justify-between px-4 py-3 bg-dark-bg rounded-lg">
                    <span className="text-sm text-gray-300">状态:</span>
                    <span className="text-sm font-medium text-green-400">
                      安全 (Secure)
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 text-center leading-relaxed">
                    基于72小时扫描结果，
                    <br />
                    系统防御等级：优于基准。
                  </p>
                </div>
              </div>

              <button className="mt-6 w-12 h-12 bg-primary rounded-full flex items-center justify-center ml-auto hover:bg-cyan-400 transition-colors shadow-lg shadow-primary/25">
                <Plus className="w-6 h-6 text-white" />
              </button>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
