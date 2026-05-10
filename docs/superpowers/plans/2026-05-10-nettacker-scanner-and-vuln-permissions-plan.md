# Nettacker 扫描器修复 & 漏洞管理权限重构 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 Nettacker 扫描器无法执行的错误，精简扫描类型和引擎展示；重构漏洞管理权限，使团队角色参与状态流转，无团队用户可自我管理。

**Architecture:** 分两条独立线——扫描器线（Dockerfile → scanner.py → API schema → 前端scans页面）和权限线（models角色重命名 → API helper函数 → filter/assign/transition端点 → 前端角色标签和条件渲染）。两条线互不依赖可并行实施。

**Tech Stack:** Django Ninja + Pydantic v2（后端），Next.js + TypeScript（前端），OWASP Nettacker（扫描引擎），PostgreSQL

**Spec:** `docs/superpowers/specs/2026-05-10-nettacker-scanner-and-vuln-permissions-design.md`

---

### Task 1: Dockerfile 安装 owasp-nettacker

**Files:**
- Modify: `backend/Dockerfile:23`

- [ ] **Step 1: 在 builder 阶段追加 pip install owasp-nettacker**

在 `backend/Dockerfile` 第23行后添加：

```dockerfile
RUN pip install owasp-nettacker 2>/dev/null || true
```

完整的上下文（第21-24行区域变为）：

```dockerfile
RUN pip uninstall -y httpx || true
RUN poetry lock 2>/dev/null || true && poetry install --no-root --no-interaction || (poetry lock && poetry install --no-root --no-interaction)
RUN pip install django-cors-headers 2>/dev/null || true
RUN pip install owasp-nettacker 2>/dev/null || true
```

- [ ] **Step 2: Commit**

```bash
git add backend/Dockerfile
git commit -m "build: add owasp-nettacker to Dockerfile

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 2: 修复 scanner.py 调用方式与扫描类型

**Files:**
- Modify: `backend/website/scanner.py`

- [ ] **Step 1: 修改 scanner.py — 环境变量默认值、profile_map 精简、快速扫描超时**

将 `backend/website/scanner.py` 第1-9行替换为：

```python
"""Nettacker 扫描器集成 - 自动扫描任务执行器"""
import subprocess, threading, logging, os, json, time
from datetime import datetime

logger = logging.getLogger(__name__)

NETTACKER_CMD = os.environ.get("NETTACKER_CMD", "nettacker")
MAX_SCAN_TIMEOUT = int(os.environ.get("SCAN_TIMEOUT", "1800"))
QUICK_SCAN_TIMEOUT = int(os.environ.get("SCAN_TIMEOUT_QUICK", "600"))
```

将第27行 `profile_map` 修改为：

```python
    profile_map = {"deep": "full_scan", "quick": "quick_scan"}
```

将第30-33行 cmd 构造和超时选择修改为：

```python
    timeout = QUICK_SCAN_TIMEOUT if scanner_type == "quick" else MAX_SCAN_TIMEOUT

    cmd = [
        NETTACKER_CMD, "-m", profile, "-t", target,
        "-o", "/tmp/nettacker_result.json", "--output-format", "json"
    ]
```

将第36行 `timeout=MAX_SCAN_TIMEOUT` 改为 `timeout=timeout`：

```python
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
```

- [ ] **Step 2: Commit**

```bash
git add backend/website/scanner.py
git commit -m "fix: use configurable NETTACKER_CMD, remove custom scan, add quick timeout

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 3: API schema 去掉 custom 扫描类型

**Files:**
- Modify: `backend/website/api/secguard_api.py:1088-1090`

- [ ] **Step 1: 修改 ScanTaskCreateSchema 的 scanner_type 描述**

将第1090行：

```python
    scanner_type: str = Field("deep", description="扫描类型: deep/quick/custom")
```

改为：

```python
    scanner_type: str = Field("deep", description="扫描类型: deep/quick")
```

- [ ] **Step 2: Commit**

```bash
git add backend/website/api/secguard_api.py
git commit -m "fix: remove custom scan type from API schema

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 4: 前端扫描页面 — 精简引擎和扫描类型

**Files:**
- Modify: `frontend/src/app/scans/page.tsx`

- [ ] **Step 1: 删除已集成引擎面板中的 OWASP ZAP 和 Nuclei**

将第92-94行：

```tsx
                {['Nettacker', 'OWASP ZAP', 'Nuclei'].map((e) => (
                  <span key={e} className="px-3 py-1 bg-dark-bg border border-dark-border rounded text-xs text-gray-300">{e}</span>
                ))}
```

改为：

```tsx
                <span className="px-3 py-1 bg-dark-bg border border-dark-border rounded text-xs text-gray-300">Nettacker</span>
```

- [ ] **Step 2: 删除扫描类型下拉框中的自定义选项**

删除第118行 `<option value="custom">自定义 (Custom)</option>`：

```tsx
                  <select value={scanType} onChange={(e) => setScanType(e.target.value)}
                    className="w-full px-4 py-3 bg-dark-bg border border-dark-border rounded-lg text-white focus:outline-none focus:border-primary cursor-pointer">
                    <option value="deep">深度扫描 (Deep)</option>
                    <option value="quick">快速扫描 (Quick)</option>
                  </select>
```

- [ ] **Step 3: 将第17行 `scanType` 初始值保持为 `'deep'`（无需修改，已经是 deep）**

确认第11行：`const [scanType, setScanType] = useState('deep');` 保持不变。

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/scans/page.tsx
git commit -m "fix: remove ZAP/Nuclei from engine list, remove custom scan option

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 5: 重命名团队角色 team_lead → 安全负责人

**Files:**
- Modify: `backend/website/models.py:4058`
- Modify: `frontend/src/contexts/AuthContext.tsx:29`
- Modify: `frontend/src/app/team/page.tsx:11,16`

- [ ] **Step 1: 修改后端 models.py 中的角色标签**

将 `backend/website/models.py` 第4058行：

```python
        TEAM_LEAD = "team_lead", "团队负责人"
```

改为：

```python
        TEAM_LEAD = "team_lead", "安全负责人"
```

> 注意：只改 display label，不改 field value (`team_lead`)，无需生成迁移。

- [ ] **Step 2: 修改前端 AuthContext.tsx 中的角色标签**

将 `frontend/src/contexts/AuthContext.tsx` 第29行：

```typescript
  team_lead: '团队负责人',
```

改为：

```typescript
  team_lead: '安全负责人',
```

- [ ] **Step 3: 修改前端 team/page.tsx 中的角色选项和标签**

将第11行：

```typescript
  { value: 'team_lead', label: '团队负责人' },
```

改为：

```typescript
  { value: 'team_lead', label: '安全负责人' },
```

将第16行：

```typescript
  admin: '团队管理员', team_lead: '团队负责人', developer: '开发人员', observer: '观察者',
```

改为：

```typescript
  admin: '团队管理员', team_lead: '安全负责人', developer: '开发人员', observer: '观察者',
```

- [ ] **Step 4: Commit**

```bash
git add backend/website/models.py frontend/src/contexts/AuthContext.tsx frontend/src/app/team/page.tsx
git commit -m "refactor: rename team_lead label from 团队负责人 to 安全负责人

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 6: 添加 get_user_team_role helper 并重写 check_permission

**Files:**
- Modify: `backend/website/api/secguard_api.py:244-265`

- [ ] **Step 1: 在 check_permission 之前插入 get_user_team_role 函数**

在 `backend/website/api/secguard_api.py` 第243行后（`check_permission` 函数之前）插入：

```python
def get_user_team_role(request: HttpRequest):
    """
    获取当前用户的团队角色。
    返回 (role, has_team)，role 为 TeamMembership.Role 值或 None。
    系统管理员返回 ('admin', True)。
    """
    if not request.user.is_authenticated:
        return None, False
    if request.user.is_staff:
        return 'admin', True
    try:
        profile = request.user.userprofile
        if profile.team:
            membership = TeamMembership.objects.filter(
                user=request.user, team=profile.team,
                status=TeamMembership.Status.ACCEPTED,
            ).first()
            if membership:
                return membership.role, True
    except Exception:
        pass
    membership = TeamMembership.objects.filter(
        user=request.user,
        status=TeamMembership.Status.ACCEPTED,
    ).first()
    if membership:
        return membership.role, True
    return None, False
```

- [ ] **Step 2: 重写 check_permission 函数**

将第244-265行现有的 `check_permission` 函数替换为：

```python
def check_permission(user, required_role: str = None) -> bool:
    """
    基础权限检查。is_staff 用户拥有所有权限。
    用于不需要团队上下文的基础检查。
    """
    if not user.is_authenticated:
        return False
    if user.is_superuser or user.is_staff:
        return True
    if required_role is None:
        return True
    return False


def check_team_permission(request: HttpRequest, allowed_roles: list):
    """
    检查用户是否有指定团队角色或为无团队用户。
    返回 (is_allowed, team_role, has_team)。
    - is_staff: 总是允许
    - 有团队: 检查角色是否在 allowed_roles 中
    - 无团队: 允许（走自我管理模式）
    """
    if not request.user.is_authenticated:
        return False, None, False
    if request.user.is_staff:
        return True, 'admin', True
    role, has_team = get_user_team_role(request)
    if not has_team:
        return True, None, False
    return role in allowed_roles, role, True
```

- [ ] **Step 3: Commit**

```bash
git add backend/website/api/secguard_api.py
git commit -m "feat: add get_user_team_role and check_team_permission helpers

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 7: 修复 filter_by_team — 无团队用户按创建者过滤

**Files:**
- Modify: `backend/website/api/secguard_api.py:314-321`

- [ ] **Step 1: 重写 filter_by_team 函数**

将第314-321行现有的 `filter_by_team` 函数替换为：

```python
def filter_by_team(queryset, request: HttpRequest):
    """对 queryset 按用户团队过滤；管理员不过滤；无团队用户只看自己的数据"""
    if request.user.is_staff:
        return queryset
    team, _ = get_user_team(request)
    if team is None:
        model = queryset.model
        if hasattr(model, 'reporter'):
            return queryset.filter(reporter=request.user)
        elif hasattr(model, 'created_by'):
            return queryset.filter(created_by=request.user)
        elif hasattr(model, 'user'):
            return queryset.filter(user=request.user)
        return queryset.none()
    return queryset.filter(team=team)
```

- [ ] **Step 2: Commit**

```bash
git add backend/website/api/secguard_api.py
git commit -m "fix: no-team users see their own data instead of empty results

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 8: 修复 assign 端点权限

**Files:**
- Modify: `backend/website/api/secguard_api.py:778-822`

- [ ] **Step 1: 重写 assign_report 函数的权限检查部分**

将第778-799行（assign_report 函数开头到 assignee 查找之前）替换为：

```python
@router.post("/reports/{vuln_id}/assign", response=ReportDetailSchema)
def assign_report(request: HttpRequest, vuln_id: str, payload: AssignReportSchema):
    """
    分派漏洞给指定处理人

    状态转换：待分派(PENDING) / 处理中(PROCESSING) → 处理中(PROCESSING)

    权限要求：
      - 系统管理员 / 团队管理员 / 安全负责人：可分派给任何人
      - 无团队用户：只能分派给自己
      - 开发人员/观察者：不可分派
    """
    if not request.user.is_authenticated:
        raise HttpError(400, "请先登录")

    team_role, has_team = get_user_team_role(request)

    try:
        report = Report.objects.select_related('assignee').get(vuln_id=vuln_id)
    except Report.DoesNotExist:
        raise HttpError(400, f"漏洞报告 {vuln_id} 不存在")

    if report.status not in [Report.Status.PENDING, Report.Status.PROCESSING]:
        raise HttpError(400,
            f"当前状态 '{report.get_status_display()}' 不允许分派操作，"
            f"仅允许在 '待分派' 或 '处理中' 状态下分派"
        )

    # 权限检查
    if not _can_assign(request.user, team_role, has_team, payload.assignee_id):
        raise HttpError(400, "您没有权限执行分派操作")

    try:
        assignee = User.objects.get(id=payload.assignee_id)
    except User.DoesNotExist:
        raise HttpError(400, f"被分派的用户ID {payload.assignee_id} 不存在")
```

并在 `get_user_team_role` 函数附近添加 `_can_assign` 辅助函数：

```python
def _can_assign(user, team_role, has_team, assignee_id):
    """检查用户是否可以分派漏洞给指定处理人"""
    if user.is_staff:
        return True
    if has_team and team_role in (TeamMembership.Role.ADMIN, TeamMembership.Role.TEAM_LEAD):
        return True
    if not has_team:
        return assignee_id == user.id
    return False
```

保留原有的 assignee 查找、状态更新和审计日志部分（第801-822行）不变。

- [ ] **Step 2: Commit**

```bash
git add backend/website/api/secguard_api.py
git commit -m "fix: rewrite assign endpoint permissions for team roles and no-team users

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 9: 修复 transition 端点权限

**Files:**
- Modify: `backend/website/api/secguard_api.py:825-936`

- [ ] **Step 1: 重写 transition_status 函数的权限检查逻辑**

将第825-936行的 `transition_status` 函数中的权限检查部分（第900-916行）替换。保留状态有效性检查（第844-898行）不变，将第900-916行的 `role_check` / `is_allowed` 逻辑替换为：

```python
    # 权限检查（替换原第900-916行）
    team_role, has_team = get_user_team_role(request)

    if not request.user.is_staff:
        if payload.action == 'submit_fix':
            if has_team and team_role == TeamMembership.Role.OBSERVER:
                raise HttpError(400, "观察者无法提交修复")
            if report.assignee != request.user:
                raise HttpError(400, "只有指定的处理人可以提交修复")
        elif payload.action == 'confirm_review':
            if has_team and team_role in (TeamMembership.Role.ADMIN, TeamMembership.Role.TEAM_LEAD):
                pass
            elif has_team and team_role == TeamMembership.Role.DEVELOPER:
                if report.reporter != request.user:
                    raise HttpError(400, "开发人员只能复核自己上报的漏洞")
            elif not has_team:
                if report.reporter != request.user:
                    raise HttpError(400, "只有报告人可以确认复核")
            else:
                raise HttpError(400, "您没有权限执行确认复核操作")
        elif payload.action in ('close', 'reopen'):
            if has_team and team_role not in (TeamMembership.Role.ADMIN, TeamMembership.Role.TEAM_LEAD):
                raise HttpError(400, "需要团队管理员或安全负责人权限才能执行此操作")
```

保留状态更新和审计日志部分（第918-936行）不变。

- [ ] **Step 2: Commit**

```bash
git add backend/website/api/secguard_api.py
git commit -m "fix: rewrite transition permissions with team role matrix

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 10: 修复 Report 创建端点的 assignee 权限

**Files:**
- Modify: `backend/website/api/secguard_api.py:560-630`

- [ ] **Step 1: 在 create_report 中的 assignee 处理添加权限检查**

找到 `create_report` 函数中处理 assignee 的部分（约第580-597行），在 `assignee = User.objects.get(id=payload.assignee_id)` 之前，添加权限验证。将 assignee 查找逻辑替换为：

```python
    assignee = None
    if payload.assignee_id:
        team_role, has_team = get_user_team_role(request)

        if not request.user.is_staff:
            if has_team and team_role not in (TeamMembership.Role.ADMIN, TeamMembership.Role.TEAM_LEAD):
                if not has_team and payload.assignee_id != request.user.id:
                    raise HttpError(400, "您尚未加入团队，只能将漏洞指派给自己")
                elif has_team:
                    raise HttpError(400, "您没有权限指派处理人，请留空由管理员分派")

        try:
            assignee = User.objects.get(id=payload.assignee_id)
        except User.DoesNotExist:
            raise HttpError(400, f"被分派的用户ID {payload.assignee_id} 不存在")
```

注意保留后续的 `Report.objects.create(...)` 调用不变。

- [ ] **Step 2: Commit**

```bash
git add backend/website/api/secguard_api.py
git commit -m "fix: validate assignee permission when creating reports

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 11: 更新前端漏洞详情页 canManage/canFix 逻辑

**Files:**
- Modify: `frontend/src/app/vulnerabilities/[id]/page.tsx:25-27`

- [ ] **Step 1: 重构权限判断逻辑**

`vulnerabilities/[id]/page.tsx` 中的 `canManage` 目前同时检查 `is_staff`、`团队管理员`、`团队负责人`。角色标签 `团队负责人` 已改为 `安全负责人`，需要更新。同时需要更精确的判断逻辑。

将第25-27行：

```typescript
  const canManage = user?.is_staff || user?.role === '团队管理员' || user?.role === '团队负责人';
  const canFix = user?.is_staff || (report?.assignee?.id === user?.id) || user?.role === '开发人员';
  const isReporter = report?.reporter?.id === user?.id;
```

替换为：

```typescript
  const isStaff = user?.is_staff;
  const role = user?.role;
  const userId = user?.id;
  const isAssignee = report?.assignee?.id === userId;
  const isReporter = report?.reporter?.id === userId;
  const isTeamAdmin = role === '团队管理员';
  const isSecurityLead = role === '安全负责人';
  const isDeveloper = role === '开发人员';
  const isObserver = role === '观察者';
  const hasTeam = !!(user?.team_id);
  const canManage = isStaff || isTeamAdmin || isSecurityLead || (!hasTeam && isReporter);
  const canAssign = isStaff || isTeamAdmin || isSecurityLead;
  const canFix = isStaff || (isAssignee && !isObserver) || (isDeveloper && isAssignee);
  const canReview = isStaff || isTeamAdmin || isSecurityLead || isReporter;
  const canClose = isStaff || isTeamAdmin || isSecurityLead || (!hasTeam && isReporter);
```

- [ ] **Step 2: 更新按钮的 visible 条件（第159-184行）**

将按钮的 `canManage` / `canFix` / `isReporter` 条件更新为更精确的判断：

将第159行 `{report.status === 'pending' && canManage && (` 改为 `{report.status === 'pending' && canAssign && (`
将第165行 `{report.status === 'processing' && canFix && (` 保持不变（仍用 canFix）
将第171行 `{report.status === 'fixed' && (canManage || isReporter) && (` 改为 `{report.status === 'fixed' && canReview && (`
将第177行 `{report.status === 'reviewing' && canManage && (` 改为 `{report.status === 'reviewing' && canClose && (`
将第183行提示文字中 `等待团队管理员分派` 改为 `等待分派`

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/vulnerabilities/[id]/page.tsx
git commit -m "fix: refine vulnerability detail page permissions for team roles

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 12: 更新前端漏洞上报页 assignee 选项过滤

**Files:**
- Modify: `frontend/src/app/vulnerabilities/report/page.tsx`

- [ ] **Step 1: 根据权限过滤可选的指派处理人**

在 `vulnerabilities/report/page.tsx` 中，当前成员列表 (`members`) 来自 `teamsApi.members()`，所有成员都显示为可选项。需要根据用户角色决定可选范围。

在组件顶部添加权限判断变量（约第26行 `useEffect` 之前）：

```typescript
  const { user } = useAuth(); // 确保已导入 useAuth
```

检查文件顶部是否已导入 `useAuth`，如果没有则添加导入：

```typescript
import { useAuth } from '@/contexts/AuthContext';
```

在组件内部（`const [formData, setFormData] = useState(...)` 之后）添加：

```typescript
  const isStaff = user?.is_staff;
  const role = user?.role;
  const hasTeam = !!(user?.team_id);
  const canAssignAnyone = isStaff || role === '团队管理员' || role === '安全负责人';

  const assignableMembers = canAssignAnyone
    ? members
    : members.filter((m: any) => m.user_id === user?.id);
```

- [ ] **Step 2: 使用过滤后的列表渲染下拉选项**

将第91-92行的 `{members.map(m => (` 改为 `{assignableMembers.map(m => (`

将第95行提示文字 `{members.length === 0 &&` 改为 `{assignableMembers.length === 0 &&`

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/vulnerabilities/report/page.tsx
git commit -m "fix: filter assignee options in report form based on user permissions

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 13: 运行后端测试验证

**Files:**
- Existing: `backend/website/tests/test_secguard_api.py`

- [ ] **Step 1: 运行现有测试确认没有破坏已有功能**

```bash
cd backend && python manage.py test website.tests.test_secguard_api -v 2
```

预期：现有测试应全部通过。如果 `team_lead` 的 display label 更改影响到了任何字符串匹配的断言，修复对应测试。

- [ ] **Step 2: 手动验证关键场景**

启动后端（`python manage.py runserver 0.0.0.0:8000`）后，用 curl 或浏览器验证：

1. 无团队用户创建报告 → 应成功，assignee 只能是自己或空
2. 无团队用户对自己报告的 close 操作 → 应成功
3. 有团队 developer 尝试 close → 应返回 400 权限错误
4. 有团队 admin 尝试 close → 应成功
5. 创建扫描任务（deep 类型）→ 状态应为 running 而非 failed

- [ ] **Step 3: 如验证通过，commit 测试相关改动（如有）**

```bash
git status
# 如有测试文件变更
git add <test_files>
git commit -m "test: verify scanner and permission changes pass existing tests

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## 执行顺序说明

- **并行组A（扫描器）**: Task 1 → Task 2 → Task 3 → Task 4
- **并行组B（权限）**: Task 5 → Task 6 → Task 7 → Task 8 → Task 9 → Task 10 → Task 11 → Task 12
- **验证**: Task 13（在所有任务完成后执行）

两组可并行实施，但组内必须顺序执行。每个 Task 的 commit 是独立可工作的增量。
