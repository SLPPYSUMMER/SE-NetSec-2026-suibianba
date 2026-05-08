"""
数据库模型定义
"""

from django.db import models
from django.contrib.auth.models import User

class Project(models.Model):
    """项目模型"""
    name = models.CharField(max_length=100)
    description = models.TextField(null=True)
    owner = models.ForeignKey(User, on_delete=models.CASCADE)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    def __str__(self):
        return self.name

class Report(models.Model):
    """漏洞报告模型"""
    SEVERITY_CHOICES = [
        ('critical', '严重'),
        ('high', '高'),
        ('medium', '中'),
        ('low', '低')
    ]
    
    STATUS_CHOICES = [
        ('pending', '待分派'),
        ('assigned', '已分派'),
        ('in_progress', '处理中'),
        ('fixed', '已修复'),
        ('reviewed', '已复核'),
        ('closed', '已关闭')
    ]
    
    title = models.CharField(max_length=255)
    description = models.TextField()
    severity = models.CharField(max_length=20, choices=SEVERITY_CHOICES)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    reporter = models.ForeignKey(User, on_delete=models.CASCADE, related_name='reported_reports')
    assignee = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='assigned_reports')
    project = models.ForeignKey(Project, on_delete=models.CASCADE)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    def __str__(self):
        return self.title

class ScanTask(models.Model):
    """扫描任务模型"""
    STATUS_CHOICES = [
        ('pending', '待执行'),
        ('running', '运行中'),
        ('completed', '已完成'),
        ('failed', '失败')
    ]
    
    name = models.CharField(max_length=100)
    target = models.CharField(max_length=500)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    scanner_type = models.CharField(max_length=50)
    created_by = models.ForeignKey(User, on_delete=models.CASCADE)
    started_at = models.DateTimeField(null=True)
    finished_at = models.DateTimeField(null=True)
    
    def __str__(self):
        return self.name

class Vulnerability(models.Model):
    """漏洞信息模型"""
    cve_id = models.CharField(max_length=50, null=True)
    title = models.CharField(max_length=255)
    description = models.TextField()
    solution = models.TextField(null=True)
    cvss_score = models.FloatField(null=True)
    severity = models.CharField(max_length=20)
    scan_task = models.ForeignKey(ScanTask, on_delete=models.CASCADE)
    report = models.ForeignKey(Report, on_delete=models.SET_NULL, null=True)
    
    def __str__(self):
        return self.title

class Comment(models.Model):
    """评论模型"""
    content = models.TextField()
    author = models.ForeignKey(User, on_delete=models.CASCADE)
    report = models.ForeignKey(Report, on_delete=models.CASCADE)
    created_at = models.DateTimeField(auto_now_add=True)
    
    def __str__(self):
        return f"{self.author.username}: {self.content[:50]}"

class Attachment(models.Model):
    """附件模型"""
    file_name = models.CharField(max_length=255)
    file_path = models.CharField(max_length=500)
    file_size = models.IntegerField()
    uploader = models.ForeignKey(User, on_delete=models.CASCADE)
    report = models.ForeignKey(Report, on_delete=models.CASCADE)
    uploaded_at = models.DateTimeField(auto_now_add=True)
    
    def __str__(self):
        return self.file_name