"""Nettacker 扫描器集成 - 自动扫描任务执行器"""
import subprocess, threading, logging, os, json, time
from datetime import datetime

logger = logging.getLogger(__name__)

NETTACKER_PATH = os.environ.get("NETTACKER_PATH", "nettacker")
MAX_SCAN_TIMEOUT = int(os.environ.get("SCAN_TIMEOUT", "1800"))


def run_scan(scan_task_id: int, target: str, scanner_type: str):
    """后台执行 Nettacker 扫描"""
    # 延迟导入避免循环依赖
    from website.models import ScanTask, Report, AuditLog, Project
    from django.contrib.auth.models import User

    task = ScanTask.objects.get(id=scan_task_id)
    task.status = ScanTask.Status.RUNNING
    task.save()

    AuditLog.objects.create(
        user=task.created_by, action='SCAN_STARTED', target_type='ScanTask',
        target_id=str(task.id),
        detail=f"开始扫描 {target} (类型: {scanner_type})", team=task.team,
    )

    profile_map = {"deep": "full_scan", "quick": "quick_scan", "custom": "vulnerability_scan"}
    profile = profile_map.get(scanner_type, "full_scan")

    cmd = [
        NETTACKER_PATH, "-m", profile, "-t", target,
        "-o", "/tmp/nettacker_result.json", "--output-format", "json"
    ]

    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=MAX_SCAN_TIMEOUT)
        findings = []

        if os.path.exists("/tmp/nettacker_result.json"):
            try:
                with open("/tmp/nettacker_result.json") as f:
                    data = json.load(f)
                for entry in data if isinstance(data, list) else []:
                    findings.append({
                        "title": entry.get("description", entry.get("name", "Nettacker Finding")),
                        "severity": _map_severity(entry.get("risk", "medium")),
                        "description": f"{entry.get('description', '')}\n端口: {entry.get('port', 'N/A')}\n协议: {entry.get('protocol', 'N/A')}",
                        "target": entry.get("target", target),
                    })
            except (json.JSONDecodeError, FileNotFoundError):
                pass

        # 解析 stdout 作为兜底
        if not findings and proc.stdout:
            lines = proc.stdout.strip().split("\n")
            for line in lines[:100]:
                if "found" in line.lower() or "vuln" in line.lower() or "open port" in line.lower():
                    findings.append({
                        "title": line[:200],
                        "severity": "medium",
                        "description": line,
                        "target": target,
                    })

        # 写入 Report
        default_project = Project.objects.first()
        for f in findings[:50]:
            Report.objects.create(
                title=f["title"][:255],
                description=f["description"][:2000] or proc.stdout[:500] or "Nettacker 扫描发现",
                severity=f.get("severity", "medium"),
                status=Report.Status.PENDING,
                reporter=task.created_by,
                project=default_project,
                team=task.team,
                affected_url=f.get("target", target),
            )

        task.status = ScanTask.Status.FINISHED
        task.findings_count = len(findings)
        task.finished_at = datetime.now()
        task.save()

        AuditLog.objects.create(
            user=task.created_by, action='SCAN_COMPLETED', target_type='ScanTask',
            target_id=str(task.id),
            detail=f"扫描完成: {len(findings)} 个发现", team=task.team,
        )

        logger.info(f"Scan {scan_task_id} completed: {len(findings)} findings")

    except subprocess.TimeoutExpired:
        task.status = ScanTask.Status.FAILED
        task.finished_at = datetime.now()
        task.save()
        AuditLog.objects.create(
            user=task.created_by, action='SCAN_FAILED', target_type='ScanTask',
            target_id=str(task.id), detail="扫描超时 (30分钟)", team=task.team,
        )

    except Exception as e:
        task.status = ScanTask.Status.FAILED
        task.finished_at = datetime.now()
        task.save()
        AuditLog.objects.create(
            user=task.created_by, action='SCAN_FAILED', target_type='ScanTask',
            target_id=str(task.id), detail=f"扫描异常: {str(e)[:200]}", team=task.team,
        )
        logger.error(f"Scan {scan_task_id} failed: {e}")


def _map_severity(risk: str) -> str:
    risk_lower = str(risk).lower()
    if "high" in risk_lower or "critical" in risk_lower:
        return "high"
    if "low" in risk_lower:
        return "low"
    return "medium"


def launch_scan_async(scan_task):
    """异步启动扫描任务"""
    t = threading.Thread(
        target=run_scan, args=(scan_task.id, scan_task.target, scan_task.scanner_type),
        daemon=True
    )
    t.start()
