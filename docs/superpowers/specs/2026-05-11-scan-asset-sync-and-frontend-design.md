# 扫描资产同步 + 前端改造 + 超时修复 设计文档

**日期**: 2026-05-11
**状态**: 设计中

---

## 1. 问题

| # | 问题 | 现状 |
|---|------|------|
| 1 | 扫描超时 | `subprocess.run(timeout=...)` 硬杀进程，quick 10分钟 / deep 30分钟，107模块经常跑不完 |
| 2 | 资产不同步 | 扫描只写 Report，发现的端口/服务/子域名全部丢弃 |
| 3 | 前端资产页单薄 | 只展示扫描过的 URL，类型只有 web_app，无详情 |

## 2. 目标

- 去掉硬超时，支持参数化的自定义扫描，前端展示实时进度条
- 扫描结果自动提取并持久化资产（主机/端口/服务/子域名/Web技术/SSL证书）
- 前端资产页支持多类型筛选、详情展开、与漏洞联动
- 保持现有 dark 主题 UI 风格不变

## 3. 扫描引擎改造

### 3.1 后端 scanner.py

**去掉硬超时**：`subprocess.run(cmd, capture_output=True, text=True)` 不设 timeout，进程跑到底。

**进度解析**：逐行读取 Nettacker stdout（改用 `Popen` + 轮询），匹配正则 `module-thread\s+(\d+)/(\d+)` 计算百分比，更新 `ScanTask.progress`。

**新增 ScanTask 字段**：

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `timeout_minutes` | IntegerField | 60 | 超时分钟数（仅记录，不杀进程） |
| `thread_count` | IntegerField | 10 | `-t` 参数 |
| `parallel_modules` | IntegerField | 5 | `-M` 参数 |
| `hardware_usage` | CharField | "high" | low/normal/high/maximum |
| `selected_modules` | TextField | "" | 逗号分隔的模块名，空=全部 |

**扫描命令构造**：
```
nettacker -m <modules> -i <target> -o <output.json> -d \
  -t <thread_count> -M <parallel_modules> \
  --set-hardware-usage <hardware_usage>
```

**Nettacker 模块分组**（前端自定义扫描时按类别勾选）：

| 类别 | 模块 |
|------|------|
| 端口扫描 | port_scan, icmp_scan |
| 子域名 | subdomain_scan, subdomain_takeover_vuln |
| Web发现 | admin_scan, dir_scan, http_status_scan, http_html_title_scan, http_redirect_scan, pma_scan |
| CVE检测 | log4j_cve_2021_44228_vuln, apache_cve_2021_41773_vuln, confluence_cve_2023_22515_vuln 等 |
| Web安全 | clickjacking_vuln, http_cors_vuln, http_cookie_vuln, content_security_policy_vuln, strict_transport_security_vuln, x_powered_by_vuln, x_xss_protection_vuln, server_version_vuln 等 |
| SSL/TLS | ssl_certificate_weak_signature_vuln, ssl_expired_certificate_vuln, ssl_self_signed_certificate_vuln, ssl_weak_cipher_vuln, ssl_weak_version_vuln |
| 信息收集 | web_technologies_scan, waf_scan, drupal_version_scan, joomla_version_scan, wordpress_version_scan 等 |
| 暴力破解 | ssh_brute, ftp_brute, smtp_brute, pop3_brute, wp_xmlrpc_bruteforce_vuln |

预设：**快速扫描**=端口+子域名+Web发现+SSL，**深度扫描**=全部模块。

### 3.2 前端扫描表单

在现有扫描页面增加可折叠的"高级配置"区域：

- 扫描类型下拉（快速/深度/自定义）
- 目标 URL 输入框
- 展开后显示：超时滑块、线程滑块、并行模块滑块、硬件使用下拉
- 自定义模式下展开模块多选区（按类别分组，checkbox）

### 3.3 进度条

- 扫描任务卡片上渲染进度条（`ScanTask.progress` 百分比 + 当前状态文本）
- 后端从 Nettacker stdout 解析 `module-thread X/Y`
- 前端每 3 秒轮询 `GET /api/secguard/scans/<id>`，进度实时更新

## 4. 资产同步

### 4.1 Asset 模型

```python
class Asset(models.Model):
    class AssetType(models.TextChoices):
        HOST = "host", "主机"
        PORT = "port", "端口"
        SERVICE = "service", "服务"
        SUBDOMAIN = "subdomain", "子域名"
        WEB_TECH = "web_tech", "Web技术"
        SSL_CERT = "ssl_cert", "SSL证书"

    class Status(models.TextChoices):
        ONLINE = "online", "在线"
        OFFLINE = "offline", "离线"
        UNKNOWN = "unknown", "未知"

    scan_task = ForeignKey(ScanTask, CASCADE, related_name="assets")
    asset_type = CharField(choices=AssetType)
    name = CharField(max_length=255)           # 标识 (IP/端口/子域名/服务名)
    value = TextField(blank=True)              # JSON 详情
    status = CharField(choices=Status, default=ONLINE)
    target = CharField(max_length=255)         # 隶属的扫描目标
    team = ForeignKey(Organization, CASCADE, null=True)
    discovered_at = DateTimeField(auto_now_add=True)
```

### 4.2 提取逻辑（scanner.py）

扫描完成后解析 Nettacker JSON 输出，按模块名分类提取：

| Nettacker 模块 | Asset 类型 | name 格式 |
|---------------|-----------|----------|
| port_scan | port | `host:port` |
| port_scan (host) | host | `host` |
| icmp_scan | host | `host` |
| subdomain_scan | subdomain | `subdomain.example.com` |
| http_status_scan | service | `http://host:port` |
| http_html_title_scan | service | `http://host:port` |
| web_technologies_scan | web_tech | 技术名 (nginx, apache 等) |
| ssl_* | ssl_cert | `host:port` |

去重：同 `target + asset_type + name` → 更新 `discovered_at` 和 `value`。

### 4.3 API 改动

`GET /api/secguard/assets` 改为合并 Asset 表 + Report 统计：

- 按 `target` 分组，每 target 返回一条汇总记录
- `type` = 该 target 下最多的 AssetType 映射
- `status` = 最近一次扫描状态
- `vulnerabilities` = Report 数量
- `criticality` = 基于漏洞严重等级计算
- 返回字段：`id, name, type, status, vulnerabilities, last_scan, criticality, assets_detail`
- `assets_detail` 包含该 target 下的端口、服务、子域名等子资产列表

## 5. 前端资产页改造

保持现有 dark 主题风格。改动：

- **类型筛选器**：下拉从 `['web_app']` 扩展为 `['全部', 'host', 'port', 'service', 'subdomain', 'web_tech', 'ssl_cert']`
- **表格列**：
  - 资产信息（名称 + ID，不同类型不同图标和颜色标签）
  - 类型（彩色标签：主机=蓝、端口=绿、服务=紫、子域名=黄、Web技术=青、SSL=橙）
  - 状态（在线/离线/未知）
  - 端口（仅 port 类显示端口号）
  - 漏洞数（>0 可点击跳转）
  - 重要性（高/中/低，基于漏洞等级）
  - 最后扫描（日期）
- **行展开**：点击行可展开该 target 的子资产详情（端口列表、服务、SSL 等）
- **统计卡片**不变：总资产数、在线资产、存在漏洞、高危资产
- **样式**：沿用 `bg-dark-bg/bg-dark-card/border-dark-border/text-white/text-gray-400` + `lucide-react` 图标

## 6. 实施步骤

1. **Asset 模型 + 迁移** — 新增 Asset 模型，运行 makemigrations + migrate
2. **scanner.py 改造** — 去掉 timeout、Popen 流式读取、进度解析、资产提取、自定义参数
3. **ScanTask 模型新增字段 + 迁移**
4. **API 改造** — 更新 assets 端点、scans 端点支持新字段
5. **前端扫描表单** — 高级配置面板 + 模块选择
6. **前端资产页** — 多类型筛选 + 详情展开
7. **容器重建** — `docker compose build backend && up -d`
8. **验证** — 启动扫描 → 查看进度条 → 检查资产同步
