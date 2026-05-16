"""
修复个人漏洞状态：将所有 data_source='personal' 且 status='pending' 的漏洞
自动设置为 status='processing' 并指定 assignee 为报告者本人
"""

from django.core.management.base import BaseCommand
from website.models import Report


class Command(BaseCommand):
    help = '修复个人漏洞状态：自动设置处理人和状态'

    def handle(self, *args, **options):
        # 查找所有个人来源且待分派的漏洞
        personal_pending_reports = Report.objects.filter(
            team__isnull=True,
            status=Report.Status.PENDING
        )

        count = 0
        for report in personal_pending_reports:
            report.assignee = report.reporter
            report.status = Report.Status.PROCESSING
            report.save(update_fields=['assignee', 'status'])
            count += 1
            self.stdout.write(
                self.style.SUCCESS(
                    f'✓ 已修复: {report.vuln_id} - 处理人: {report.reporter.username}'
                )
            )

        if count == 0:
            self.stdout.write(self.style.SUCCESS('✓ 所有个人漏洞状态正常，无需修复'))
        else:
            self.stdout.write(
                self.style.SUCCESS(f'\n✓ 成功修复 {count} 个个人漏洞')
            )
