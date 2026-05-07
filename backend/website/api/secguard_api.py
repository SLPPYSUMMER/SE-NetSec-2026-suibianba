"""
SecGuard API - 基于 Django Ninja 的漏洞管理平台接口
提供认证、CRUD、状态流转等核心功能

技术栈: Django Ninja + Pydantic v2
架构目标: 前后端分离，为 next.js/React 前端提供 RESTful API

复用现有 BLT 组件:
  - website.models: Report, ScanTask, Vulnerability, AuditLog (Day 1 新增)
  - django.contrib.auth: 用户认证系统
  - website.utils: 文件验证、URL 处理工具
  - website.duplicate_checker: 漏洞去重检测
"""

from ninja import Router
from ninja.security import django_auth
from pydantic import BaseModel, Field, validator
from typing import Optional, List, Dict, Any
from datetime import datetime
from ninja import Query

from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.models import User
from django.http import HttpRequest
from django.db.models import Q

from website.models import (
    Report,
    ScanTask,
    Vulnerability,
    AuditLog,
    Project,
    Issue  # 复用原有 Issue 模型进行关联查询
)

# 复用 BLT 现有工具函数
try:
    from website.utils import rebuild_safe_url, validate_file_type, image_validator
    UTILS_AVAILABLE = True
except ImportError:
    UTILS_AVAILABLE = False

# 复用 BLT 现有去重检测功能
try:
    from website.duplicate_checker import check_for_duplicates, find_similar_bugs, format_similar_bug
    DUPLICATE_CHECKER_AVAILABLE = True
except ImportError:
    DUPLICATE_CHECKER_AVAILABLE = False

router = Router(tags=["SecGuard"])


# ==============================================================================
# Pydantic Schemas (请求/响应模型) - 对接前端表单
# ==============================================================================

class LoginSchema(BaseModel):
    username: str = Field(..., description="用户名", min_length=3, max_length=150)
    password: str = Field(..., description="密码", min_length=6)


class LoginResponse(BaseModel):
    success: bool = True
    message: str = "登录成功"
    user_id: int
    username: str
    is_staff: bool = False


class UserSchema(BaseModel):
    id: int
    username: str
    email: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    is_staff: bool = False
    date_joined: Optional[datetime] = None

    class Config:
        from_attributes = True


class ReportCreateSchema(BaseModel):
    title: str = Field(..., min_length=1, max_length=255, description="漏洞标题")
    description: str = Field(..., min_length=10, description="漏洞详细描述")
    severity: str = Field("medium", description="严重程度: critical/high/medium/low")
    project_id: int = Field(..., description="所属项目ID")
    cve_id: Optional[str] = Field(None, max_length=50, description="CVE编号（可选）")
    affected_url: Optional[str] = Field(None, description="受影响的URL")
    reproduction_steps: Optional[str] = Field(None, description="复现步骤")

    @validator('severity')
    def validate_severity(cls, v):
        allowed = ['critical', 'high', 'medium', 'low']
        if v not in allowed:
            raise ValueError(f"严重程度必须是: {', '.join(allowed)}")
        return v

    @validator('affected_url')
    def validate_url(cls, v):
        if v and UTILS_AVAILABLE:
            return rebuild_safe_url(v) if rebuild_safe_url else v
        return v


class ReportUpdateSchema(BaseModel):
    title: Optional[str] = Field(None, max_length=255)
    description: Optional[str] = None
    severity: Optional[str] = None
    affected_url: Optional[str] = None


class ReportListSchema(BaseModel):
    vuln_id: str
    title: str
    severity: str
    status: str
    reporter_id: int
    reporter_username: Optional[str]
    assignee_id: Optional[int]
    assignee_username: Optional[str]
    project_id: int
    project_name: Optional[str]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ReportDetailSchema(BaseModel):
    vuln_id: str
    title: str
    description: str
    severity: str
    status: str
    cve_id: Optional[str]
    affected_url: Optional[str]
    reproduction_steps: Optional[str]
    reporter: UserSchema
    assignee: Optional[UserSchema]
    project_id: int
    project_name: Optional[str]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class AssignReportSchema(BaseModel):
    assignee_id: int = Field(..., description="被分派的用户ID")
    comment: Optional[str] = Field(None, max_length=500, description="分派备注")


class StatusTransitionSchema(BaseModel):
    action: str = Field(
        ...,
        description="操作类型: submit_fix/confirm_review/close/reopen"
    )
    comment: Optional[str] = Field(None, max_length=1000, description="操作备注/修复说明")

    @validator('action')
    def validate_action(cls, v):
        allowed = ['submit_fix', 'confirm_review', 'close', 'reopen']
        if v not in allowed:
            raise ValueError(f"操作类型必须是: {', '.join(allowed)}")
        return v


class AuditLogSchema(BaseModel):
    id: int
    user: Optional[UserSchema]
    action: str
    target_type: str
    target_id: str
    detail: str
    ip_address: Optional[str]
    timestamp: datetime

    class Config:
        from_attributes = True


class DuplicateCheckResponse(BaseModel):
    is_duplicate: bool
    similar_reports: List[Dict[str, Any]] = []
    confidence_score: float = 0.0
    message: str = ""


# ==============================================================================
# 辅助函数 (Helper Functions) - 复用和扩展 BLT 功能
# ==============================================================================

def get_client_ip(request: HttpRequest) -> str:
    """获取客户端IP地址（复用BLT通用实现）"""
    x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
    if x_forwarded_for:
        return x_forwarded_for.split(',')[0].strip()
    return request.META.get('REMOTE_ADDR', '0.0.0.0')


def create_audit_log(user, action: str, target_type: str, target_id: str,
                     detail: str = "", request: HttpRequest = None):
    """创建审计日志记录（核心审计功能）"""
    ip_address = get_client_ip(request) if request else None
    AuditLog.objects.create(
        user=user,
        action=action,
        target_type=target_type,
        target_id=str(target_id),
        detail=detail,
        ip_address=ip_address
    )


def check_permission(user, required_role: str = None) -> bool:
    """
    基于角色的权限检查（RBAC基础实现）
    可扩展为完整的权限系统
    """
    if not user.is_authenticated:
        return False

    role_permissions = {
        'admin': user.is_superuser or user.is_staff,
        'manager': user.is_staff or user.is_superuser,
        'tester': True,  # 所有认证用户都可测试
        'developer': True,  # 所有认证用户都可开发
    }

    if required_role and required_role not in role_permissions:
        return False

    if required_role:
        return role_permissions.get(required_role, False)

    return True


def check_report_duplicates(title: str, description: str, project_id: int) -> Dict:
    """
    漏洞去重检测（集成 BLT duplicate_checker）

    Returns:
        {
            'is_duplicate': bool,
            'similar_reports': list,
            'confidence_score': float,
            'message': str
        }
    """
    result = {
        'is_duplicate': False,
        'similar_reports': [],
        'confidence_score': 0.0,
        'message': '未发现重复'
    }

    if not DUPLICATE_CHECKER_AVAILABLE:
        result['message'] = '去重检测服务暂不可用'
        return result

    try:
        # 使用 BLT 现有去重逻辑
        similar_bugs = find_similar_bugs(title, description)

        if similar_bugs:
            result['is_duplicate'] = True
            result['similar_reports'] = [
                {
                    'vuln_id': bug.vuln_id if hasattr(bug, 'vuln_id') else bug.id,
                    'title': bug.title,
                    'similarity': bug.get('score', 0.8)
                }
                for bug in similar_bugs[:5]
            ]
            result['confidence_score'] = max(bug.get('score', 0.8) for bug in similar_bugs)
            result['message'] = f'发现 {len(similar_bugs)} 个相似漏洞报告'

    except Exception as e:
        result['message'] = f'去重检测异常: {str(e)}'

    return result


def annotate_report_queryset(queryset):
    """为 Report QuerySet 添加注解字段（优化列表查询性能）"""
    return queryset.select_related(
        'reporter',
        'assignee',
        'project'
    ).annotate(
        reporter_username=F('reporter__username'),
        assignee_username=F('assignee__username'),
        project_name=F('project__name')
    )

from django.db.models import F


# ==============================================================================
# 认证接口 (Authentication Endpoints) - 基于 Django Auth
# ==============================================================================

@router.post("/auth/login", response=LoginResponse, auth=None)
def api_login(request: HttpRequest, payload: LoginSchema):
    """
    用户登录接口
    验证用户名密码，创建会话，返回用户信息
    """
    user = authenticate(username=payload.username, password=payload.password)

    if not user:
        create_audit_log(
            user=None,
            action='LOGIN_FAILED',
            target_type='User',
            target_id=payload.username,
            detail=f"登录失败: 用户名或密码错误",
            request=request
        )
        raise ValueError("用户名或密码错误")

    if not user.is_active:
        raise ValueError("账户已被禁用，请联系管理员")

    login(request, user)

    create_audit_log(
        user=user,
        action='LOGIN_SUCCESS',
        target_type='User',
        target_id=str(user.id),
        detail=f"用户 {user.username} 登录成功 (IP: {get_client_ip(request)})",
        request=request
    )

    return LoginResponse(
        success=True,
        message="登录成功",
        user_id=user.id,
        username=user.username,
        is_staff=user.is_staff
    )


@router.post("/auth/logout", auth=None)
def api_logout(request: HttpRequest):
    """
    用户登出接口
    清除当前会话并记录日志
    """
    username = request.user.username if request.user.is_authenticated else "匿名用户"

    if request.user.is_authenticated:
        create_audit_log(
            user=request.user,
            action='LOGOUT',
            target_type='User',
            target_id=str(request.user.id),
            detail=f"用户 {username} 登出",
            request=request
        )
        logout(request)

    return {"success": True, "message": "已登出"}


@router.get("/auth/me", response=UserSchema)
def api_get_current_user(request: HttpRequest):
    """
    获取当前登录用户完整信息
    用于前端渲染用户头像、权限按钮等
    """
    if not request.user.is_authenticated:
        raise ValueError("未登录或会话已过期")

    return request.user


@router.get("/auth/check", auth=None)
def api_check_auth(request: HttpRequest):
    """
    检查当前登录状态（轻量级接口）
    用于前端路由守卫、Token 刷新等场景
    """
    is_auth = request.user.is_authenticated
    return {
        "authenticated": is_auth,
        "user_id": request.user.id if is_auth else None,
        "username": request.user.username if is_auth else None,
        "is_staff": request.user.is_staff if is_auth else False
    }


# ==============================================================================
# 漏洞去重检测接口 (Duplicate Check API) - 集成 BLT 功能
# ==============================================================================

@router.post("/reports/check-duplicate", response=DuplicateCheckResponse, auth=None)
def api_check_duplicate(request: HttpRequest, payload: ReportCreateSchema):
    """
    漏洞去重检测接口
    在正式提交前检查是否已存在相似漏洞

    用途：
      - 前端实时提示重复风险
      - 减少冗余报告提交
      - 提高漏洞库质量
    """
    result = check_report_duplicates(
        title=payload.title,
        description=payload.description,
        project_id=payload.project_id
    )

    return DuplicateCheckResponse(**result)


# ==============================================================================
# 漏洞报告 CRUD 接口 (Vulnerability Report CRUD)
# ==============================================================================

@router.post("/reports", response=ReportDetailSchema)
def create_report(request: HttpRequest, payload: ReportCreateSchema):
    """
    创建新的漏洞报告（漏洞上报）

    业务流程：
      1. 验证用户登录状态
      2. 校验输入数据（Pydantic Schema验证）
      3. 执行去重检测（可选）
      4. 创建 Report 记录
      5. 自动生成 vuln_id（SEC-YYYY-NNNN格式）
      6. 记录审计日志
      7. 返回完整报告详情
    """
    if not request.user.is_authenticated:
        raise ValueError("请先登录后提交漏洞报告")

    try:
        project = Project.objects.get(id=payload.project_id)
    except Project.DoesNotExist:
        raise ValueError(f"项目ID {payload.project_id} 不存在，请选择有效的项目")

    # 执行去重检测（如果可用）
    duplicate_result = check_report_duplicates(
        title=payload.title,
        description=payload.description,
        project_id=payload.project_id
    )

    if duplicate_result['is_duplicate']:
        create_audit_log(
            user=request.user,
            action='DUPLICATE_DETECTED',
            target_type='Report',
            target_id='pending',
            detail=f"检测到可能重复的漏洞: {duplicate_result['message']}",
            request=request
        )

    report = Report.objects.create(
        title=payload.title,
        description=payload.description,
        severity=payload.severity,
        status=Report.Status.PENDING,
        reporter=request.user,
        project=project,
        cve_id=payload.cve_id,
    )

    create_audit_log(
        user=request.user,
        action='CREATE_REPORT',
        target_type='Report',
        target_id=report.vuln_id,
        detail=f"创建漏洞报告 [{report.vuln_id}]: {report.title}",
        request=request
    )

    return report


@router.get("/reports", response=List[ReportListSchema])
def list_reports(
    request: HttpRequest,
    page: int = Query(1, ge=1, description="页码"),
    per_page: int = Query(20, ge=1, le=100, description="每页数量"),
    status: Optional[str] = Query(None, description="状态筛选: pending/processing/fixed/reviewing/closed"),
    severity: Optional[str] = Query(None, description="严重程度: critical/high/medium/low"),
    assignee_id: Optional[int] = Query(None, description="按处理人筛选"),
    reporter_id: Optional[int] = Query(None, description="按上报人筛选"),
    project_id: Optional[int] = Query(None, description="按项目筛选"),
    search: Optional[str] = Query(None, description="关键词搜索（标题/描述）"),
    sort_by: Optional[str] = Query(None, description="排序字段: created_at/severity/status"),
    order: Optional[str] = Query("desc", description="排序方向: asc/desc")
):
    """
    获取漏洞报告列表（支持多维度筛选和分页）

    使用场景：
      - Dashboard 统计面板
      - 漏洞管理列表页
      - 个人任务看板
      - 导出报表数据源
    """
    queryset = Report.objects.all()

    # 多维度筛选
    if status:
        queryset = queryset.filter(status=status)

    if severity:
        queryset = queryset.filter(severity=severity)

    if assignee_id:
        queryset = queryset.filter(assignee_id=assignee_id)

    if reporter_id:
        queryset = queryset.filter(reporter_id=reporter_id)

    if project_id:
        queryset = queryset.filter(project_id=project_id)

    if search:
        queryset = queryset.filter(
            Q(title__icontains=search) |
            Q(description__icontains=search) |
            Q(vuln_id__icontains=search)
        )

    # 排序处理
    valid_sort_fields = ['created_at', 'updated_at', 'severity', 'status']
    if sort_by in valid_sort_fields:
        order_prefix = '-' if order == 'desc' else ''
        queryset = queryset.order_by(f"{order_prefix}{sort_by}")
    else:
        queryset = queryset.order_by('-created_at')

    # 分页处理
    start = (page - 1) * per_page
    end = start + per_page

    reports = annotate_report_queryset(queryset)[start:end]

    return reports


@router.get("/reports/{vuln_id}", response=ReportDetailSchema)
def get_report_detail(request: HttpRequest, vuln_id: str):
    """
    获取漏洞报告完整详情

    包含内容：
      - 基本信息（标题、描述、严重程度）
      - 状态流转历史
      - 关联人员信息
      - 审计日志入口
    """
    try:
        report = (
            Report.objects
            .select_related('reporter', 'assignee', 'project')
            .get(vuln_id=vuln_id)
        )
    except Report.DoesNotExist:
        raise ValueError(f"漏洞报告 {vuln_id} 不存在或已被删除")

    return report


@router.put("/reports/{vuln_id}", response=ReportDetailSchema)
def update_report(request: HttpRequest, vuln_id: str, payload: ReportUpdateSchema):
    """
    更新漏洞报告基本信息

    权限控制：
      - 上报人可编辑自己的报告
      - 管理员可编辑所有报告
      - 其他人无权修改
    """
    if not request.user.is_authenticated:
        raise ValueError("请先登录")

    try:
        report = Report.objects.get(vuln_id=vuln_id)
    except Report.DoesNotExist:
        raise ValueError(f"漏洞报告 {vuln_id} 不存在")

    if report.reporter != request.user and not request.user.is_staff:
        raise ValueError("只有上报人或管理员可以修改此漏洞报告")

    update_data = payload.model_dump(exclude_unset=True)

    # URL 安全处理（复用 BLT utils）
    if 'affected_url' in update_data and update_data['affected_url'] and UTILS_AVAILABLE:
        update_data['affected_url'] = rebuild_safe_url(update_data['affected_url'])

    for field, value in update_data.items():
        setattr(report, field, value)

    report.save()

    create_audit_log(
        user=request.user,
        action='UPDATE_REPORT',
        target_type='Report',
        target_id=vuln_id,
        detail=f"更新字段: {', '.join(update_data.keys())}",
        request=request
    )

    return report


# ==============================================================================
# 状态流转接口 (Status Transition APIs) - 核心业务逻辑
# ==============================================================================

@router.post("/reports/{vuln_id}/assign", response=ReportDetailSchema)
def assign_report(request: HttpRequest, vuln_id: str, payload: AssignReportSchema):
    """
    分派漏洞给指定处理人

    状态转换：待分派(PENDING) / 处理中(PROCESSING) → 处理中(PROCESSING)

    权限要求：项目经理 / 管理员
    """
    if not check_permission(request.user, 'manager'):
        raise ValueError("需要项目经理或管理员权限才能分派漏洞")

    try:
        report = Report.objects.select_related('assignee').get(vuln_id=vuln_id)
    except Report.DoesNotExist:
        raise ValueError(f"漏洞报告 {vuln_id} 不存在")

    if report.status not in [Report.Status.PENDING, Report.Status.PROCESSING]:
        raise ValueError(
            f"当前状态 '{report.get_status_display()}' 不允许分派操作，"
            f"仅允许在 '待分派' 或 '处理中' 状态下分派"
        )

    try:
        assignee = User.objects.get(id=payload.assignee_id)
    except User.DoesNotExist:
        raise ValueError(f"被分派的用户ID {payload.assignee_id} 不存在")

    old_assignee = report.assignee.username if report.assignee else "未分配"
    report.assignee = assignee
    report.status = Report.Status.PROCESSING
    report.save()

    comment = payload.comment or f"将漏洞从 '{old_assignee}' 分派给 '{assignee.username}'"

    create_audit_log(
        user=request.user,
        action='ASSIGN_REPORT',
        target_type='Report',
        target_id=vuln_id,
        detail=comment,
        request=request
    )

    return report


@router.post("/reports/{vuln_id}/transition", response=ReportDetailSchema)
def transition_status(request: HttpRequest, vuln_id: str, payload: StatusTransitionSchema):
    """
    漏洞状态流转接口（核心业务流程）

    支持的状态转换：
    ┌─────────────────────────────────────────────────────────────┐
    │ PENDING ──(assign)──→ PROCESSING                             │
    │ PROCESSING ──(submit_fix)──→ FIXED                          │
    │ FIXED ──(confirm_review)──→ REVIEWING                       │
    │ REVIEWING ──(close)──→ CLOSED                               │
    │ CLOSED/FIXED/REVIEWING ──(reopen)──→ PROCESSING             │
    └─────────────────────────────────────────────────────────────┘

    权限矩阵：
      submit_fix     → 仅处理人(assignee)
      confirm_review → 上报人(reporter) 或 管理员(admin)
      close          → 项目经理(manager) 或 管理员(admin)
      reopen         → 项目经理(manager) 或 管理员(admin)
    """
    if not request.user.is_authenticated:
        raise ValueError("请先登录")

    try:
        report = Report.objects.get(vuln_id=vuln_id)
    except Report.DoesNotExist:
        raise ValueError(f"漏洞报告 {vuln_id} 不存在")

    valid_actions = {
        'submit_fix': {
            'from_status': [Report.Status.PROCESSING],
            'to_status': Report.Status.FIXED,
            'allowed_roles': ['assignee'],
            'action_name': '提交修复',
            'description': '标记漏洞已修复完成，等待复核'
        },
        'confirm_review': {
            'from_status': [Report.Status.FIXED],
            'to_status': Report.Status.REVIEWING,
            'allowed_roles': ['reporter', 'admin'],
            'action_name': '确认复核通过',
            'description': '安全测试人员验证修复有效'
        },
        'close': {
            'from_status': [Report.Status.REVIEWING],
            'to_status': Report.Status.CLOSED,
            'allowed_roles': ['manager', 'admin'],
            'action_name': '关闭漏洞',
            'description': '确认漏洞已完全解决，关闭工单'
        },
        'reopen': {
            'from_status': [Report.Status.FIXED, Report.Status.REVIEWING, Report.Status.CLOSED],
            'to_status': Report.Status.PROCESSING,
            'allowed_roles': ['manager', 'admin'],
            'action_name': '重新打开',
            'description': '重新激活漏洞进行再次处理'
        }
    }

    if payload.action not in valid_actions:
        raise ValueError(
            f"无效的操作类型: {payload.action}\n"
            f"允许的操作: {', '.join(valid_actions.keys())}"
        )

    action_config = valid_actions[payload.action]

    if report.status not in action_config['from_status']:
        current_status_display = report.get_status_display()
        allowed_from = [Report(s=s).get_status_display() for s in action_config['from_status']]
        raise ValueError(
            f"当前状态 '{current_status_display}' 不允许执行 '{action_config['action_name']}' 操作\n"
            f"允许的起始状态: {', '.join(allowed_from)}"
        )

    role_check = action_config['allowed_roles']
    is_allowed = False

    if 'admin' in role_check and request.user.is_staff:
        is_allowed = True
    elif 'manager' in role_check and request.user.is_staff:
        is_allowed = True
    elif 'assignee' in role_check and report.assignee == request.user:
        is_allowed = True
    elif 'reporter' in role_check and report.reporter == request.user:
        is_allowed = True

    if not is_allowed:
        raise ValueError(
            f"您没有权限执行 '{action_config['action_name']}' 操作\n"
            f"需要角色: {', '.join(role_check)}"
        )

    old_status = report.get_status_display()
    report.status = action_config['to_status']
    report.save()

    new_status = report.get_status_display()
    comment = payload.comment or (
        f"{action_config['action_name']}: {old_status} → {new_status}"
    )

    create_audit_log(
        user=request.user,
        action=payload.action.upper(),
        target_type='Report',
        target_id=vuln_id,
        detail=comment,
        request=request
    )

    return report


# ==============================================================================
# 审计日志查询接口 (Audit Log APIs) - 合规与追溯
# ==============================================================================

@router.get("/reports/{vuln_id}/audit-logs", response=List[AuditLogSchema])
def get_report_audit_logs(
    request: HttpRequest,
    vuln_id: str,
    limit: int = Query(50, ge=1, le=200, description="最大返回条数")
):
    """
    获取指定漏洞报告的审计日志时间轴

    用途：
      - 漏洞详情页展示操作历史
      - 问题追溯和责任认定
      - 安全合规审计
    """
    if not request.user.is_authenticated:
        raise ValueError("请先登录")

    logs = (
        AuditLog.objects
        .filter(target_type='Report', target_id=vuln_id)
        .select_related('user')
        .order_by('-timestamp')[:limit]
    )

    return logs


@router.get("/audit-logs", response=List[AuditLogSchema])
def list_audit_logs(
    request: HttpRequest,
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    action: Optional[str] = Query(None, description="按操作类型筛选"),
    target_type: Optional[str] = Query(None, description="按目标类型筛选"),
    user_id: Optional[int] = Query(None, description="按操作人筛选"),
    date_from: Optional[datetime] = Query(None, description="开始时间"),
    date_to: Optional[datetime] = Query(None, description="结束时间")
):
    """
    获取全局审计日志列表（仅管理员可用）

    管理功能：
      - 全局操作监控
      - 异常行为检测
      - 合规报表生成
    """
    if not request.user.is_staff:
        raise ValueError("需要管理员权限才能查看全局审计日志")

    queryset = AuditLog.objects.all()

    if action:
        queryset = queryset.filter(action__icontains=action)

    if target_type:
        queryset = queryset.filter(target_type=target_type)

    if user_id:
        queryset = queryset.filter(user_id=user_id)

    if date_from:
        queryset = queryset.filter(timestamp__gte=date_from)

    if date_to:
        queryset = queryset.filter(timestamp__lte=date_to)

    start = (page - 1) * per_page
    end = start + per_page

    logs = queryset.select_related('user').order_by('-timestamp')[start:end]

    return logs


# ==============================================================================
# 统计数据接口 (Statistics APIs) - Dashboard 数据源
# ==============================================================================

@router.get("/statistics/overview")
def api_statistics_overview(request: HttpRequest):
    """
    获取平台统计数据概览

    用于 Dashboard 首页展示：
      - 漏洞总数、各状态分布
      - 严重程度统计
      - 近期趋势数据
      - 待处理任务数量
    """
    if not request.user.is_authenticated:
        raise ValueError("请先登录")

    total_reports = Report.objects.count()

    status_stats = (
        Report.objects
        .values('status')
        .annotate(count=models.Count('id'))
        .order_by('-count')
    )

    severity_stats = (
        Report.objects
        .values('severity')
        .annotate(count=models.Count('id'))
        .order_by('-count')
    )

    pending_count = Report.objects.filter(status=Report.Status.PENDING).count()
    processing_count = Report.objects.filter(status=Report.Status.PROCESSING).count()

    recent_reports = (
        Report.objects
        .select_related('reporter', 'assignee')
        .order_by('-created_at')[:5]
    )

    return {
        'total_reports': total_reports,
        'status_distribution': list(status_stats),
        'severity_distribution': list(severity_stats),
        'pending_count': pending_count,
        'processing_count': processing_count,
        'recent_reports': [
            {
                'vuln_id': r.vuln_id,
                'title': r.title,
                'status': r.status,
                'severity': r.severity,
                'created_at': r.created_at.isoformat()
            }
            for r in recent_reports
        ],
        'timestamp': datetime.now().isoformat()
    }


import django.db.models as models
