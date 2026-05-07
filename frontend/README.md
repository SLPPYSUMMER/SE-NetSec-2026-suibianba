# SecGuard Frontend

基于原型图生成的 SecGuard 漏洞管理平台前端应用。

## 技术栈

- **框架**: Next.js 14 (App Router)
- **语言**: TypeScript
- **样式**: Tailwind CSS
- **图表**: Recharts
- **图标**: Lucide React

## 项目结构

```
frontend/
├── src/
│   ├── app/
│   │   ├── page.tsx                    # 登录页
│   │   ├── layout.tsx                  # 根布局
│   │   ├── globals.css                 # 全局样式
│   │   ├── dashboard/
│   │   │   └── page.tsx               # 仪表盘/系统首页
│   │   ├── vulnerabilities/
│   │   │   ├── page.tsx               # 漏洞列表页
│   │   │   ├── [id]/
│   │   │   │   └── page.tsx           # 漏洞详情页
│   │   │   └── report/
│   │   │       └── page.tsx           # 漏洞上报页
│   │   ├── scans/
│   │   │   └── page.tsx               # 自动化扫描管理页
│   │   ├── reports/
│   │   │   └── page.tsx               # 报告生成导出页
│   │   └── settings/
│   │       └── page.tsx               # 系统设置页
│   └── components/
│       ├── Sidebar.tsx                 # 侧边导航栏
│       └── Header.tsx                  # 顶部导航栏
├── package.json
├── tailwind.config.js
├── postcss.config.js
├── tsconfig.json
└── next.config.js
```

## 页面说明

### 1. 登录页 (`/`)
- 深色主题设计
- 用户名/密码登录
- 记住我功能
- 社交登录按钮（GitHub, Google）

### 2. 仪表盘 (`/dashboard`)
- 安全概览统计卡片
- 漏洞等级分布饼图
- 近七日漏洞趋势折线图
- 最高优先级待办漏洞列表
- 系统安全评分环形图

### 3. 漏洞管理 (`/vulnerabilities`)
- 漏洞列表表格展示
- 筛选功能（严重程度、状态）
- 搜索功能
- 分页控制
- 导出数据功能

### 4. 漏洞详情 (`/vulnerabilities/[id]`)
- 完整漏洞信息展示
- POC代码块
- 修复建议
- 附件上传区
- 处理轨迹时间线
- 流程状态指示器

### 5. 漏洞上报 (`/vulnerabilities/report`)
- 表单式提交界面
- Markdown编辑器
- 严重程度选择
- 文件上传支持
- 草稿保存功能

### 6. 扫描任务 (`/scans`)
- 扫描任务创建表单
- 任务列表展示
- 实时进度显示
- 多引擎集成展示
- 定时扫描设置

### 7. 报告中心 (`/reports`)
- 报告配置面板
- 实时预览模式
- 图表数据展示
- PDF/HTML导出
- 自定义报告选项

### 8. 系统设置 (`/settings`)
- 团队成员管理
- 操作审计日志
- 双因素认证(2FA)配置
- 安全等级显示
- 数据导出功能

## 安装和运行

### 安装依赖

```bash
cd frontend
npm install
```

### 启动开发服务器

```bash
npm run dev
```

访问 http://localhost:3000

### 构建生产版本

```bash
npm run build
npm start
```

## 设计特点

- **深色主题**: 采用专业的深色配色方案，减少视觉疲劳
- **响应式设计**: 支持不同屏幕尺寸的自适应布局
- **现代化UI**: 使用玻璃态效果、渐变色彩、平滑过渡动画
- **交互友好**: 直观的图标、清晰的状态反馈、流畅的用户体验
- **数据可视化**: 集成图表库，直观展示安全数据

## API代理配置

开发环境下，前端会自动将 `/api/*` 的请求代理到后端 `http://localhost:8000`。

## 注意事项

- 当前为纯前端静态实现，未连接真实后端API
- 所有数据均为模拟数据
- 部分交互功能需要后续对接后端接口
