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
from ninja.errors import HttpError
from ninja.security import django_auth
from pydantic import BaseModel, Field, validator
from typing import Optional, List, Dict, Any
from datetime import datetime
from ninja import Query

from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.models import User
from django.http import HttpRequest, HttpResponse
from django.db.models import Q

from website.models import (
    Report,
    ScanTask,
    Vulnerability,
    AuditLog,
    Project,
    TeamMembership,
    Issue  # 复用原有 Issue 模型进行关联查询
)
from website.models import Organization

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
    username: str = Field(..., description="用户名")
    password: str = Field(..., description="密码")


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
    title: str = Field(..., description="漏洞标题")
    description: str = Field(..., description="漏洞详细描述")
    severity: str = Field("medium", description="严重程度: critical/high/medium/low")
    project_id: int = Field(..., description="所属项目ID")
    cve_id: Optional[str] = Field(None, description="CVE编号（可选）")
    affected_url: Optional[str] = Field(None, description="受影响的URL")
    reproduction_steps: Optional[str] = Field(None, description="复现步骤")
    assignee_id: Optional[int] = Field(None, description="指派处理人ID")

    @validator('severity')
    def validate_severity(cls, v):
        allowed = ['critical', 'high', 'medium', 'low']
        if v not in allowed:
            raise HttpError(400, f"严重程度必须是: {', '.join(allowed)}")
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
    comment: Optional[str] = Field(None, description="分派备注")


class StatusTransitionSchema(BaseModel):
    action: str = Field(..., description="操作类型: submit_fix/confirm_review/close/reopen")
    comment: Optional[str] = Field(None, description="操作备注/修复说明")

    @validator('action')
    def validate_action(cls, v):
        allowed = ['submit_fix', 'confirm_review', 'close', 'reopen']
        if v not in allowed:
            raise HttpError(400, f"操作类型必须是: {', '.join(allowed)}")
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


def annotate_report(report):
    """为 Report 对象添加响应所需的注解字段"""
    from django.db.models import F
    return (
        Report.objects
        .filter(vuln_id=report.vuln_id)
        .select_related('reporter', 'assignee', 'project')
        .annotate(
            reporter_username=F('reporter__username'),
            assignee_username=F('assignee__username'),
            project_name=F('project__name'),
        )
        .first()
    )


def create_audit_log(user, action: str, target_type: str, target_id: str,
                     detail: str = "", request: HttpRequest = None):
    """创建审计日志记录（核心审计功能）"""
    ip_address = get_client_ip(request) if request else None
    team = None
    if user and user.is_authenticated and hasattr(user, 'userprofile'):
        membership = TeamMembership.objects.filter(
            user=user,
            status=TeamMembership.Status.ACCEPTED,
        ).first()
        if membership:
            team = membership.team
    AuditLog.objects.create(
        user=user,
        action=action,
        target_type=target_type,
        target_id=str(target_id),
        detail=detail,
        ip_address=ip_address,
        team=team,
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


def get_user_team(request: HttpRequest):
    """
    获取当前用户的主团队（根据 UserProfile.team 决定）。
    系统管理员 (is_staff) 可跨团队访问。
    返回 (team, membership) 元组，若未加入团队则返回 (None, None)。
    """
    if not request.user.is_authenticated or not hasattr(request.user, 'userprofile'):
        return None, None
    profile = request.user.userprofile
    if profile.team:
        membership = TeamMembership.objects.filter(
            user=request.user, team=profile.team,
            status=TeamMembership.Status.ACCEPTED,
        ).select_related('team').first()
        if membership:
            return membership.team, membership
    # fallback: any accepted team
    membership = TeamMembership.objects.filter(
        user=request.user,
        status=TeamMembership.Status.ACCEPTED,
    ).select_related('team').first()
    if membership:
        return membership.team, membership
    return None, None


def require_team(request: HttpRequest):
    """获取团队，若未加入团队则抛异常"""
    team, membership = get_user_team(request)
    if team is None:
        raise HttpError(400, "您尚未加入任何团队，请先创建或加入团队")
    return team, membership


def require_team_role(request: HttpRequest, allowed_roles: list):
    """获取团队并要求指定角色"""
    team, membership = require_team(request)
    if request.user.is_staff:
        return team, membership
    if membership.role not in allowed_roles:
        role_labels = dict(TeamMembership.Role.choices)
        allowed_labels = [role_labels.get(r, r) for r in allowed_roles]
        raise HttpError(400, f"需要{'/'.join(allowed_labels)}权限才能执行此操作")
    return team, membership


def filter_by_team(queryset, request: HttpRequest):
    """对 queryset 按用户团队过滤；管理员不过滤"""
    if request.user.is_staff:
        return queryset
    team, _ = get_user_team(request)
    if team is None:
        return queryset.none()
    return queryset.filter(team=team)


def set_request_team(request: HttpRequest) -> Optional[Organization]:
    """返回当前用户 team 用于创建记录"""
    if request.user.is_staff:
        return None
    team, _ = get_user_team(request)
    return team


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
    from django.db.models import F as FExpr
    return queryset.select_related(
        'reporter',
        'assignee',
        'project'
    ).annotate(
        reporter_username=FExpr('reporter__username'),
        assignee_username=FExpr('assignee__username'),
        project_name=FExpr('project__name')
    )


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
        raise HttpError(400, "用户名或密码错误")

    if not user.is_active:
        raise HttpError(400, "账户已被禁用，请联系管理员")

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


@router.get("/auth/me")
def api_get_current_user(request: HttpRequest):
    """
    获取当前登录用户完整信息
    包含团队角色等用于前端权限渲染
    """
    if not request.user.is_authenticated:
        raise HttpError(400, "未登录或会话已过期")
    team, membership = get_user_team(request)
    return {
        "id": request.user.id,
        "username": request.user.username,
        "email": request.user.email or "",
        "is_staff": request.user.is_staff,
        "is_superuser": request.user.is_superuser,
        "team_id": team.id if team else None,
        "team_name": team.name if team else None,
        "role": membership.role if membership else None,
    }


class RegisterSchema(BaseModel):
    username: str = Field(..., description="用户名")
    password: str = Field(..., description="密码")
    email: Optional[str] = Field(None, description="邮箱（可选）")


@router.post("/auth/register", response=LoginResponse, auth=None)
def api_register(request: HttpRequest, payload: RegisterSchema):
    """用户注册接口"""
    if User.objects.filter(username=payload.username).exists():
        raise HttpError(400, "用户名已被注册，请更换用户名")

    user = User.objects.create_user(
        username=payload.username,
        password=payload.password,
        email=payload.email or "",
    )
    user.save()

    from website.models import UserProfile
    UserProfile.objects.get_or_create(user=user)

    create_audit_log(
        user=user, action='REGISTER_SUCCESS', target_type='User',
        target_id=str(user.id), detail=f"新用户注册: {user.username}",
        request=request
    )

    return LoginResponse(success=True, message="注册成功，请登录", user_id=user.id, username=user.username, is_staff=user.is_staff)


@router.get("/auth/check", auth=None)
def api_check_auth(request: HttpRequest):
    is_auth = request.user.is_authenticated
    team, membership = get_user_team(request)
    return {
        "authenticated": is_auth,
        "user_id": request.user.id if is_auth else None,
        "username": request.user.username if is_auth else None,
        "is_staff": request.user.is_staff if is_auth else False,
        "team_id": team.id if team else None,
        "team_name": team.name if team else None,
        "role": membership.role if membership else None,
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
        raise HttpError(400, "请先登录后提交漏洞报告")

    if not payload.title.strip():
        raise HttpError(400, "请输入漏洞标题")
    if not payload.description.strip():
        raise HttpError(400, "请输入漏洞描述")
    if len(payload.description.strip()) < 10:
        raise HttpError(400, "漏洞描述至少需要10个字符")

    try:
        project = Project.objects.get(id=payload.project_id)
    except Project.DoesNotExist:
        raise HttpError(400, f"项目ID {payload.project_id} 不存在，请选择有效的项目")

    assignee = None
    if payload.assignee_id:
        try:
            assignee = User.objects.get(id=payload.assignee_id)
        except User.DoesNotExist:
            raise HttpError(400, "指定的处理人不存在")

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
        status=Report.Status.PENDING if not assignee else Report.Status.PROCESSING,
        reporter=request.user,
        assignee=assignee,
        project=project,
        team=set_request_team(request),
        cve_id=payload.cve_id or "",
        affected_url=payload.affected_url or "",
        reproduction_steps=payload.reproduction_steps or "",
    )

    create_audit_log(
        user=request.user,
        action='CREATE_REPORT',
        target_type='Report',
        target_id=report.vuln_id,
        detail=f"创建漏洞报告 [{report.vuln_id}]: {report.title}",
        request=request
    )

    from django.db.models import F
    vuln_id = report.vuln_id
    return annotate_report(report)


@router.get("/reports")
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
    返回 { items: [...], total_count: N, page: N, per_page: N }
    """
    queryset = Report.objects.all()

    queryset = filter_by_team(queryset, request)

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

    total_count = queryset.count()

    valid_sort_fields = ['created_at', 'updated_at', 'severity', 'status']
    if sort_by in valid_sort_fields:
        order_prefix = '-' if order == 'desc' else ''
        queryset = queryset.order_by(f"{order_prefix}{sort_by}")
    else:
        queryset = queryset.order_by('-created_at')

    start = (page - 1) * per_page
    end = start + per_page

    reports = annotate_report_queryset(queryset)[start:end]

    return {
        "items": [ReportListSchema.from_orm(r) for r in reports],
        "total_count": total_count,
        "page": page,
        "per_page": per_page,
    }


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
        from django.db.models import F
        report = (
            Report.objects
            .select_related('reporter', 'assignee', 'project')
            .annotate(
                reporter_username=F('reporter__username'),
                assignee_username=F('assignee__username'),
                project_name=F('project__name'),
            )
            .get(vuln_id=vuln_id)
        )
    except Report.DoesNotExist:
        raise HttpError(400, f"漏洞报告 {vuln_id} 不存在或已被删除")

    return annotate_report(report)


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
        raise HttpError(400, "请先登录")

    try:
        report = Report.objects.get(vuln_id=vuln_id)
    except Report.DoesNotExist:
        raise HttpError(400, f"漏洞报告 {vuln_id} 不存在")

    if report.reporter != request.user and not request.user.is_staff:
        raise HttpError(400, "只有上报人或管理员可以修改此漏洞报告")

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

    return annotate_report(report)


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
        raise HttpError(400, "需要项目经理或管理员权限才能分派漏洞")

    try:
        report = Report.objects.select_related('assignee').get(vuln_id=vuln_id)
    except Report.DoesNotExist:
        raise HttpError(400, f"漏洞报告 {vuln_id} 不存在")

    if report.status not in [Report.Status.PENDING, Report.Status.PROCESSING]:
        raise HttpError(400, 
            f"当前状态 '{report.get_status_display()}' 不允许分派操作，"
            f"仅允许在 '待分派' 或 '处理中' 状态下分派"
        )

    try:
        assignee = User.objects.get(id=payload.assignee_id)
    except User.DoesNotExist:
        raise HttpError(400, f"被分派的用户ID {payload.assignee_id} 不存在")

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

    return annotate_report(report)


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
        raise HttpError(400, "请先登录")

    try:
        report = Report.objects.get(vuln_id=vuln_id)
    except Report.DoesNotExist:
        raise HttpError(400, f"漏洞报告 {vuln_id} 不存在")

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
        raise HttpError(400, 
            f"无效的操作类型: {payload.action}\n"
            f"允许的操作: {', '.join(valid_actions.keys())}"
        )

    action_config = valid_actions[payload.action]

    if report.status not in action_config['from_status']:
        current_status_display = report.get_status_display()
        allowed_from = [Report(s=s).get_status_display() for s in action_config['from_status']]
        raise HttpError(400, 
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
        raise HttpError(400, 
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

    return annotate_report(report)


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
        raise HttpError(400, "请先登录")

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
    if not request.user.is_authenticated:
        raise HttpError(400, "请先登录")

    queryset = AuditLog.objects.all()
    queryset = filter_by_team(queryset, request)

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
    if not request.user.is_authenticated:
        raise HttpError(400, "请先登录")

    qs = filter_by_team(Report.objects, request)

    total_reports = qs.count()
    status_stats = qs.values('status').annotate(count=models.Count('pk')).order_by('-count')
    severity_stats = qs.values('severity').annotate(count=models.Count('pk')).order_by('-count')
    pending_count = qs.filter(status=Report.Status.PENDING).count()
    processing_count = qs.filter(status=Report.Status.PROCESSING).count()
    fixed_count = qs.filter(status=Report.Status.FIXED).count()
    closed_count = qs.filter(status=Report.Status.CLOSED).count()

    recent_reports = qs.select_related('reporter', 'assignee').order_by('-created_at')[:5]

    return {
        'total_reports': total_reports,
        'status_distribution': list(status_stats),
        'severity_distribution': list(severity_stats),
        'pending_count': pending_count,
        'processing_count': processing_count,
        'fixed_count': fixed_count,
        'recent_reports': [
            {'vuln_id': r.vuln_id, 'title': r.title, 'status': r.status, 'severity': r.severity, 'created_at': r.created_at.isoformat()}
            for r in recent_reports
        ],
        'timestamp': datetime.now().isoformat()
    }


@router.delete("/reports/{vuln_id}")
def delete_report(request: HttpRequest, vuln_id: str):
    if not request.user.is_authenticated:
        raise HttpError(400, "请先登录")
    try:
        report = Report.objects.get(vuln_id=vuln_id)
    except Report.DoesNotExist:
        raise HttpError(400, f"漏洞报告 {vuln_id} 不存在")
    if report.reporter != request.user and not request.user.is_staff:
        raise HttpError(400, "只有上报人或管理员可以删除此漏洞报告")
    report.delete()
    create_audit_log(user=request.user, action='DELETE_REPORT', target_type='Report',
                     target_id=vuln_id, detail=f"删除漏洞报告 {vuln_id}", request=request)
    return {"success": True, "message": f"漏洞报告 {vuln_id} 已删除"}


class ScanTaskOut(BaseModel):
    id: int
    scan_id: str
    target: str
    status: str
    scanner_type: str
    progress: int
    findings_count: int
    created_by: Optional[int]
    created_by_name: Optional[str]
    started_at: Optional[datetime]
    finished_at: Optional[datetime]
    created_at: datetime

    class Config:
        from_attributes = True


class ScanTaskCreateSchema(BaseModel):
    target: str = Field(..., description="扫描目标URL")
    scanner_type: str = Field("deep", description="扫描类型: deep/quick/custom")
    name: Optional[str] = Field(None, description="任务名称（可选，默认自动生成）")


@router.get("/scans")
def list_scans(
    request: HttpRequest,
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    status: Optional[str] = Query(None),
):
    queryset = ScanTask.objects.all()
    queryset = filter_by_team(queryset, request)
    if status:
        queryset = queryset.filter(status=status)

    total_count = queryset.count()
    items = queryset.select_related('created_by').order_by('-started_at')[(page - 1) * per_page:page * per_page]

    result = []
    for t in items:
        result.append(ScanTaskOut(
            id=t.id,
            scan_id=f"SC-{t.id:04d}",
            target=t.target,
            status=t.status,
            scanner_type=t.scanner_type,
            progress=getattr(t, 'progress', 0),
            findings_count=getattr(t, 'findings_count', 0),
            created_by=t.created_by_id,
            created_by_name=t.created_by.username if t.created_by else None,
            started_at=t.started_at,
            finished_at=t.finished_at,
            created_at=t.started_at,
        ))

    return {"items": result, "total_count": total_count, "page": page, "per_page": per_page}


@router.post("/scans")
def create_scan(request: HttpRequest, payload: ScanTaskCreateSchema):
    if not request.user.is_authenticated:
        raise HttpError(400, "请先登录")
    task = ScanTask.objects.create(
        name=payload.name or f"Scan_{payload.target}_{datetime.now().strftime('%Y%m%d%H%M')}",
        target=payload.target,
        scanner_type=payload.scanner_type,
        status=ScanTask.Status.PENDING,
        team=set_request_team(request),
        created_by=request.user,
    )
    return {
        "id": task.id,
        "scan_id": f"SC-{task.id:04d}",
        "target": task.target,
        "status": task.status,
        "scanner_type": task.scanner_type,
        "message": "扫描任务已创建"
    }


class ExportSchema(BaseModel):
    format: str = Field("pdf", description="导出格式: pdf/html")
    project_id: Optional[int] = Field(None, description="项目筛选")
    status: Optional[str] = Field(None, description="状态筛选")


@router.post("/reports-export", auth=None)
def export_reports(request: HttpRequest, payload: ExportSchema):
    if not request.user.is_authenticated:
        raise HttpError(400, "请先登录")

    queryset = Report.objects.all()
    queryset = filter_by_team(queryset, request)
    if payload.project_id:
        queryset = queryset.filter(project_id=payload.project_id)
    if payload.status:
        queryset = queryset.filter(status=payload.status)

    reports = queryset.select_related('reporter', 'assignee', 'project').order_by('-created_at')

    total = queryset.count()
    pending = queryset.filter(status=Report.Status.PENDING).count()
    processing = queryset.filter(status=Report.Status.PROCESSING).count()
    fixed = queryset.filter(status=Report.Status.FIXED).count()
    reviewing = queryset.filter(status=Report.Status.REVIEWING).count()
    closed = queryset.filter(status=Report.Status.CLOSED).count()
    fix_rate = f"{(fixed + closed) / total * 100:.1f}%" if total > 0 else "0%"

    sev_map = {"critical": "严重", "high": "高危", "medium": "中危", "low": "低危"}
    sta_map = {"pending": "待分派", "processing": "处理中", "fixed": "已修复", "reviewing": "已复核", "closed": "已关闭"}

    rows = ""
    for r in reports:
        rows += f"""<tr>
            <td>{r.vuln_id}</td><td>{r.title}</td><td>{sev_map.get(r.severity, r.severity)}</td>
            <td>{sta_map.get(r.status, r.status)}</td><td>{r.reporter.username if r.reporter else ''}</td>
            <td>{r.assignee.username if r.assignee else ''}</td><td>{r.created_at.strftime('%Y-%m-%d')}</td>
        </tr>"""

    html = f"""<!DOCTYPE html>
<html lang="zh">
<head><meta charset="UTF-8"><title>SecGuard 安全审计报告</title>
<style>
    body{{font-family:'Microsoft YaHei',sans-serif;max-width:960px;margin:40px auto;color:#1a1a2e;}}
    h1{{color:#0ea5e9;border-bottom:2px solid #0ea5e9;padding-bottom:10px;}}
    .summary{{display:flex;gap:16px;flex-wrap:wrap;margin:20px 0;}}
    .card{{border-left:4px solid #0ea5e9;background:#f0f9ff;padding:12px 20px;border-radius:8px;flex:1;min-width:120px;}}
    .card .num{{font-size:32px;font-weight:bold;}}
    table{{width:100%;border-collapse:collapse;margin-top:20px;}}
    th,td{{border:1px solid #e2e8f0;padding:10px;text-align:left;font-size:14px;}}
    th{{background:#0ea5e9;color:#fff;}}
    tr:nth-child(even){{background:#f8fafc;}}
    .footer{{margin-top:40px;font-size:12px;color:#94a3b8;text-align:center;}}
</style></head>
<body>
<h1>🔒 SecGuard 安全漏洞审计报告</h1>
<p>生成时间: {datetime.now().strftime('%Y-%m-%d %H:%M')} | 格式: {payload.format.upper()}</p>
<div class="summary">
    <div class="card"><div>漏洞总数</div><div class="num">{total}</div></div>
    <div class="card"><div>待处理</div><div class="num">{pending}</div></div>
    <div class="card"><div>处理中</div><div class="num">{processing}</div></div>
    <div class="card"><div>已修复</div><div class="num">{fixed}</div></div>
    <div class="card"><div>修复率</div><div class="num">{fix_rate}</div></div>
</div>
<table><thead><tr><th>编号</th><th>标题</th><th>严重程度</th><th>状态</th><th>报告人</th><th>处理人</th><th>日期</th></tr></thead>
<tbody>{rows}</tbody></table>
<p class="footer">SecGuard Sentinel — 漏洞管理与跟踪平台 | 数据基于团队权限导出</p>
</body></html>"""

    if payload.format == "html":
        resp = HttpResponse(html, content_type="text/html; charset=utf-8")
        resp["Content-Disposition"] = f'attachment; filename="secguard-report-html-{datetime.now().strftime("%Y%m%d")}.html"'
        return resp
    elif payload.format == "pdf":
        pdf_html = html.replace('<h1>', '<h1><small style="color:#94a3b8;">[PDF 报告 — 请使用 Ctrl+P 打印为 PDF]</small> ')
        resp = HttpResponse(pdf_html, content_type="text/html; charset=utf-8")
        resp["Content-Disposition"] = f'attachment; filename="secguard-report-pdf-{datetime.now().strftime("%Y%m%d")}.html"'
        return resp
    else:
        items = []
        for r in reports:
            items.append({
                "vuln_id": r.vuln_id, "title": r.title, "severity": r.severity,
                "status": r.status, "reporter": r.reporter.username if r.reporter else "",
                "assignee": r.assignee.username if r.assignee else "",
                "project": r.project.name if r.project else "", "created_at": r.created_at.isoformat(),
            })
        return {
            "format": payload.format, "generated_at": datetime.now().isoformat(),
            "summary": {"total": total, "pending": pending, "processing": processing, "fixed": fixed, "reviewing": reviewing, "closed": closed, "fix_rate": fix_rate},
            "items": items,
        }


# Asset endpoint
@router.get("/assets")
def list_assets(request: HttpRequest):
    if not request.user.is_authenticated:
        raise HttpError(400, "请先登录")

    if request.user.is_staff:
        scan_targets = ScanTask.objects.values('target').distinct()
        affected_urls = Report.objects.exclude(affected_url="").values('affected_url').distinct()
    else:
        team, _ = get_user_team(request)
        if team is None:
            return {"items": [], "total_count": 0}
        scan_targets = ScanTask.objects.filter(team=team).values('target').distinct()
        affected_urls = Report.objects.filter(team=team).exclude(affected_url="").values('affected_url').distinct()

    urls = set()
    for t in scan_targets: urls.add(t['target'])
    for r in affected_urls: urls.add(r['affected_url'])

    assets = []
    for url in urls:
        if not url: continue
        if request.user.is_staff:
            vuln_count = Report.objects.filter(affected_url=url).count()
            last_scan = ScanTask.objects.filter(target=url).order_by('-started_at').first()
        else:
            team, _ = get_user_team(request)
            vuln_count = Report.objects.filter(affected_url=url, team=team).count() if team else 0
            last_scan = ScanTask.objects.filter(target=url, team=team).order_by('-started_at').first() if team else None
        assets.append({
            "id": abs(hash(url)) % 10000,
            "name": url,
            "url": url,
            "type": "web_app",
            "status": "online" if last_scan and last_scan.status == "finished" else "unknown",
            "vulnerabilities": vuln_count,
            "last_scan": last_scan.started_at.isoformat() if last_scan else None,
            "criticality": "high" if vuln_count >= 5 else "medium" if vuln_count >= 1 else "low",
        })

    return {"items": assets, "total_count": len(assets)}


# ==============================================================================
# 团队管理接口 (Team Management)
# ==============================================================================

class TeamOut(BaseModel):
    id: int
    name: str
    created: datetime
    member_count: int = 0


class TeamMemberOut(BaseModel):
    user_id: int
    username: str
    email: str
    role: str
    role_label: str
    status: str
    status_label: str
    joined_at: datetime


class InviteSchema(BaseModel):
    username: str = Field(..., description="被邀请的用户名")


class TeamCreateSchema(BaseModel):
    name: str = Field(..., description="团队名称")


class TeamJoinSchema(BaseModel):
    team_id: int = Field(..., description="要加入的团队ID")


@router.post("/teams/create")
def team_create(request: HttpRequest, payload: TeamCreateSchema):
    """创建新团队，创建者自动成为团队管理员"""
    if not request.user.is_authenticated:
        raise HttpError(400, "请先登录")
    existing = Organization.objects.filter(name=payload.name, type="team").first()
    if existing:
        raise HttpError(400, f"团队名称 '{payload.name}' 已被使用")
    import uuid
    team = Organization.objects.create(
        name=payload.name, type="team", admin=request.user,
        url=f"team://{uuid.uuid4().hex[:12]}",
        is_active=True,
    )
    TeamMembership.objects.create(
        user=request.user, team=team,
        role=TeamMembership.Role.ADMIN,
        status=TeamMembership.Status.ACCEPTED,
    )
    profile = request.user.userprofile
    if not profile.team:
        profile.team = team
        profile.role = "admin"
        profile.save()

    create_audit_log(user=request.user, action='TEAM_CREATED', target_type='Team',
                     target_id=str(team.id), detail=f"创建团队 {team.name}", request=request)
    return {"success": True, "team_id": team.id, "team_name": team.name, "message": "团队创建成功"}



@router.post("/teams/join")
def team_join(request: HttpRequest, payload: TeamJoinSchema):
    """申请加入已有团队"""
    if not request.user.is_authenticated:
        raise HttpError(400, "请先登录")
    team = Organization.objects.filter(id=payload.team_id, type="team").first()
    if not team:
        raise HttpError(400, "指定的团队不存在")
    already = TeamMembership.objects.filter(user=request.user, team=team).first()
    if already:
        raise HttpError(400, "您已申请过该团队或已在团队中")
    TeamMembership.objects.create(
        user=request.user, team=team,
        role=TeamMembership.Role.DEVELOPER,
        status=TeamMembership.Status.PENDING,
    )
    create_audit_log(user=request.user, action='TEAM_JOIN_REQUEST', target_type='Team',
                     target_id=str(team.id), detail=f"申请加入团队 {team.name}", request=request)
    return {"success": True, "message": "申请已提交，请等待团队管理员审核"}


class HandleMemberSchema(BaseModel):
    action: str = Field(..., description="approve / reject")
    role: Optional[str] = Field(None, description="赋予角色: admin/team_lead/developer/observer")


@router.get("/teams")
def list_teams(request: HttpRequest, search: Optional[str] = Query(None)):
    """列出所有团队（用于注册时选择加入）"""
    if not request.user.is_authenticated:
        raise HttpError(400, "请先登录")
    qs = Organization.objects.filter(type="team")
    if search:
        qs = qs.filter(name__icontains=search)
    result = []
    for t in qs[:50]:
        result.append({
            "id": t.id,
            "name": t.name,
            "member_count": TeamMembership.objects.filter(team=t, status="accepted").count(),
            "admin_name": t.admin.username if t.admin else None,
        })
    return {"items": result}


@router.get("/teams/members")
def list_team_members(request: HttpRequest):
    """列出当前用户所在团队的所有已通过成员"""
    team, membership = require_team(request)
    ms = TeamMembership.objects.filter(team=team, status=TeamMembership.Status.ACCEPTED).select_related('user')
    items = []
    for m in ms:
        items.append({
            "id": m.id,
            "user_id": m.user.id,
            "username": m.user.username,
            "email": m.user.email or "",
            "role": m.role,
            "role_label": m.get_role_display(),
            "status": m.status,
            "status_label": m.get_status_display(),
            "joined_at": m.joined_at.isoformat(),
        })
    return {"items": items, "team_id": team.id, "team_name": team.name}


@router.get("/teams/pending")
def list_pending_members(request: HttpRequest):
    """列出待审核的成员（仅团队管理员）"""
    team, membership = require_team_role(request, ["admin", "team_lead"])
    ms = TeamMembership.objects.filter(team=team, status="pending").select_related('user')
    items = []
    for m in ms:
        items.append({
            "id": m.id,
            "user_id": m.user.id,
            "username": m.user.username,
            "email": m.user.email or "",
            "joined_at": m.joined_at.isoformat(),
        })
    return {"items": items}


@router.post("/teams/members/{member_id}/handle")
def handle_member(request: HttpRequest, member_id: int, payload: HandleMemberSchema):
    """审批成员（通过/拒绝/修改角色）"""
    team, membership = require_team_role(request, ["admin", "team_lead"])
    try:
        m = TeamMembership.objects.get(id=member_id, team=team)
    except TeamMembership.DoesNotExist:
        raise HttpError(400, "该申请不存在或不属于您的团队")

    if payload.action == "approve":
        m.status = TeamMembership.Status.ACCEPTED
        m.reviewed_by = request.user
        m.reviewed_at = datetime.now()
        if payload.role and payload.role in dict(TeamMembership.Role.choices):
            m.role = payload.role
        m.save()
        create_audit_log(user=request.user, action='TEAM_APPROVED', target_type='Team',
                         target_id=str(team.id), detail=f"通过了 {m.user.username} 的加入申请", request=request)
        return {"success": True, "message": f"已通过 {m.user.username} 的加入申请"}

    elif payload.action == "reject":
        m.status = TeamMembership.Status.REJECTED
        m.reviewed_by = request.user
        m.reviewed_at = datetime.now()
        m.save()
        create_audit_log(user=request.user, action='TEAM_REJECTED', target_type='Team',
                         target_id=str(team.id), detail=f"拒绝了 {m.user.username} 的加入申请", request=request)
        return {"success": True, "message": f"已拒绝 {m.user.username} 的加入申请"}

    elif payload.action == "change_role":
        if not payload.role:
            raise HttpError(400, "请指定新角色")
        if payload.role not in dict(TeamMembership.Role.choices):
            raise HttpError(400, "无效的角色类型")
        m.role = payload.role
        profile = m.user.userprofile
        profile.role = payload.role
        profile.save()
        m.save()
        return {"success": True, "message": f"已将 {m.user.username} 的角色更改为 {m.get_role_display()}"}

    raise HttpError(400, "无效的操作，请使用 approve / reject / change_role")


@router.post("/teams/invite")
def invite_member(request: HttpRequest, payload: InviteSchema):
    """邀请用户加入团队（需要被邀请人接受）"""
    team, membership = require_team_role(request, ["admin", "team_lead"])
    invited = User.objects.filter(username=payload.username).first()
    if not invited:
        raise HttpError(400, "用户不存在")
    already = TeamMembership.objects.filter(user=invited, team=team).first()
    if already:
        raise HttpError(400, "该用户已在团队中或已申请加入")
    TeamMembership.objects.create(
        user=invited, team=team,
        role=TeamMembership.Role.DEVELOPER,
        status=TeamMembership.Status.PENDING,
    )
    return {"success": True, "message": f"已邀请 {invited.username}，等待对方确认加入"}


@router.post("/teams/members/{member_id}/kick")
def kick_member(request: HttpRequest, member_id: int):
    """踢出团队成员（仅团队管理员）"""
    team, membership = require_team_role(request, ["admin"])
    try:
        m = TeamMembership.objects.get(id=member_id, team=team)
    except TeamMembership.DoesNotExist:
        raise HttpError(400, "该成员不存在")
    if m.user == request.user:
        raise HttpError(400, "不能踢出自己")
    if m.role == "admin":
        raise HttpError(400, "不能踢出团队管理员")
    username = m.user.username
    m.delete()
    create_audit_log(user=request.user, action='TEAM_KICKED', target_type='Team',
                     target_id=str(team.id), detail=f"将 {username} 移出团队", request=request)
    return {"success": True, "message": f"已将 {username} 移出团队"}


@router.post("/teams/accept-invite")
def accept_invite(request: HttpRequest):
    """用户接受团队邀请，加入但不改变当前活跃团队"""
    if not request.user.is_authenticated:
        raise HttpError(400, "请先登录")
    m = TeamMembership.objects.filter(user=request.user, status=TeamMembership.Status.PENDING).first()
    if not m:
        raise HttpError(400, "没有待处理的团队邀请")
    m.status = TeamMembership.Status.ACCEPTED
    m.joined_at = datetime.now()
    m.save()
    profile = request.user.userprofile
    # 仅当用户尚无团队时才设为活跃团队
    if not profile.team:
        profile.team = m.team
        profile.role = m.role
        profile.save()
    create_audit_log(user=request.user, action='TEAM_ACCEPTED', target_type='Team',
                     target_id=str(m.team.id), detail=f"接受了团队 {m.team.name} 的邀请", request=request)
    return {"success": True, "message": f"已加入团队 {m.team.name}", "team_id": m.team.id}


@router.post("/teams/decline-invite")
def decline_invite(request: HttpRequest):
    """用户拒绝团队邀请"""
    if not request.user.is_authenticated:
        raise HttpError(400, "请先登录")
    m = TeamMembership.objects.filter(user=request.user, status=TeamMembership.Status.PENDING).first()
    if not m:
        raise HttpError(400, "没有待处理的团队邀请")
    team_name = m.team.name
    m.delete()
    create_audit_log(user=request.user, action='TEAM_DECLINED', target_type='Team',
                     target_id=str(m.team.id), detail=f"拒绝了团队 {team_name} 的邀请", request=request)
    return {"success": True, "message": "已拒绝团队邀请"}


@router.post("/teams/switch")
def switch_team(request: HttpRequest):
    """切换当前活跃团队"""
    if not request.user.is_authenticated:
        raise HttpError(400, "请先登录")
    from pydantic import BaseModel as PydanticBase
    class SwitchSchema(PydanticBase): team_id: int
    import json
    body = json.loads(request.body)
    target_team_id = body.get('team_id', 0)
    m = TeamMembership.objects.filter(
        user=request.user, team_id=target_team_id,
        status=TeamMembership.Status.ACCEPTED,
    ).select_related('team').first()
    if not m:
        raise HttpError(400, "您不在此团队中或团队不存在")
    profile = request.user.userprofile
    profile.team = m.team
    profile.role = m.role
    profile.save()
    return {"success": True, "message": f"已切换到团队 {m.team.name}", "team_id": m.team.id, "team_name": m.team.name}


@router.get("/teams/my-teams")
def my_teams(request: HttpRequest):
    """列出当前用户所在的所有团队"""
    if not request.user.is_authenticated:
        raise HttpError(400, "请先登录")
    ms = TeamMembership.objects.filter(
        user=request.user, status=TeamMembership.Status.ACCEPTED,
    ).select_related('team')
    active_id = request.user.userprofile.team_id if hasattr(request.user, 'userprofile') else None
    return {
        "items": [
            {"team_id": m.team.id, "team_name": m.team.name, "role": m.role, "role_label": m.get_role_display(), "is_active": m.team_id == active_id}
            for m in ms
        ]
    }


@router.get("/teams/pending-invitation")
def check_pending_invitation(request: HttpRequest):
    """检查当前用户是否有待处理的团队邀请"""
    if not request.user.is_authenticated:
        raise HttpError(400, "请先登录")
    m = TeamMembership.objects.filter(user=request.user, status=TeamMembership.Status.PENDING).select_related('team').first()
    if not m:
        return {"has_pending": False}
    return {"has_pending": True, "team_id": m.team.id, "team_name": m.team.name}


# Admin: list all teams with members
@router.get("/admin/teams-dashboard")
def admin_teams_dashboard(request: HttpRequest):
    if not request.user.is_staff:
        raise HttpError(400, "需要超级管理员权限")
    teams = Organization.objects.filter(type="team")
    result = []
    for t in teams:
        ms = TeamMembership.objects.filter(team=t, status=TeamMembership.Status.ACCEPTED).select_related('user')
        result.append({
            "id": t.id, "name": t.name, "admin_name": t.admin.username if t.admin else None,
            "members": [{"user_id": m.user.id, "username": m.user.username, "role": m.role, "role_label": m.get_role_display()} for m in ms],
        })
    # users without team
    no_team = User.objects.filter(is_active=True).exclude(
        id__in=TeamMembership.objects.filter(status=TeamMembership.Status.ACCEPTED).values('user_id')
    ).values('id', 'username', 'email', 'is_staff')
    return {"teams": result, "users_without_team": list(no_team)}


import django.db.models as models
