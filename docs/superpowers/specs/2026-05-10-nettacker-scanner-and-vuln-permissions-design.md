# Nettacker 扫描器修复 & 漏洞管理权限重构

日期: 2026-05-10 | 状态: approved

---

## Part 1: Nettacker 扫描器修复

### 安装与调用

- Dockerfile 中通过 `pip install owasp-nettacker` 安装
- scanner.py 中 `NETTACKER_PATH` 默认值改为 `python -m nettacker`

### 扫描类型精简

- 去掉 `custom` 扫描类型，只保留 `deep` 和 `quick`
- `profile_map`: `{"deep": "full_scan", "quick": "quick_scan"}`
- 深度扫描: Nettacker `full_scan` 模块，超时默认 30 分钟
- 快速扫描: Nettacker `quick_scan` 模块，超时默认 10 分钟（环境变量 `SCAN_TIMEOUT_QUICK` 可配）
- API `ScanTaskCreateSchema` 校验去掉 `custom`

### 前端改动

- scans/page.tsx "已集成引擎"面板: 删除 OWASP ZAP、Nuclei，只保留 Nettacker
- 扫描配置模板下拉框: 删除"自定义"选项
- TypeScript 类型约束同步去掉 `custom`

---

## Part 2: 漏洞管理权限重构

### 角色重命名

- `team_lead` (团队负责人) → `安全负责人`
- 涉及文件: models.py Role choices、frontend AuthContext、team page、vulnerability detail page 等

### 权限矩阵

| 操作 | 无团队 | admin | 安全负责人 | developer | observer |
|------|--------|-------|-----------|-----------|----------|
| assign | 仅自己 | 任何人 | 任何人 | ❌ | ❌ |
| submit_fix | 自己(处理人) | 自己(处理人) | 自己(处理人) | 自己(处理人) | ❌ |
| confirm_review | 自己(报告人) | 任何人 | 任何人 | 仅自己报告 | ❌ |
| close | ✅ | ✅ | ✅ | ❌ | ❌ |
| reopen | ✅ | ✅ | ✅ | ❌ | ❌ |

### 后端改动

1. `check_permission()`: 不再只判断 `is_staff`，改为查询 `TeamMembership.Role`
2. `filter_by_team()`: 无团队用户不再返回空 queryset，改为按 `created_by` 过滤
3. `set_request_team()`: 无团队时返回 None（保持现有行为）
4. `assign` 端点: admin/安全负责人可指派任何人，无团队用户只能指派自己
5. `transition` 端点: 按表中角色矩阵校验
6. `confirm_review`: 新增 developer 角色允许条件（仅当 developer 是报告人时）
7. Report 创建: 无团队时 assignee 只能是自己；有团队时 admin/安全负责人可选任何成员

### 前端改动

- vulnerabilities/[id]/page.tsx: `canManage` 基于团队角色 + is_staff 判断
- vulnerabilities/report/page.tsx: 指派处理人下拉框按权限过滤
- AuthContext: 更新角色标签映射（team_lead → 安全负责人）
- team/page.tsx: 更新角色标签和下拉选项
