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

import json

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
from django.db.models import Q, Count
from django.shortcuts import get_object_or_404
from django.utils import timezone

from website.models import (
    Report,
    ScanTask,
    Vulnerability,
    AuditLog,
    Project,
    TeamMembership,
    Notification,
    Attachment,
    Issue,  # 复用原有 Issue 模型进行关联查询
    Asset   # 资产模型，用于统计团队资产数量
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
    impact_scope: Optional[str] = Field(None, description="影响范围")
    assignee_id: Optional[int] = Field(None, description="指派处理人ID")
    personal: bool = Field(False, description="以个人身份提交（不关联团队）")

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


class ReportDeleteSchema(BaseModel):
    """漏洞批量删除请求"""
    report_ids: List[str] = Field(..., description="要删除的漏洞ID列表")


class AssetDeleteSchema(BaseModel):
    """资产批量删除请求"""
    targets: List[str] = Field(..., description="要删除的资产目标URL列表")


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
    data_source: str = "personal"
    source_name: str = "个人"
    team_id: Optional[int] = None
    processing_time: Optional[str] = None

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
    impact_scope: Optional[str] = None
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
    action: str = Field(..., description="操作类型: submit_fix/confirm_review/review_fail/close/reopen")
    comment: Optional[str] = Field(None, description="操作备注/修复说明/不通过原因")

    @validator('action')
    def validate_action(cls, v):
        allowed = ['submit_fix', 'confirm_review', 'review_fail', 'close', 'reopen']
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
    tid = str(target_id)
    if len(tid) > 50:
        tid = tid[:47] + '...'
    AuditLog.objects.create(
        user=user,
        action=action,
        target_type=target_type,
        target_id=tid,
        detail=detail,
        ip_address=ip_address,
        team=team,
    )


def create_notification(user, message: str, notification_type: str = "alert", link: str = ""):
    """创建站内通知"""
    Notification.objects.create(
        user=user,
        message=message,
        notification_type=notification_type,
        link=link,
    )


def notify_team_admins(team, message: str, notification_type: str = "alert", link: str = ""):
    """通知团队中所有管理员和项目经理"""
    memberships = TeamMembership.objects.filter(
        team=team,
        status=TeamMembership.Status.ACCEPTED,
        role__in=[TeamMembership.Role.ADMIN, TeamMembership.Role.TEAM_LEAD],
    )
    for m in memberships:
        create_notification(m.user, message, notification_type, link)


_GET_USER_TEAM_ROLE_UNSET = object()

def get_user_team_role(request: HttpRequest, team=_GET_USER_TEAM_ROLE_UNSET):
    """
    获取当前用户的团队角色。

    如果传入 team 参数（含 None），查询用户在该指定团队中的角色；
    如果未传入 team 参数，使用用户当前活跃团队（兼容旧调用）。

    返回 (role, has_team)，系统管理员返回 ('admin', True)。
    """
    if not request.user.is_authenticated:
        return None, False
    if request.user.is_staff:
        return 'admin', True

    if team is not _GET_USER_TEAM_ROLE_UNSET:
        if team is None:
            return None, False
        membership = TeamMembership.objects.filter(
            user=request.user, team=team,
            status=TeamMembership.Status.ACCEPTED,
        ).first()
        if membership:
            return membership.role, True
        return None, False

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


def check_permission(user, required_role: str = None) -> bool:
    """
    基础权限检查。is_staff 用户拥有所有权限。
    """
    if not user.is_authenticated:
        return False
    if user.is_superuser or user.is_staff:
        return True
    if required_role is None:
        return True
    return False


def _can_assign(user, team_role, has_team, assignee_id):
    """检查用户是否可以分派漏洞给指定处理人"""
    if user.is_staff:
        return True
    if has_team and team_role in (TeamMembership.Role.ADMIN, TeamMembership.Role.TEAM_LEAD):
        return True
    if not has_team:
        return assignee_id == user.id
    return False


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
    """对 queryset 按用户团队过滤；管理员不过滤；有团队用户看团队+个人数据；无团队用户只看自己的数据"""
    if not request.user.is_authenticated:
        return queryset.none()
    if request.user.is_staff:
        return queryset
    team, _ = get_user_team(request)
    if team is None:
        model = queryset.model
        from django.db.models import Q
        q = Q()
        if hasattr(model, 'reporter'):
            q |= Q(reporter=request.user)
        if hasattr(model, 'assignee'):
            q |= Q(assignee=request.user)
        if q:
            return queryset.filter(q)
        if hasattr(model, 'created_by'):
            return queryset.filter(created_by=request.user)
        elif hasattr(model, 'user'):
            return queryset.filter(user=request.user)
        return queryset.none()
    
    model = queryset.model
    
    from django.db.models import Q
    
    if hasattr(model, 'created_by'):
        return queryset.filter(Q(team=team) | Q(created_by=request.user))
    elif hasattr(model, 'reporter'):
        role, _ = get_user_team_role(request, team=team)
        if role in (TeamMembership.Role.ADMIN, TeamMembership.Role.TEAM_LEAD):
            team_q = Q(team=team)
        elif role == TeamMembership.Role.DEVELOPER:
            team_q = Q(team=team) & Q(assignee=request.user)
        elif role == TeamMembership.Role.OBSERVER:
            team_q = Q(team=team) & Q(reporter=request.user)
        else:
            team_q = Q(team=team)
        return queryset.filter(team_q | Q(reporter=request.user) | Q(assignee=request.user))
    elif hasattr(model, 'user'):
        return queryset.filter(Q(team=team) | Q(user=request.user))
    
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
        team_role, has_team = get_user_team_role(request)

        if not request.user.is_staff:
            if has_team and team_role not in (TeamMembership.Role.ADMIN, TeamMembership.Role.TEAM_LEAD):
                raise HttpError(400, "您没有权限指派处理人，请留空由管理员分派")
            elif not has_team and payload.assignee_id != request.user.id:
                raise HttpError(400, "您尚未加入团队，只能将漏洞指派给自己")

        try:
            assignee = User.objects.get(id=payload.assignee_id)
        except User.DoesNotExist:
            raise HttpError(400, f"被分派的用户ID {payload.assignee_id} 不存在")

    if payload.personal and not assignee:
        assignee = request.user

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
        team=None if payload.personal else set_request_team(request),
        cve_id=payload.cve_id or "",
        affected_url=payload.affected_url or "",
        reproduction_steps=payload.reproduction_steps or "",
        impact_scope=payload.impact_scope or "",
    )

    create_audit_log(
        user=request.user,
        action='CREATE_REPORT',
        target_type='Report',
        target_id=report.vuln_id,
        detail=f"创建漏洞报告 [{report.vuln_id}]: {report.title}",
        request=request
    )

    # 自动通知团队管理员/项目经理
    if report.team:
        notify_team_admins(
            report.team,
            f"新漏洞 {report.vuln_id} 已提交: {report.title}",
            "alert",
            f"/vulnerabilities/{report.vuln_id}"
        )
    # 如果创建时已分派，通知被分派人
    if assignee:
        create_notification(
            assignee,
            f"漏洞 {report.vuln_id} 已分派给您: {report.title}",
            "alert",
            f"/vulnerabilities/{report.vuln_id}"
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

    team, _ = get_user_team(request)

    now = timezone.now()
    result_items = []
    for r in reports:
        item = ReportListSchema.from_orm(r)
        # 根据报告的 team 字段判断数据来源（与扫描任务逻辑一致）
        if r.team_id:
            data_source = "team"
            source_name = r.team.name if r.team else f"团队{r.team_id}"
        else:
            data_source = "personal"
            source_name = "个人"

        # 计算处理时长
        delta = now - r.created_at
        if delta.days > 0:
            item.processing_time = f"{delta.days}天{delta.seconds // 3600}小时"
        elif delta.seconds >= 3600:
            item.processing_time = f"{delta.seconds // 3600}小时{(delta.seconds % 3600) // 60}分"
        else:
            item.processing_time = f"{delta.seconds // 60}分钟"

        item.data_source = data_source
        item.source_name = source_name
        item.team_id = r.team_id if r.team_id else None
        result_items.append(item)

    return {
        "items": result_items,
        "total_count": total_count,
        "page": page,
        "per_page": per_page,
    }


@router.post("/reports/batch-delete")
def batch_delete_reports(request: HttpRequest, payload: ReportDeleteSchema):
    """批量删除漏洞报告"""
    if not request.user.is_authenticated:
        raise HttpError(400, "请先登录")

    if not payload.report_ids:
        raise HttpError(400, "请提供要删除的漏洞 ID 列表")

    queryset = Report.objects.filter(vuln_id__in=[str(id) for id in payload.report_ids])

    deletable_ids = []
    forbidden_count = 0
    for report in queryset:
        if check_delete_permission(request, report):
            deletable_ids.append(report.vuln_id)
        else:
            forbidden_count += 1

    count, _ = Report.objects.filter(vuln_id__in=deletable_ids).delete()

    message = f"成功删除 {count} 个漏洞"
    if forbidden_count > 0:
        message += f"，{forbidden_count} 个因权限不足被跳过"

    audit_target_id = ', '.join(map(str, payload.report_ids))
    if len(audit_target_id) > 50:
        audit_target_id = audit_target_id[:47] + '...'

    AuditLog.objects.create(
        user=request.user, action='BATCH_REPORTS_DELETED', target_type='Report',
        target_id=audit_target_id,
        detail=f"批量删除漏洞: {count}个成功",
    )

    return {
        "success": True,
        "deleted": count,
        "skipped": forbidden_count,
        "message": message
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

    check_report_access(request, report)

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

    权限要求：
      - 系统管理员 / 团队管理员 / 安全负责人：可分派给任何人
      - 无团队用户：只能分派给自己
      - 开发人员/观察者：不可分派
    """
    if not request.user.is_authenticated:
        raise HttpError(400, "请先登录")

    try:
        report = Report.objects.select_related('assignee').get(vuln_id=vuln_id)
    except Report.DoesNotExist:
        raise HttpError(400, f"漏洞报告 {vuln_id} 不存在")

    check_report_access(request, report)

    team_role, has_team = get_user_team_role(request, team=report.team)

    if report.status not in [Report.Status.PENDING, Report.Status.PROCESSING]:
        raise HttpError(400,
            f"当前状态 '{report.get_status_display()}' 不允许分派操作，"
            f"仅允许在 '待分派' 或 '处理中' 状态下分派"
        )

    if not _can_assign(request.user, team_role, has_team, payload.assignee_id):
        raise HttpError(400, "您没有权限执行分派操作")

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

    # 通知被分派人
    create_notification(
        assignee,
        f"漏洞 {vuln_id} 已分派给您: {report.title}",
        "alert",
        f"/vulnerabilities/{vuln_id}"
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
    │ FIXED ──(review_fail)──→ PROCESSING                         │
    │ REVIEWING ──(close)──→ CLOSED                               │
    │ CLOSED/FIXED/REVIEWING ──(reopen)──→ PROCESSING             │
    └─────────────────────────────────────────────────────────────┘

    权限矩阵：
      submit_fix     → 仅处理人(assignee)
      confirm_review → 上报人(reporter) 或 管理员(admin)
      review_fail    → 上报人(reporter) 或 管理员(admin) — 复核不通过
      close          → 项目经理(manager) 或 管理员(admin)
      reopen         → 项目经理(manager) 或 管理员(admin) — 需填写重开原因
    """
    if not request.user.is_authenticated:
        raise HttpError(400, "请先登录")

    try:
        report = Report.objects.get(vuln_id=vuln_id)
    except Report.DoesNotExist:
        raise HttpError(400, f"漏洞报告 {vuln_id} 不存在")

    check_report_access(request, report)

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
        'review_fail': {
            'from_status': [Report.Status.FIXED],
            'to_status': Report.Status.PROCESSING,
            'allowed_roles': ['reporter', 'admin'],
            'action_name': '复核不通过',
            'description': '复核发现修复无效，退回重新处理'
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
            'description': '重新激活漏洞进行再次处理',
            'require_comment': True
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

    team_role, has_team = get_user_team_role(request, team=report.team)
    is_allowed = False

    if request.user.is_staff:
        is_allowed = True
    elif payload.action == 'submit_fix':
        if has_team and team_role == TeamMembership.Role.OBSERVER:
            is_allowed = False
        else:
            is_allowed = report.assignee == request.user
    elif payload.action in ('confirm_review', 'review_fail'):
        if has_team and team_role in (TeamMembership.Role.ADMIN, TeamMembership.Role.TEAM_LEAD):
            is_allowed = True
        elif has_team and team_role == TeamMembership.Role.DEVELOPER:
            is_allowed = report.reporter == request.user
        elif not has_team:
            is_allowed = report.reporter == request.user
        else:
            is_allowed = False
    elif payload.action in ('close', 'reopen'):
        if has_team and team_role not in (TeamMembership.Role.ADMIN, TeamMembership.Role.TEAM_LEAD):
            is_allowed = False
        elif not has_team:
            is_allowed = report.reporter == request.user
        else:
            is_allowed = True

    if not is_allowed:
        raise HttpError(400, f"您没有权限执行 '{action_config['action_name']}' 操作")

    if action_config.get('require_comment') and not payload.comment:
        raise HttpError(400, f"执行 '{action_config['action_name']}' 操作时必须填写原因说明")

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

    # 自动通知相关用户
    vuln_link = f"/vulnerabilities/{vuln_id}"
    if payload.action == 'submit_fix':
        create_notification(
            report.reporter,
            f"漏洞 {vuln_id} 已标记为已修复: {report.title}",
            "alert", vuln_link
        )
    elif payload.action == 'confirm_review':
        create_notification(
            report.reporter,
            f"漏洞 {vuln_id} 复核通过: {report.title}",
            "alert", vuln_link
        )
        if report.assignee:
            create_notification(
                report.assignee,
                f"漏洞 {vuln_id} 复核通过: {report.title}",
                "alert", vuln_link
            )
    elif payload.action == 'review_fail':
        if report.assignee:
            create_notification(
                report.assignee,
                f"漏洞 {vuln_id} 复核不通过，需重新修复: {payload.comment or report.title}",
                "alert", vuln_link
            )
    elif payload.action == 'close':
        if report.reporter:
            create_notification(
                report.reporter,
                f"漏洞 {vuln_id} 已关闭: {report.title}",
                "alert", vuln_link
            )
        if report.assignee:
            create_notification(
                report.assignee,
                f"漏洞 {vuln_id} 已关闭: {report.title}",
                "alert", vuln_link
            )
    elif payload.action == 'reopen':
        if report.reporter:
            create_notification(
                report.reporter,
                f"漏洞 {vuln_id} 已重新打开: {payload.comment or report.title}",
                "alert", vuln_link
            )
        if report.assignee:
            create_notification(
                report.assignee,
                f"漏洞 {vuln_id} 已重新打开，请重新处理: {payload.comment or ''}",
                "alert", vuln_link
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
# 附件管理接口 (Attachment APIs) — 文件上传/下载/删除
# ==============================================================================

ALLOWED_ATTACHMENT_EXTENSIONS = {
    "jpg", "jpeg", "png", "gif", "pdf",
    "zip", "tar", "gz", "doc", "docx",
    "txt", "py", "js", "sh",
}

MAGIC_BYTES = {
    "jpg": b"\xff\xd8\xff",
    "jpeg": b"\xff\xd8\xff",
    "png": b"\x89PNG",
    "gif": b"GIF8",
    "pdf": b"%PDF",
    "zip": b"PK\x03\x04",
    "gz": b"\x1f\x8b",
}


def validate_attachment(file) -> str:
    """验证上传文件的类型和大小，返回错误消息或空字符串"""
    ext = file.name.rsplit(".", 1)[-1].lower() if "." in file.name else ""
    if ext not in ALLOWED_ATTACHMENT_EXTENSIONS:
        return f"不支持的文件类型: .{ext}。允许: {', '.join(sorted(ALLOWED_ATTACHMENT_EXTENSIONS))}"
    if file.size > 50 * 1024 * 1024:
        return "文件大小超过 50MB 限制"
    if ext in MAGIC_BYTES:
        file.seek(0)
        header = file.read(4)
        file.seek(0)
        if not header.startswith(MAGIC_BYTES[ext]):
            return f"文件内容与扩展名 .{ext} 不匹配"
    return ""


class AttachmentSchema(BaseModel):
    id: int
    filename: str
    size: int
    mime_type: Optional[str] = ""
    uploaded_at: datetime
    uploader_name: Optional[str] = None

    class Config:
        from_attributes = True


def check_report_access(request: HttpRequest, report):
    """检查用户是否有权访问指定报告。staff 可访问全部，普通用户只能访问自己团队或自己上报的"""
    if request.user.is_staff:
        return
    if report.reporter == request.user:
        return
    if report.team:
        team, _ = get_user_team(request)
        if team and team == report.team:
            return
    raise HttpError(403, "无权访问此漏洞报告，请确认当前团队状态是否正常或联系团队管理员")


@router.post("/reports/{vuln_id}/attachments")
def upload_attachment(request: HttpRequest, vuln_id: str):
    """上传附件到指定漏洞报告"""
    if not request.user.is_authenticated:
        raise HttpError(400, "请先登录")

    try:
        report = Report.objects.get(vuln_id=vuln_id)
    except Report.DoesNotExist:
        raise HttpError(400, f"漏洞报告 {vuln_id} 不存在")

    check_report_access(request, report)

    if report.assignee and report.assignee != request.user:
        if report.reporter != request.user:
            team_role, _ = get_user_team_role(request, team=report.team)
            if team_role not in (TeamMembership.Role.ADMIN, TeamMembership.Role.TEAM_LEAD):
                raise HttpError(403, "此漏洞已指派处理人，仅处理人或团队管理员可上传附件")

    uploaded = request.FILES.get("file")
    if not uploaded:
        raise HttpError(400, "请选择要上传的文件")

    err = validate_attachment(uploaded)
    if err:
        raise HttpError(400, err)

    attachment = Attachment.objects.create(
        report=report,
        uploader=request.user,
        file=uploaded,
        filename=uploaded.name,
        size=uploaded.size,
        mime_type=uploaded.content_type or "",
    )

    create_audit_log(
        user=request.user,
        action='UPLOAD_ATTACHMENT',
        target_type='Report',
        target_id=vuln_id,
        detail=f"上传附件: {uploaded.name} ({uploaded.size} bytes)",
        request=request,
    )

    if report.team:
        notify_team_admins(
            report.team,
            f"漏洞 {vuln_id} 有新附件: {uploaded.name}",
            "alert",
            f"/vulnerabilities/{vuln_id}",
        )

    return {
        "id": attachment.id,
        "filename": attachment.filename,
        "size": attachment.size,
        "mime_type": attachment.mime_type,
        "uploaded_at": attachment.uploaded_at,
        "uploader_name": request.user.username,
    }


@router.get("/reports/{vuln_id}/attachments", response=List[AttachmentSchema])
def list_attachments(request: HttpRequest, vuln_id: str):
    """获取漏洞报告的附件列表"""
    if not request.user.is_authenticated:
        raise HttpError(400, "请先登录")

    try:
        report = Report.objects.get(vuln_id=vuln_id)
    except Report.DoesNotExist:
        raise HttpError(400, f"漏洞报告 {vuln_id} 不存在")

    check_report_access(request, report)

    attachments = Attachment.objects.filter(report=report).select_related('uploader')
    return [
        AttachmentSchema(
            id=a.id,
            filename=a.filename,
            size=a.size,
            mime_type=a.mime_type,
            uploaded_at=a.uploaded_at,
            uploader_name=a.uploader.username if a.uploader else None,
        )
        for a in attachments
    ]


@router.get("/attachments/{attachment_id}/download")
def download_attachment(request: HttpRequest, attachment_id: int):
    """下载附件"""
    if not request.user.is_authenticated:
        raise HttpError(400, "请先登录")

    attachment = get_object_or_404(Attachment, id=attachment_id)

    check_report_access(request, attachment.report)

    from django.http import FileResponse
    response = FileResponse(attachment.file, content_type=attachment.mime_type or 'application/octet-stream')
    response['Content-Disposition'] = f'attachment; filename="{attachment.filename}"'
    return response


@router.delete("/attachments/{attachment_id}")
def delete_attachment(request: HttpRequest, attachment_id: int):
    """删除附件"""
    if not request.user.is_authenticated:
        raise HttpError(400, "请先登录")

    attachment = get_object_or_404(Attachment, id=attachment_id)

    if not (request.user.is_staff or attachment.uploader == request.user):
        raise HttpError(403, "无权删除此附件")

    check_report_access(request, attachment.report)

    attachment.file.delete(save=False)
    attachment.delete()

    return {"success": True, "message": "附件已删除"}


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

    # 修复率
    fix_rate = round((fixed_count + closed_count) / total_reports * 100, 1) if total_reports > 0 else 0.0

    # 月度趋势（最近6个月）
    from django.db.models.functions import TruncMonth
    from datetime import timedelta
    six_months_ago = timezone.now() - timedelta(days=180)
    monthly_data = (
        qs.filter(created_at__gte=six_months_ago)
        .annotate(month=TruncMonth('created_at'))
        .values('month', 'status')
        .annotate(count=Count('vuln_id'))
        .order_by('month')
    )
    monthly_trend: List[Dict] = []
    for item in monthly_data:
        month_str = item['month'].strftime('%Y-%m') if item['month'] else ''
        existing = next((m for m in monthly_trend if m['month'] == month_str), None)
        if existing:
            existing[item['status']] = item['count']
        else:
            monthly_trend.append({
                'month': month_str,
                item['status']: item['count'],
            })

    return {
        'total_reports': total_reports,
        'status_distribution': list(status_stats),
        'severity_distribution': list(severity_stats),
        'pending_count': pending_count,
        'processing_count': processing_count,
        'fixed_count': fixed_count,
        'fix_rate': fix_rate,
        'monthly_trend': monthly_trend,
        'recent_reports': [
            {'vuln_id': r.vuln_id, 'title': r.title, 'status': r.status, 'severity': r.severity, 'created_at': r.created_at.isoformat()}
            for r in recent_reports
        ],
        'timestamp': datetime.now().isoformat()
    }


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
    thread_count: int = 10
    parallel_modules: int = 5
    hardware_usage: str = "high"
    selected_modules: str = ""
    timeout_minutes: int = 60
    data_source: str = "personal"
    source_name: str = "个人"
    team_id: Optional[int] = None

    class Config:
        from_attributes = True


class ScanTaskCreateSchema(BaseModel):
    target: str = Field(..., description="扫描目标URL")
    scanner_type: str = Field("deep", description="扫描类型: deep/quick/custom")
    name: Optional[str] = Field(None, description="任务名称（可选，默认自动生成）")
    thread_count: Optional[int] = Field(None, description="线程数")
    parallel_modules: Optional[int] = Field(None, description="并行模块数")
    hardware_usage: Optional[str] = Field(None, description="硬件使用级别: low/normal/high/maximum")
    selected_modules: Optional[str] = Field(None, description="自定义模块列表，逗号分隔")
    timeout_minutes: Optional[int] = Field(None, description="超时分钟数")
    data_source: Optional[str] = Field(None, description="数据来源: personal/team")
    team_id: Optional[int] = Field(None, description="团队ID（当data_source=team时必填）")


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

    team, _ = get_user_team(request)

    result = []
    for t in items:
        # 根据任务的 team 字段判断数据来源（而不是与当前用户的团队比较）
        if t.team_id:
            # 有团队ID → 团队任务
            data_source = "team"
            source_name = t.team.name if t.team else f"团队{t.team_id}"
        else:
            # 无团队ID → 个人任务
            data_source = "personal"
            source_name = "个人"

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
            thread_count=getattr(t, 'thread_count', 10),
            parallel_modules=getattr(t, 'parallel_modules', 5),
            hardware_usage=getattr(t, 'hardware_usage', 'high'),
            selected_modules=getattr(t, 'selected_modules', '') or '',
            timeout_minutes=getattr(t, 'timeout_minutes', 60),
            data_source=data_source,
            source_name=source_name,
            team_id=t.team_id if t.team_id else None,
        ))

    return {"items": result, "total_count": total_count, "page": page, "per_page": per_page}


@router.post("/scans")
def create_scan(request: HttpRequest, payload: ScanTaskCreateSchema):
    if not request.user.is_authenticated:
        raise HttpError(400, "请先登录")
    
    # 根据 data_source 确定团队
    team = None
    if payload.data_source == 'team':
        if payload.team_id:
            try:
                team = Organization.objects.get(id=payload.team_id)
                # 验证用户是否是该团队成员
                membership = TeamMembership.objects.filter(
                    user=request.user,
                    team=team,
                    status='accepted'
                ).first()
                if not membership and not request.user.is_staff:
                    raise HttpError(403, f"您不是团队 '{team.name}' 的成员")
            except Organization.DoesNotExist:
                raise HttpError(400, f"团队 ID {payload.team_id} 不存在")
        else:
            # 如果没有指定 team_id，使用当前用户的默认团队
            team = set_request_team(request)
    else:
        # personal 或未指定，根据原有逻辑处理
        if payload.data_source == 'personal':
            team = None
        else:
            # 未指定 data_source，使用原有逻辑（管理员无团队，普通用户用当前团队）
            team = set_request_team(request)
    
    task = ScanTask.objects.create(
        name=payload.name or f"Scan_{payload.target}_{datetime.now().strftime('%Y%m%d%H%M')}",
        target=payload.target,
        scanner_type=payload.scanner_type,
        status=ScanTask.Status.PENDING,
        team=team,
        created_by=request.user,
        thread_count=payload.thread_count if payload.thread_count is not None else 10,
        parallel_modules=payload.parallel_modules if payload.parallel_modules is not None else 5,
        hardware_usage=payload.hardware_usage if payload.hardware_usage else "high",
        selected_modules=payload.selected_modules if payload.selected_modules else "",
        timeout_minutes=payload.timeout_minutes if payload.timeout_minutes is not None else 60,
    )

    create_audit_log(
        user=request.user,
        action='SCAN_CREATED',
        target_type='ScanTask',
        target_id=str(task.id),
        detail=f"创建扫描任务: {task.name} (目标: {payload.target})",
        request=request
    )

    try:
        from website.scanner import launch_scan_async
        launch_scan_async(task)
        message = "扫描任务已创建，正在后台执行"
    except ImportError:
        message = "扫描任务已创建（扫描器不可用）"

    return {
        "id": task.id,
        "scan_id": f"SC-{task.id:04d}",
        "target": task.target,
        "status": task.status,
        "scanner_type": task.scanner_type,
        "message": message
    }


class BatchDeleteSchema(BaseModel):
    scan_ids: List[int] = Field(..., description="要删除的任务 ID 列表")

    @validator('scan_ids', pre=True, always=True)
    def validate_scan_ids(cls, v):
        if not isinstance(v, list):
            raise ValueError('scan_ids 必须是列表')
        validated_ids = []
        for item in v:
            if isinstance(item, int):
                validated_ids.append(item)
            elif isinstance(item, str):
                try:
                    validated_ids.append(int(item))
                except (ValueError, TypeError):
                    continue
            else:
                try:
                    validated_ids.append(int(item))
                except (ValueError, TypeError):
                    continue
        return validated_ids


@router.post("/scans/batch-delete")
def batch_delete_scans(request: HttpRequest, payload: BatchDeleteSchema):
    """批量删除扫描任务（排除运行中的）"""
    if not request.user.is_authenticated:
        raise HttpError(400, "请先登录")
    
    if not payload.scan_ids:
        raise HttpError(400, "请提供要删除的任务 ID 列表")
    
    queryset = ScanTask.objects.filter(id__in=payload.scan_ids)
    
    # 权限过滤：管理员可删所有，普通用户只能删自己的
    if not request.user.is_staff:
        queryset = queryset.filter(created_by=request.user)
    
    # 排除运行中的任务
    running_count = queryset.filter(status=ScanTask.Status.RUNNING).count()
    deletable = queryset.exclude(status=ScanTask.Status.RUNNING)
    
    count, _ = deletable.delete()

    create_audit_log(
        user=request.user,
        action='BATCH_SCANS_DELETED',
        target_type='ScanTask',
        target_id=','.join(str(sid) for sid in payload.scan_ids),
        detail=f"批量删除 {count} 个扫描任务",
        request=request
    )

    message = f"成功删除 {count} 个任务"
    if running_count > 0:
        message += f"，跳过 {running_count} 个运行中的任务"

    return {
        "success": True,
        "deleted": count,
        "skipped": running_count,
        "message": message
    }


@router.delete("/scans/{scan_id}")
def delete_scan(request: HttpRequest, scan_id: int):
    """删除单个扫描任务（仅限非运行中任务）"""
    if not request.user.is_authenticated:
        raise HttpError(400, "请先登录")
    
    task = get_object_or_404(ScanTask, id=scan_id)
    
    # 权限检查：管理员或任务创建者
    if not (request.user.is_staff or task.created_by == request.user):
        raise HttpError(403, "无权删除此任务")
    
    # 运行中的任务不能直接删除，需要先取消
    if task.status == ScanTask.Status.RUNNING:
        raise HttpError(400, "运行中的任务无法删除，请先取消")
    
    task_name = task.name
    task_id = task.id
    task.delete()

    create_audit_log(
        user=request.user,
        action='SCAN_DELETED',
        target_type='ScanTask',
        target_id=str(task_id),
        detail=f"删除扫描任务: {task_name}",
        request=request
    )

    return {"success": True, "message": f"任务 '{task_name}' 已删除"}


@router.post("/scans/{scan_id}/cancel")
def cancel_scan_api(request: HttpRequest, scan_id: int):
    """取消正在运行的扫描任务"""
    if not request.user.is_authenticated:
        raise HttpError(400, "请先登录")
    
    task = get_object_or_404(ScanTask, id=scan_id)
    
    # 权限检查
    if not (request.user.is_staff or task.created_by == request.user):
        raise HttpError(403, "无权取消此任务")
    
    # 只能取消运行中的任务
    if task.status != ScanTask.Status.RUNNING:
        raise HttpError(400, f"当前状态为 '{task.get_status_display()}'，无法取消")
    
    from website.scanner import cancel_scan as cancel_scan_impl
    
    result = cancel_scan_impl(scan_id)
    
    if result['success']:
        # 无论进程是否存在，都标记为已取消（处理僵尸任务）
        task.status = ScanTask.Status.CANCELLED
        task.finished_at = datetime.now()
        task.save(update_fields=["status", "finished_at"])
        
        return {
            "success": True,
            "message": f"任务 '{task.name}' 已取消",
            "status": "cancelled",
            "detail": result['message']  # 提供详细信息
        }
    else:
        raise HttpError(500, result.get('message', '取消失败'))


@router.post("/scans/{scan_id}/retry")
def retry_scan(request: HttpRequest, scan_id: int):
    """重试失败或已取消的扫描任务"""
    if not request.user.is_authenticated:
        raise HttpError(400, "请先登录")
    
    task = get_object_or_404(ScanTask, id=scan_id)
    
    # 权限检查
    if not (request.user.is_staff or task.created_by == request.user):
        raise HttpError(403, "无权重试此任务")
    
    # 只能重试失败、已取消或已完成的任务
    retryable_statuses = [ScanTask.Status.FAILED, ScanTask.Status.CANCELLED, ScanTask.Status.FINISHED]
    if task.status not in retryable_statuses:
        raise HttpError(400, f"当前状态为 '{task.get_status_display()}'，无法重试（只支持失败/取消/已完成）")
    
    # 重置任务状态
    old_status = task.status
    task.status = ScanTask.Status.PENDING
    task.progress = 0
    task.findings_count = 0
    task.finished_at = None
    task.save()
    
    try:
        from website.scanner import launch_scan_async
        launch_scan_async(task)
        return {
            "success": True,
            "message": f"任务 '{task.name}' 已重新启动",
            "previous_status": old_status,
            "new_status": "pending"
        }
    except ImportError:
        return {
            "success": False,
            "message": "扫描器不可用"
        }


# ==================== 扫描结果手动导入与去重 ====================

def _map_nettacker_severity(sev_str: str) -> str:
    """将 Nettacker 严重等级映射到 SecGuard 等级"""
    sev = str(sev_str).lower()
    if sev in ("critical", "critical"):
        return "critical"
    if sev in ("high", "high"):
        return "high"
    if sev in ("medium", "medium"):
        return "medium"
    return "low"


def check_cve_duplicate(cve_id: str) -> Optional[Report]:
    """基于 CVE ID 精确匹配去重"""
    if not cve_id or not cve_id.strip():
        return None
    return Report.objects.filter(cve_id__iexact=cve_id.strip()).first()


def check_url_title_duplicate(url: str, title: str) -> Optional[Report]:
    """CVE 为空时使用 URL+标题 组合辅助去重"""
    if not url and not title:
        return None
    q = Q()
    if url:
        q |= Q(affected_url__icontains=url)
    if title:
        q |= Q(title__icontains=title)
    if not q:
        return None
    return Report.objects.filter(q).first()


@router.post("/scans/import")
def import_scan_results(request: HttpRequest):
    """
    手动导入 Nettacker JSON 扫描结果

    接收 multipart/form-data，字段名 `file`（JSON 文件）。
    自动进行 CVE 去重和 URL+标题辅助去重，返回导入统计。
    """
    if not request.user.is_authenticated:
        raise HttpError(400, "请先登录")

    uploaded = request.FILES.get("file")
    if not uploaded:
        raise HttpError(400, "请上传 JSON 文件")

    if not uploaded.name.lower().endswith(".json"):
        raise HttpError(400, "仅支持 JSON 格式文件")

    try:
        raw = uploaded.read().decode("utf-8")
        data = json.loads(raw)
    except (json.JSONDecodeError, UnicodeDecodeError) as e:
        raise HttpError(400, f"JSON 解析失败: {str(e)}")

    entries = data if isinstance(data, list) else data.get("results", data.get("events", []))
    if not isinstance(entries, list):
        raise HttpError(400, "JSON 格式不正确：需要顶层数组或包含 results/events 字段")

    default_project = Project.objects.first()
    if not default_project:
        raise HttpError(400, "系统中没有项目，请先创建项目")

    team = set_request_team(request)
    imported = 0
    skipped_duplicate = 0
    errors = 0
    details: List[str] = []

    for entry in entries:
        if not isinstance(entry, dict):
            errors += 1
            continue

        title = str(entry.get("event") or entry.get("module_name") or entry.get("title") or "Nettacker 发现")[:255]
        severity = _map_nettacker_severity(entry.get("severity", "medium"))
        cve_id = str(entry.get("cve_id", "")).strip()
        target_url = str(entry.get("target", "")).strip()

        # 组装描述
        desc_parts = []
        if entry.get("module_name"):
            desc_parts.append(f"模块: {entry.get('module_name')}")
        if target_url:
            desc_parts.append(f"目标: {target_url}")
        if entry.get("port"):
            desc_parts.append(f"端口: {entry.get('port')}")
        if entry.get("description"):
            desc_parts.append(str(entry.get("description"))[:2000])
        description = "\n".join(desc_parts) if desc_parts else "Nettacker 扫描发现"

        # --- 去重检测 ---
        if cve_id:
            dup = check_cve_duplicate(cve_id)
            if dup:
                skipped_duplicate += 1
                details.append(f"跳过重复(CVE): {cve_id} → {dup.vuln_id}")
                create_audit_log(
                    user=request.user,
                    action='IMPORT_DUPLICATE_SKIPPED',
                    target_type='Report',
                    target_id=dup.vuln_id,
                    detail=f"导入时CVE去重跳过: CVE={cve_id}, 目标={target_url}",
                    request=request
                )
                continue
        elif target_url and title:
            dup = check_url_title_duplicate(target_url, title)
            if dup:
                skipped_duplicate += 1
                details.append(f"跳过重复(URL+标题): {target_url} / {title[:50]} → {dup.vuln_id}")
                create_audit_log(
                    user=request.user,
                    action='IMPORT_DUPLICATE_SKIPPED',
                    target_type='Report',
                    target_id=dup.vuln_id,
                    detail=f"导入时URL+标题去重跳过: URL={target_url}, 标题={title[:80]}",
                    request=request
                )
                continue

        try:
            report = Report.objects.create(
                title=title,
                description=description,
                severity=severity,
                status=Report.Status.PENDING,
                reporter=request.user,
                project=default_project,
                team=team,
                cve_id=cve_id,
                affected_url=target_url,
            )
            imported += 1
            create_audit_log(
                user=request.user,
                action='IMPORT_CREATED',
                target_type='Report',
                target_id=report.vuln_id,
                detail=f"导入扫描结果创建漏洞: {report.vuln_id} (CVE={cve_id or 'N/A'})",
                request=request
            )
        except Exception as e:
            errors += 1
            details.append(f"创建失败: {title[:50]} - {str(e)}")

    return {
        "success": True,
        "imported": imported,
        "skipped_duplicate": skipped_duplicate,
        "errors": errors,
        "total": len(entries),
        "details": details,
    }


class ExportSchema(BaseModel):
    format: str = Field("pdf", description="导出格式: pdf/html")
    project_id: Optional[int] = Field(None, description="项目筛选")
    status: Optional[str] = Field(None, description="状态筛选")
    date_from: Optional[str] = Field(None, description="开始日期 (YYYY-MM-DD)")
    date_to: Optional[str] = Field(None, description="结束日期 (YYYY-MM-DD)")


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
    if payload.date_from:
        queryset = queryset.filter(created_at__gte=payload.date_from)
    if payload.date_to:
        queryset = queryset.filter(created_at__lte=payload.date_to + " 23:59:59")

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
        try:
            import weasyprint
            pdf_bytes = weasyprint.HTML(string=html).write_pdf()
            resp = HttpResponse(pdf_bytes, content_type="application/pdf")
            resp["Content-Disposition"] = f'attachment; filename="secguard-report-pdf-{datetime.now().strftime("%Y%m%d")}.pdf"'
            return resp
        except ImportError:
            resp = HttpResponse(html, content_type="text/html; charset=utf-8")
            resp["Content-Disposition"] = f'attachment; filename="secguard-report-html-{datetime.now().strftime("%Y%m%d")}.html"'
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


# Asset endpoint — 合并 Asset 表 + Report 统计
_TYPE_LABEL_MAP = {
    "host": "主机", "port": "端口", "service": "服务",
    "subdomain": "子域名", "web_tech": "Web技术", "ssl_cert": "SSL证书",
}


@router.get("/assets")
def list_assets(request: HttpRequest):
    if not request.user.is_authenticated:
        raise HttpError(400, "请先登录")

    from website.models import Asset

    team = None
    if request.user.is_staff:
        asset_qs = Asset.objects.all()
        report_qs = Report.objects.all()
    else:
        team, _ = get_user_team(request)
        if team is None:
            return {"items": [], "total_count": 0}
        asset_qs = Asset.objects.filter(team=team)
        report_qs = Report.objects.filter(team=team)

    # 按 target 分组，收集 Report 统计
    assets_by_target = {}
    for a in asset_qs.select_related('scan_task').order_by('-discovered_at'):
        t = a.target
        if t not in assets_by_target:
            assets_by_target[t] = {
                "target": t,
                "sub_assets": [],
                "types": set(),
                "last_scan": a.discovered_at,
            }
        entry = assets_by_target[t]
        entry["sub_assets"].append({
            "id": a.id,
            "asset_type": a.asset_type,
            "asset_type_label": _TYPE_LABEL_MAP.get(a.asset_type, a.asset_type),
            "name": a.name,
            "value": a.value,
            "status": a.status,
        })
        entry["types"].add(a.asset_type)
        if a.discovered_at and (not entry["last_scan"] or a.discovered_at > entry["last_scan"]):
            entry["last_scan"] = a.discovered_at

    # 扫描目标（无 Asset 记录的扫描目标也展示）
    if request.user.is_staff:
        scan_targets = ScanTask.objects.values('target').distinct()
        affected_urls = Report.objects.exclude(affected_url="").values('affected_url').distinct()
    else:
        scan_targets = ScanTask.objects.filter(team=team).values('target').distinct()
        affected_urls = Report.objects.filter(team=team).exclude(affected_url="").values('affected_url').distinct()

    for s in scan_targets:
        url = (s['target'] or '').strip()
        if url and url not in assets_by_target:
            assets_by_target[url] = {"target": url, "sub_assets": [], "types": set(), "last_scan": None}
    for r in affected_urls:
        url = (r['affected_url'] or '').strip()
        if url and url not in assets_by_target:
            assets_by_target[url] = {"target": url, "sub_assets": [], "types": set(), "last_scan": None}

    # 构建输出
    items = []
    for target_url, entry in assets_by_target.items():
        if not target_url:
            continue

        # Report 统计
        vuln_count = report_qs.filter(affected_url=target_url).count()
        sev_counts = {}
        if vuln_count > 0:
            for s in report_qs.filter(affected_url=target_url).values('severity').annotate(
                cnt=Count('vuln_id')
            ):
                sev_counts[s['severity']] = s['cnt']

        # 确定主要类型
        types = entry["types"]
        if types:
            type_order = ["host", "subdomain", "port", "service", "web_tech", "ssl_cert"]
            primary_type = next((t for t in type_order if t in types), list(types)[0])
        else:
            primary_type = "web_app"

        # 状态
        sub_statuses = [sa["status"] for sa in entry["sub_assets"]]
        if any(s == "online" for s in sub_statuses):
            status = "online"
        elif sub_statuses:
            status = sub_statuses[0]
        else:
            status = "unknown"

        # 重要性
        high_count = sev_counts.get("high", 0) + sev_counts.get("critical", 0)
        if high_count >= 3:
            criticality = "high"
        elif high_count >= 1 or vuln_count >= 3:
            criticality = "medium"
        else:
            criticality = "low"

        items.append({
            "id": abs(hash(target_url)) % 100000,
            "name": target_url,
            "url": target_url,
            "type": primary_type,
            "type_label": _TYPE_LABEL_MAP.get(primary_type, "Web应用"),
            "status": status,
            "vulnerabilities": vuln_count,
            "severity_breakdown": sev_counts,
            "criticality": criticality,
            "last_scan": entry["last_scan"].isoformat() if entry["last_scan"] else None,
            "sub_assets": entry["sub_assets"],
            "data_source": "team" if team else "personal",
            "source_name": team.name if team else "个人",
            "team_id": team.id if team else None,
        })

    # 按最后扫描时间倒序
    items.sort(key=lambda x: x.get("last_scan") or "", reverse=True)

    return {"items": items, "total_count": len(items)}


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
    """
    创建新团队，创建者自动成为团队管理员。
    
    [单团队模式] 每位用户只能属于一个团队，如需创建新团队请先退出当前团队。
    """
    if not request.user.is_authenticated:
        raise HttpError(400, "请先登录")
    
    # [单团队模式] 检查用户是否已属于其他团队
    try:
        profile = request.user.userprofile
        if profile.team:
            existing_membership = TeamMembership.objects.filter(
                user=request.user,
                team=profile.team,
                status=TeamMembership.Status.ACCEPTED
            ).first()
            if existing_membership:
                raise HttpError(
                    400, 
                    f"您当前已属于团队 '{profile.team.name}'。"
                    f"每位用户只能属于一个团队，如需创建新团队请先退出当前团队。"
                )
    except (UserProfile.DoesNotExist, Exception):
        pass
    
    # 检查团队名称是否已被使用
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
    
    # 设置用户的主团队
    profile = request.user.userprofile
    profile.team = team
    profile.role = "admin"
    profile.save()

    create_audit_log(user=request.user, action='TEAM_CREATED', target_type='Team',
                     target_id=str(team.id), detail=f"创建团队 {team.name}", request=request)
    return {
        "success": True, 
        "team_id": team.id, 
        "team_name": team.name, 
        "message": "团队创建成功",
        "mode": "single_team"  # 标识单团队模式
    }



@router.post("/teams/join")
def team_join(request: HttpRequest, payload: TeamJoinSchema):
    """
    申请加入已有团队。
    
    [单团队模式] 每位用户只能属于一个团队，如需加入其他团队请先退出当前团队。
    """
    if not request.user.is_authenticated:
        raise HttpError(400, "请先登录")
    
    # [单团队模式] 检查用户是否已属于其他团队
    try:
        profile = request.user.userprofile
        if profile.team:
            existing_membership = TeamMembership.objects.filter(
                user=request.user,
                team=profile.team,
                status__in=[TeamMembership.Status.ACCEPTED, TeamMembership.Status.PENDING]
            ).first()
            if existing_membership:
                status_text = "已加入" if existing_membership.status == TeamMembership.Status.ACCEPTED else "已申请"
                raise HttpError(
                    400,
                    f"您{status_text}团队 '{profile.team.name}'。"
                    f"每位用户只能属于一个团队，如需加入其他团队请先退出当前团队。"
                )
    except (UserProfile.DoesNotExist, Exception):
        pass
    
    # 验证目标团队是否存在
    team = Organization.objects.filter(id=payload.team_id, type="team").first()
    if not team:
        raise HttpError(400, "指定的团队不存在")
    
    # 检查是否已经申请过该团队
    already = TeamMembership.objects.filter(user=request.user, team=team).first()
    if already:
        raise HttpError(400, "您已申请过该团队或已在团队中")
    
    # 创建加入申请
    TeamMembership.objects.create(
        user=request.user, team=team,
        role=TeamMembership.Role.DEVELOPER,
        status=TeamMembership.Status.PENDING,
    )
    
    create_audit_log(user=request.user, action='TEAM_JOIN_REQUEST', target_type='Team',
                     target_id=str(team.id), detail=f"申请加入团队 {team.name}", request=request)
    return {
        "success": True, 
        "message": "申请已提交，请等待团队管理员审核",
        "mode": "single_team"  # 标识单团队模式
    }


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


class TeamLeaveSchema(BaseModel):
    team_id: Optional[int] = Field(None, description="要退出的团队ID（可选，默认退出当前团队）")
    confirm: bool = Field(True, description="确认退出")


@router.post("/teams/leave")
def team_leave(request: HttpRequest, payload: TeamLeaveSchema):
    """
    退出当前团队。
    
    [单团队模式] 退出后用户将变为无团队状态，可以创建或加入新团队。
    注意：如果是团队最后一个管理员，需要先转让管理员权限或解散团队。
    """
    if not request.user.is_authenticated:
        raise HttpError(400, "请先登录")
    
    if not payload.confirm:
        raise HttpError(400, "请确认退出操作")
    
    # 获取要退出的团队
    try:
        profile = request.user.userprofile
        
        if payload.team_id:
            # 指定了团队ID
            team = Organization.objects.filter(id=payload.team_id, type="team").first()
            if not team:
                raise HttpError(400, "指定的团队不存在")
        else:
            # 退出当前主团队
            team = profile.team
            
        if not team:
            raise HttpError(400, "您当前不属于任何团队")
        
        # 查找成员关系
        membership = TeamMembership.objects.filter(
            user=request.user,
            team=team,
            status=TeamMembership.Status.ACCEPTED
        ).first()
        
        if not membership:
            raise HttpError(400, "您不是该团队的成员")
        
        # 检查是否是唯一管理员
        if membership.role == TeamMembership.Role.ADMIN:
            admin_count = TeamMembership.objects.filter(
                team=team,
                role=TeamMembership.Role.ADMIN,
                status=TeamMembership.Status.ACCEPTED
            ).count()
            
            if admin_count <= 1:
                raise HttpError(
                    400,
                    f"您是团队 '{team.name}' 的唯一管理员。"
                    f"退出前请先将管理员权限转让给其他成员，或解散团队。"
                )
        
        # 使用事务确保数据一致性
        from django.db import transaction
        with transaction.atomic():
            # 删除成员关系
            membership.delete()
            
            # 清除用户的主团队字段
            if profile.team == team:
                profile.team = None
                profile.role = ""
                profile.save()
            
            # 如果用户是该团队的管理员，从managers中移除
            team.managers.remove(request.user)
    
        create_audit_log(
            user=request.user, 
            action='TEAM_LEFT', 
            target_type='Team',
            target_id=str(team.id), 
            detail=f"退出团队 {team.name}", 
            request=request
        )
        
        return {
            "success": True,
            "message": f"已成功退出团队 '{team.name}'",
            "left_team_id": team.id,
            "left_team_name": team.name,
            "mode": "single_team"
        }
        
    except UserProfile.DoesNotExist:
        raise HttpError(400, "用户信息不完整")
    except HttpError:
        raise
    except Exception as e:
        logger.error(f"退出团队失败: {e}")
        raise HttpError(500, f"退出团队失败: {str(e)}")


@router.get("/teams/my-team")
def get_my_team(request: HttpRequest):
    """
    获取当前用户的团队信息。
    
    返回用户所属的团队详情、角色和成员列表。
    """
    if not request.user.is_authenticated:
        raise HttpError(400, "请先登录")
    
    try:
        profile = request.user.userprofile
        
        if not profile.team:
            return {
                "has_team": False,
                "message": "您当前不属于任何团队",
                "mode": "single_team"
            }
        
        team = profile.team
        membership = TeamMembership.objects.filter(
            user=request.user,
            team=team,
            status=TeamMembership.Status.ACCEPTED
        ).select_related('team').first()
        
        if not membership:
            return {
                "has_team": False,
                "message": "团队成员关系异常",
                "mode": "single_team"
            }
        
        # 获取团队成员列表
        members = TeamMembership.objects.filter(
            team=team,
            status=TeamMembership.Status.ACCEPTED
        ).select_related('user')[:50]
        
        member_list = []
        for m in members:
            member_list.append({
                "user_id": m.user.id,
                "username": m.user.username,
                "email": m.user.email,
                "role": m.role,
                "role_label": m.get_role_display(),
                "joined_at": m.joined_at.isoformat() if m.joined_at else None,
                "is_self": m.user.id == request.user.id
            })
        
        return {
            "has_team": True,
            "team": {
                "id": team.id,
                "name": team.name,
                "created": team.created.isoformat() if team.created else None,
                "admin_name": team.admin.username if team.admin else None,
                "member_count": len(member_list)
            },
            "membership": {
                "role": membership.role,
                "role_label": membership.get_role_display(),
                "joined_at": membership.joined_at.isoformat() if membership.joined_at else None
            },
            "members": member_list,
            "mode": "single_team"
        }
        
    except UserProfile.DoesNotExist:
        return {
            "has_team": False,
            "message": "用户信息不完整",
            "mode": "single_team"
        }
    except Exception as e:
        logger.error(f"获取团队信息失败: {e}")
        raise HttpError(500, f"获取团队信息失败: {str(e)}")


# ==================== 漏洞和资产删除功能 ====================

class ReportDeleteSchema(BaseModel):
    """漏洞删除请求"""
    report_ids: List[int] = Field(..., description="要删除的漏洞ID列表")

    @validator('report_ids', pre=True, always=True)
    def validate_report_ids(cls, v):
        if not isinstance(v, list):
            raise ValueError('report_ids 必须是列表')
        validated_ids = []
        for item in v:
            if isinstance(item, int):
                validated_ids.append(item)
            elif isinstance(item, str):
                try:
                    validated_ids.append(int(item))
                except (ValueError, TypeError):
                    continue
        return validated_ids


class AssetDeleteSchema(BaseModel):
    """资产删除请求"""
    asset_ids: List[int] = Field(..., description="要删除的资产ID列表")

    @validator('asset_ids', pre=True, always=True)
    def validate_asset_ids(cls, v):
        if not isinstance(v, list):
            raise ValueError('asset_ids 必须是列表')
        validated_ids = []
        for item in v:
            if isinstance(item, int):
                validated_ids.append(item)
            elif isinstance(item, str):
                try:
                    validated_ids.append(int(item))
                except (ValueError, TypeError):
                    continue
        return validated_ids


def check_delete_permission(request: HttpRequest, obj) -> bool:
    """
    检查用户是否有权限删除对象
    
    权限规则：
    - 管理员：可以删除所有对象
    - 个人数据（无团队）：只有创建者可以删除
    - 团队数据：创建者或团队管理员可以删除
    """
    # 管理员拥有所有权限
    if request.user.is_staff:
        return True
    
    # 检查是否为创建者
    if hasattr(obj, 'reporter') and obj.reporter == request.user:
        return True
    if hasattr(obj, 'created_by') and obj.created_by == request.user:
        return True
    
    # 检查是否为团队管理员
    if hasattr(obj, 'team') and obj.team:
        membership = TeamMembership.objects.filter(
            user=request.user,
            team=obj.team,
            status='accepted',
            role__in=['admin', 'team_lead']
        ).first()
        if membership:
            return True
    
    return False


@router.delete("/reports/{vuln_id}")
def delete_report(request: HttpRequest, vuln_id: str):
    """删除单个漏洞报告"""
    if not request.user.is_authenticated:
        raise HttpError(400, "请先登录")
    
    report = get_object_or_404(Report, vuln_id=vuln_id)
    
    # 权限检查
    if not check_delete_permission(request, report):
        raise HttpError(403, "无权删除此漏洞（仅创建者或团队管理员可删除）")
    
    report_title = report.title
    report.delete()
    
    AuditLog.objects.create(
        user=request.user, action='REPORT_DELETED', target_type='Report',
        target_id=vuln_id, detail=f"删除漏洞: {report_title}", 
        team=report.team if hasattr(report, 'team') else None,
    )
    
    return {"success": True, "message": f"漏洞 '{report_title}' 已删除"}


@router.post("/assets/batch-delete")
def batch_delete_assets(request: HttpRequest, payload: AssetDeleteSchema):
    """批量删除资产（按目标URL删除）"""
    if not request.user.is_authenticated:
        raise HttpError(400, "请先登录")

    targets = [t.strip() for t in payload.targets if t and t.strip()]
    if not targets:
        raise HttpError(400, "请提供要删除的资产目标列表")

    queryset = Asset.objects.filter(target__in=targets)

    deletable_targets = set()
    forbidden_count = 0
    for asset in queryset:
        if check_delete_permission(request, asset):
            deletable_targets.add(asset.target)
        else:
            forbidden_count += 1

    count, _ = Asset.objects.filter(target__in=deletable_targets).delete()

    message = f"成功删除 {count} 个资产"
    if forbidden_count > 0:
        message += f"，{forbidden_count} 个因权限不足被跳过"

    audit_target_id = ', '.join(targets)
    if len(audit_target_id) > 50:
        audit_target_id = audit_target_id[:47] + '...'

    AuditLog.objects.create(
        user=request.user, action='BATCH_ASSETS_DELETED', target_type='Asset',
        target_id=audit_target_id,
        detail=f"批量删除资产: {count}个成功",
    )

    return {
        "success": True,
        "deleted": count,
        "skipped": forbidden_count,
        "message": message
    }


@router.delete("/assets/{asset_id}")
def delete_asset(request: HttpRequest, asset_id: int):
    """删除单个资产"""
    if not request.user.is_authenticated:
        raise HttpError(400, "请先登录")
    
    asset = get_object_or_404(Asset, id=asset_id)
    
    # 权限检查
    if not check_delete_permission(request, asset):
        raise HttpError(403, "无权删除此资产（仅创建者或团队管理员可删除）")
    
    asset_name = f"{asset.asset_type}: {asset.name}"
    asset.delete()
    
    AuditLog.objects.create(
        user=request.user, action='ASSET_DELETED', target_type='Asset',
        target_id=str(asset_id), detail=f"删除资产: {asset_name}",
        team=asset.team if hasattr(asset, 'team') else None,
    )
    
    return {"success": True, "message": f"资产 '{asset_name}' 已删除"}


@router.get("/teams/members")
def list_team_members(request: HttpRequest):
    """列出当前用户所在团队的所有已通过成员"""
    team, membership = get_user_team(request)
    if team is None:
        return {"items": [], "team_id": None, "team_name": None}
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
    """
    [已废弃 - 单团队模式] 切换当前活跃团队。
    
    ⚠️ 注意：此接口在单团队模式下已不再使用！
    每位用户只能属于一个团队，无需切换功能。
    
    保留此接口仅用于向后兼容，建议使用 /teams/my-team 替代。
    """
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
    """
    [已废弃 - 单团队模式] 列出当前用户所在的所有团队（含数据统计，包含待审批）。
    
    ⚠️ 注意：此接口在单团队模式下已不再使用！
    每位用户只能属于一个团队，此接口返回的数据与 /teams/my-team 相同。
    
    保留此接口仅用于向后兼容，建议使用 /teams/my-team 替代。
    """
    if not request.user.is_authenticated:
        raise HttpError(400, "请先登录")
    # 查询所有状态的团队（ACCEPTED + PENDING）
    ms = TeamMembership.objects.filter(
        user=request.user,
    ).exclude(
        status=TeamMembership.Status.REJECTED  # 排除已拒绝的
    ).select_related('team')
    active_id = request.user.userprofile.team_id if hasattr(request.user, 'userprofile') else None

    result = []
    for m in ms:
        team = m.team
        scan_count = ScanTask.objects.filter(team=team).count()
        vuln_count = Report.objects.filter(team=team).count()
        asset_count = Asset.objects.filter(team=team).count()

        result.append({
            "team_id": team.id,
            "team_name": team.name,
            "role": m.role,
            "role_label": m.get_role_display(),
            "status": m.status,  # 新增：成员状态
            "status_label": m.get_status_display(),  # 新增：状态显示名
            "is_active": m.team_id == active_id and m.status == TeamMembership.Status.ACCEPTED,
            "scan_count": scan_count,
            "vuln_count": vuln_count,
            "asset_count": asset_count,
        })

    return {"items": result}


@router.post("/teams/leave")
def leave_team(request: HttpRequest):
    """退出当前团队"""
    if not request.user.is_authenticated:
        raise HttpError(400, "请先登录")
    
    team, membership = require_team(request)
    
    if membership.role == TeamMembership.Role.ADMIN:
        raise HttpError(400, "团队管理员不能直接退出，请先解散团队或转让管理员权限")
    
    team_name = team.name
    membership.delete()
    
    profile = request.user.userprofile
    profile.team = None
    profile.role = None
    profile.save()
    
    create_audit_log(user=request.user, action='TEAM_LEFT', target_type='Team',
                     target_id=str(team.id), detail=f"退出了团队 {team_name}", request=request)
    
    return {"success": True, "message": f"已成功退出团队 {team_name}"}


@router.post("/teams/dissolve")
def dissolve_team(request: HttpRequest):
    """解散团队（仅团队管理员）"""
    if not request.user.is_authenticated:
        raise HttpError(400, "请先登录")
    
    team, membership = require_team_role(request, ["admin"])
    
    member_count = TeamMembership.objects.filter(team=team, status=TeamMembership.Status.ACCEPTED).count()
    
    if member_count > 1:
        raise HttpError(400, f"团队中还有 {member_count - 1} 名其他成员，不能解散。请先将成员移出或转让管理员权限")
    
    team_name = team.name
    
    TeamMembership.objects.filter(team=team).delete()
    team.delete()
    
    profile = request.user.userprofile
    if profile.team_id == team.id:
        profile.team = None
        profile.role = None
        profile.save()
    
    create_audit_log(user=request.user, action='TEAM_DISSOLVED', target_type='Team',
                     target_id=str(team.id), detail=f"解散了团队 {team_name}", request=request)
    
    return {"success": True, "message": f"团队 {team_name} 已成功解散"}


@router.get("/teams/pending-invitation")
def check_pending_invitation(request: HttpRequest):
    """检查当前用户是否有待处理的团队邀请"""
    if not request.user.is_authenticated:
        raise HttpError(400, "请先登录")
    m = TeamMembership.objects.filter(user=request.user, status=TeamMembership.Status.PENDING).select_related('team').first()
    if not m:
        return {"has_pending": False}
    return {"has_pending": True, "team_id": m.team.id, "team_name": m.team.name}


# ==================== 通知系统 ====================

class NotificationItemSchema(BaseModel):
    id: int
    message: str
    notification_type: str
    is_read: bool
    link: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class NotificationListSchema(BaseModel):
    items: List[NotificationItemSchema]
    total_count: int
    unread_count: int


@router.get("/notifications", response=NotificationListSchema)
def list_notifications(request: HttpRequest,
                       page: int = Query(1, ge=1),
                       per_page: int = Query(20, ge=1, le=100),
                       unread_only: bool = Query(False)):
    """获取当前用户的通知列表"""
    if not request.user.is_authenticated:
        raise HttpError(400, "请先登录")

    qs = Notification.objects.filter(
        user=request.user,
        is_deleted=False,
    )
    if unread_only:
        qs = qs.filter(is_read=False)

    total_count = qs.count()
    unread_count = Notification.objects.filter(
        user=request.user,
        is_deleted=False,
        is_read=False,
    ).count()

    offset = (page - 1) * per_page
    items = list(qs[offset:offset + per_page])

    return NotificationListSchema(
        items=items,
        total_count=total_count,
        unread_count=unread_count,
    )


@router.post("/notifications/{notification_id}/read")
def mark_notification_read(request: HttpRequest, notification_id: int):
    """标记单条通知为已读"""
    if not request.user.is_authenticated:
        raise HttpError(400, "请先登录")

    notif = get_object_or_404(Notification, id=notification_id, user=request.user)
    notif.is_read = True
    notif.save()
    return {"success": True}


@router.post("/notifications/read-all")
def mark_all_notifications_read(request: HttpRequest):
    """标记所有通知为已读"""
    if not request.user.is_authenticated:
        raise HttpError(400, "请先登录")

    updated = Notification.objects.filter(
        user=request.user,
        is_deleted=False,
        is_read=False,
    ).update(is_read=True)
    return {"success": True, "updated": updated}


@router.get("/notifications/unread-count")
def unread_notification_count(request: HttpRequest):
    """获取未读通知数量"""
    if not request.user.is_authenticated:
        raise HttpError(400, "请先登录")

    count = Notification.objects.filter(
        user=request.user,
        is_deleted=False,
        is_read=False,
    ).count()
    return {"unread_count": count}


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
