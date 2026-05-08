"""
漏洞报告API模块
提供漏洞报告的CRUD操作
"""

from ninja import Router
from django.contrib.auth.models import User
from ..models import Report, Project
from ..schemas import ReportCreateSchema, ReportResponseSchema
from datetime import datetime

router = Router()

@router.get("/", response=list[ReportResponseSchema])
def list_reports(request, project_id: int = None, status: str = None):
    """
    获取漏洞报告列表
    
    Args:
        project_id: 项目ID（可选）
        status: 状态筛选（可选）
        
    Returns:
        漏洞报告列表
    """
    queryset = Report.objects.all()
    
    if project_id:
        queryset = queryset.filter(project_id=project_id)
    
    if status:
        queryset = queryset.filter(status=status)
    
    return list(queryset)

@router.get("/{report_id}", response=ReportResponseSchema)
def get_report(request, report_id: int):
    """
    获取漏洞报告详情
    
    Args:
        report_id: 报告ID
        
    Returns:
        漏洞报告详情
    """
    try:
        report = Report.objects.get(id=report_id)
        return report
    except Report.DoesNotExist:
        return {"status": "error", "message": "报告不存在"}

@router.post("/", response=ReportResponseSchema)
def create_report(request, data: ReportCreateSchema):
    """
    创建漏洞报告
    
    Args:
        data: 报告数据
        
    Returns:
        创建的报告对象
    """
    # 获取当前用户（从Token中解析）
    user_id = request.auth.get('user_id') if request.auth else 1
    
    # 验证项目是否存在
    if not Project.objects.filter(id=data.project_id).exists():
        return {"status": "error", "message": "项目不存在"}
    
    report = Report.objects.create(
        title=data.title,
        description=data.description,
        severity=data.severity,
        reporter_id=user_id,
        project_id=data.project_id,
        status='pending',
        created_at=datetime.now(),
        updated_at=datetime.now()
    )
    
    # 创建通知
    # TODO: 发送通知给项目负责人
    
    return report

@router.put("/{report_id}/assign")
def assign_report(request, report_id: int, assignee_id: int):
    """
    分派漏洞报告
    
    Args:
        report_id: 报告ID
        assignee_id: 负责人ID
        
    Returns:
        更新后的报告
    """
    try:
        report = Report.objects.get(id=report_id)
        
        if not User.objects.filter(id=assignee_id).exists():
            return {"status": "error", "message": "用户不存在"}
        
        report.assignee_id = assignee_id
        report.status = 'assigned'
        report.updated_at = datetime.now()
        report.save()
        
        return {
            "status": "success",
            "data": ReportResponseSchema.from_orm(report)
        }
    except Report.DoesNotExist:
        return {"status": "error", "message": "报告不存在"}

@router.put("/{report_id}/status")
def update_status(request, report_id: int, status: str):
    """
    更新报告状态
    
    Args:
        report_id: 报告ID
        status: 新状态
        
    Returns:
        更新后的报告
    """
    valid_statuses = ['pending', 'assigned', 'in_progress', 'fixed', 'reviewed', 'closed']
    
    if status not in valid_statuses:
        return {"status": "error", "message": f"无效状态，可选值: {valid_statuses}"}
    
    try:
        report = Report.objects.get(id=report_id)
        report.status = status
        report.updated_at = datetime.now()
        report.save()
        
        return {
            "status": "success",
            "data": ReportResponseSchema.from_orm(report)
        }
    except Report.DoesNotExist:
        return {"status": "error", "message": "报告不存在"}