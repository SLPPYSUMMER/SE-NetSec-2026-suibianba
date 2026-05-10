"""Nettacker 扫描器集成 - 自动扫描任务执行器"""
import subprocess, threading, logging, os, json, time, glob, shutil
from datetime import datetime

logger = logging.getLogger(__name__)

NETTACKER_CMD = os.environ.get("NETTACKER_CMD", "nettacker")
MAX_SCAN_TIMEOUT = int(os.environ.get("SCAN_TIMEOUT", "1800"))
QUICK_SCAN_TIMEOUT = int(os.environ.get("SCAN_TIMEOUT_QUICK", "600"))
OUTPUT_DIR = "/tmp/nettacker_results"


def run_scan(scan_task_id: int, target: str, scanner_type: str):
    """后台执行 Nettacker 扫描"""
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

    # deep → 全模块扫描, quick → 端口+子域名
    profile_map = {"deep": "all", "quick": "port_scan,subdomain_scan"}
    modules = profile_map.get(scanner_type, "all")

    timeout = QUICK_SCAN_TIMEOUT if scanner_type == "quick" else MAX_SCAN_TIMEOUT

    # 清理并创建输出目录
    shutil.rmtree(OUTPUT_DIR, ignore_errors=True)
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    cmd = [
        NETTACKER_CMD,
        "-m", modules,
        "-i", target,
        "--report-path", OUTPUT_DIR,
        "--report-format", "json",
    ]

    logger.info(f"Running Nettacker: {' '.join(cmd)}")

    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        findings = []

        # 从 JSON 输出文件解析结果
        for jf in sorted(glob.glob(os.path.join(OUTPUT_DIR, "**/*.json"), recursive=True)):
            try:
                with open(jf, encoding="utf-8") as f:
                    data = json.load(f)
                entries = data if isinstance(data, list) else data.get("results", [])
                for entry in entries:
                    if not isinstance(entry, dict):
                        continue
                    title = entry.get("description") or entry.get("name") or entry.get("vulnerability", "Nettacker 发现")
                    findings.append({
                        "title": str(title),
                        "severity": _map_severity(entry.get("risk") or entry.get("severity", "medium")),
                        "description": (
                            f"模块: {entry.get('module_name', 'N/A')}\n"
                            f"端口: {entry.get('port', 'N/A')}\n"
                            f"协议: {entry.get('protocol', 'N/A')}\n"
                            f"{entry.get('description', entry.get('details', ''))}"
                        ),
                        "target": entry.get("target") or target,
                    })
            except (json.JSONDecodeError, FileNotFoundError, OSError):
                continue

        # 兜底：解析 stdout
        if not findings and proc.stdout:
            lines = proc.stdout.strip().split("\n")
            for line in lines[:100]:
                if any(kw in line.lower() for kw in ("found", "vuln", "open port", "discovered", "[+]")):
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
            target_id=str(task.id), detail=f"扫描超时 ({timeout // 60}分钟)", team=task.team,
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
