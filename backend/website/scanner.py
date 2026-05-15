"""
Nettacker 扫描器集成模块
========================

功能：
- 自动扫描任务执行（支持并发控制和FIFO队列）
- 实时进度跟踪和日志透传
- 资产自动提取和漏洞报告生成
- 任务取消和超时控制

架构设计：
- ScanManager: 单例管理器类，封装所有全局状态
- 线程安全：使用 threading.Lock 保护共享状态
- 资源清理：finally 块确保进程和锁的正确释放

性能优化：
- 信号量控制并发数（默认3个）
- 流式读取避免内存堆积
- 批量数据库写入减少IO

作者：SecGuard Team
版本：2.0 (优化版)
"""

import json
import logging
import os
import re
import shutil
import subprocess
import threading
import time
from collections import deque
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

# ==================== 配置常量 ====================
NETTACKER_CMD = os.environ.get("NETTACKER_CMD", "nettacker")
OUTPUT_DIR = Path("/tmp/nettacker_results")
DEFAULT_MAX_CONCURRENT = 3
DEFAULT_QUEUE_INTERVAL = 5  # 秒
DEFAULT_TIMEOUTS = {"quick": 5, "deep": 10, "custom": 15}  # 分钟

# 模块分组配置（前端自定义扫描用）
MODULE_GROUPS: Dict[str, List[str]] = {
    "端口扫描": ["port_scan", "icmp_scan"],
    "子域名": ["subdomain_scan", "subdomain_takeover_vuln"],
    "Web发现": [
        "admin_scan", "dir_scan", "http_status_scan", "http_html_title_scan",
        "http_redirect_scan", "pma_scan", "viewdns_reverse_iplookup_scan"
    ],
    "CVE检测": [
        "log4j_cve_2021_44228_vuln", "apache_cve_2021_41773_vuln",
        "apache_cve_2021_42013_vuln", "apache_ofbiz_cve_2024_38856_vuln",
        "confluence_cve_2023_22515_vuln", "confluence_cve_2023_22527_vuln",
        "citrix_cve_2019_19781_vuln", "citrix_cve_2023_4966_vuln",
        "grafana_cve_2021_43798_vuln", "teamcity_cve_2024_27198_vuln"
    ],
    "Web安全": [
        "clickjacking_vuln", "http_cors_vuln", "http_cookie_vuln",
        "content_security_policy_vuln", "x_powered_by_vuln"
    ],
    "SSL/TLS": [
        "ssl_certificate_weak_signature_vuln", "ssl_expired_certificate_vuln",
        "ssl_self_signed_certificate_vuln", "ssl_weak_cipher_vuln"
    ],
    "信息收集": [
        "web_technologies_scan", "waf_scan", "drupal_modules_scan",
        "wordpress_version_scan", "wp_plugin_scan"
    ],
    "暴力破解": [
        "ssh_brute", "ftp_brute", "smtp_brute", "telnet_brute"
    ],
}

# 资产类型映射：模块名 -> AssetType
_ASSET_MODULE_MAP: Dict[str, str] = {
    "port_scan": "port",
    "icmp_scan": "host",
    "subdomain_scan": "subdomain",
    "http_status_scan": "service",
    "web_technologies_scan": "web_tech",
    "ssl_certificate_weak_signature_vuln": "ssl_cert",
    "ssl_expired_certificate_vuln": "ssl_cert",
}


class ScanManager:
    """
    扫描任务管理器（单例模式）
    
    职责：
    - 管理并发扫描信号量
    - 维护FIFO等待队列
    - 跟踪活跃进程状态
    - 提供队列调度器
    
    线程安全：所有公共方法都是线程安全的
    
    使用示例：
        manager = ScanManager.get_instance()
        result = manager.launch_scan(scan_task)
    """
    
    _instance: Optional['ScanManager'] = None
    _lock: threading.Lock = threading.Lock()
    
    def __new__(cls) -> 'ScanManager':
        """单例实现：确保全局只有一个实例"""
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialized = False
        return cls._instance
    
    def __init__(self):
        """延迟初始化：避免重复初始化"""
        if self._initialized:
            return
        
        self.max_concurrent = int(os.environ.get("MAX_CONCURRENT_SCANS", str(DEFAULT_MAX_CONCURRENT)))
        self.queue_interval = int(os.environ.get("QUEUE_CHECK_INTERVAL", str(DEFAULT_QUEUE_INTERVAL)))
        
        # 并发控制信号量
        self._semaphore = threading.Semaphore(self.max_concurrent)
        
        # 活跃进程字典 {task_id: Popen}
        self._active_scans: Dict[int, subprocess.Popen] = {}
        self._scans_lock = threading.Lock()
        
        # FIFO等待队列 [(task_id, target, scanner_type), ...]
        self._wait_queue: Deque[Tuple[int, str, str]] = deque()
        self._queue_lock = threading.Lock()
        
        # 调度器线程
        self._scheduler_thread: Optional[threading.Thread] = None
        self._scheduler_running = False
        
        self._initialized = True
        logger.info(f"ScanManager initialized (max_concurrent={self.max_concurrent})")
    
    @classmethod
    def get_instance(cls) -> 'ScanManager':
        """获取单例实例（工厂方法）"""
        return cls()
    
    def launch_scan(self, scan_task) -> Dict[str, Any]:
        """
        启动扫描任务（支持并发控制和排队）
        
        Args:
            scan_task: ScanTask 模型实例
            
        Returns:
            dict: {
                'queued': bool,       # 是否进入等待队列
                'position': int,      # 队列位置（0表示立即执行）
                'status': str,        # 'running' | 'pending'
                'message': str        # 说明信息
            }
        """
        task_info = (scan_task.id, scan_task.target, scan_task.scanner_type)
        
        # 尝试获取信号量（非阻塞）
        acquired = self._semaphore.acquire(blocking=False)
        
        if acquired:
            # 有空闲槽位，立即执行
            logger.info(f"Task {scan_task.id} starting immediately (slot available)")
            threading.Thread(
                target=self._run_scan_thread,
                args=(scan_task,),
                daemon=True,
                name=f"scan-{scan_task.id}"
            ).start()
            
            return {
                'queued': False,
                'position': 0,
                'status': 'running',
                'message': f'任务已开始执行'
            }
        else:
            # 无空闲槽位，加入等待队列
            with self._queue_lock:
                position = len(self._wait_queue) + 1
                self._wait_queue.append(task_info)
            
            logger.info(f"Task {scan_task.id} queued at position #{position}")
            self._ensure_scheduler_running()
            
            return {
                'queued': True,
                'position': position,
                'status': 'pending',
                'message': f'任务已进入排队队列，当前位置: #{position}'
            }
    
    def _run_scan_thread(self, scan_task):
        """在独立线程中运行扫描任务（包装器）"""
        try:
            run_scan(scan_task.id, scan_task.target, scan_task.scanner_type)
        except Exception as e:
            logger.error(f"Scan thread crashed for task {scan_task.id}: {e}", exc_info=True)
        finally:
            # 释放信号量并尝试启动下一个任务
            self._semaphore.release()
            self._try_start_next_task()
    
    def cancel_scan(self, scan_task_id: int) -> Dict[str, Any]:
        """
        取消正在运行的扫描任务
        
        Args:
            scan_task_id: 任务ID
            
        Returns:
            dict: 操作结果
        """
        with self._scans_lock:
            proc = self._active_scans.get(scan_task_id)
        
        if not proc:
            return {'success': True, 'status': 'cancelled', 
                    'message': f'任务 {scan_task_id} 的进程记录不存在'}
        
        if proc.poll() is not None:
            with self._scans_lock:
                self._active_scans.pop(scan_task_id, None)
            return {'success': True, 'status': 'cancelled',
                    'message': f'任务 {scan_task_id} 已结束 (exit code: {proc.returncode})'}
        
        try:
            proc.terminate()
            try:
                proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait(timeout=5)
            
            with self._scans_lock:
                self._active_scans.pop(scan_task_id, None)
            
            logger.info(f'Successfully cancelled scan task {scan_task_id}')
            return {'success': True, 'status': 'cancelled', 
                    'message': f'任务 {scan_task_id} 已成功取消'}
        
        except Exception as e:
            logger.error(f'Failed to cancel scan {scan_task_id}: {e}')
            return {'success': False, 'status': 'error', 
                    'message': f'取消失败: {str(e)}'}
    
    def get_active_count(self) -> int:
        """获取当前活跃扫描数量"""
        with self._scans_lock:
            return len(self._active_scans)
    
    def get_queue_status(self) -> Dict[str, Any]:
        """获取队列状态信息"""
        with self._queue_lock:
            queue_list = list(self._wait_queue)
        
        return {
            'max_concurrent': self.max_concurrent,
            'active_count': self.get_active_count(),
            'waiting_count': len(queue_list),
            'waiting_tasks': [{'id': t[0], 'target': t[1], 'type': t[2]} for t in queue_list],
            'available_slots': max(0, self.max_concurrent - self.get_active_count()),
        }
    
    def get_queue_position(self, scan_task_id: int) -> Optional[int]:
        """获取指定任务的队列位置"""
        with self._queue_lock:
            for i, (tid, _, _) in enumerate(self._wait_queue, 1):
                if tid == scan_task_id:
                    return i
        return None
    
    def _try_start_next_task(self):
        """尝试从队列中取出下一个任务执行"""
        from website.models import ScanTask
        
        with self._queue_lock:
            if not self._wait_queue:
                return
            
            task_id, target, scanner_type = self._wait_queue.popleft()
        
        try:
            task = ScanTask.objects.get(id=task_id)
            acquired = self._semaphore.acquire(blocking=False)
            if acquired:
                threading.Thread(
                    target=self._run_scan_thread,
                    args=(task,),
                    daemon=True,
                    name=f"scan-{task_id}"
                ).start()
                logger.info(f"Started queued task {task_id}")
            else:
                # 重新放回队列头部
                with self._queue_lock:
                    self._wait_queue.appendleft((task_id, target, scanner_type))
        except Exception as e:
            logger.error(f"Failed to start next task {task_id}: {e}")
    
    def _ensure_scheduler_running(self):
        """确保调度器线程正在运行"""
        if self._scheduler_running and self._scheduler_thread and self._scheduler_thread.is_alive():
            return
        
        self._scheduler_running = True
        self._scheduler_thread = threading.Thread(
            target=self._scheduler_loop,
            daemon=True,
            name="scan-scheduler"
        )
        self._scheduler_thread.start()
        logger.info("Scheduler thread started")
    
    def _scheduler_loop(self):
        """调度器主循环：定期检查队列并启动任务"""
        while self._scheduler_running:
            time.sleep(self.queue_interval)
            self._try_start_next_task()


# 全局单例实例
_manager = ScanManager.get_instance()

# 公共API函数（保持向后兼容）
def launch_scan_async(scan_task) -> Dict[str, Any]:
    """异步启动扫描任务（向后兼容接口）"""
    return _manager.launch_scan(scan_task)

def get_queue_status() -> Dict[str, Any]:
    """获取队列状态（向后兼容接口）"""
    return _manager.get_queue_status()

def get_queue_position(scan_task_id: int) -> Optional[int]:
    """获取队列位置（向后兼容接口）"""
    return _manager.get_queue_position(scan_task_id)

def cancel_scan(scan_task_id: int) -> Dict[str, Any]:
    """取消扫描任务（向后兼容接口）"""
    return _manager.cancel_scan(scan_task_id)


# ==================== 内部实现函数 ====================

def _find_nettacker() -> List[str]:
    """查找可用的 nettacker 命令
    
    Returns:
        list: 可执行的命令参数列表
        
    Raises:
        FileNotFoundError: 未找到 nettacker
    """
    candidates = [
        [NETTACKER_CMD],
        ["python", "-m", "nettacker"],
    ]
    
    for candidate in candidates:
        try:
            result = subprocess.run(
                candidate + ["--help"],
                capture_output=True,
                timeout=10
            )
            if result.returncode == 0:
                return candidate
        except (FileNotFoundError, subprocess.TimeoutExpired):
            continue
    
    raise FileNotFoundError(
        f"nettacker CLI not found, tried: {[c[0] for c in candidates]}"
    )


def _build_scan_args(task) -> List[str]:
    """根据 ScanTask 配置构建 nettacker 参数
    
    Args:
        task: ScanTask 实例
        
    Returns:
        list: 命令行参数列表
    """
    args = ["-d"]
    
    # 模块选择逻辑
    if task.selected_modules and task.selected_modules.strip():
        args.extend(["-m", task.selected_modules.strip()])
    elif task.scanner_type == "quick":
        args.extend(["--profile", "scan"])
    else:
        args.extend(["-m", "all"])
    
    # 性能参数
    args.extend([
        "-t", str(task.thread_count),
        "-M", str(task.parallel_modules),
    ])
    
    # 硬件使用率映射
    hw_map = {"low": "low", "medium": "normal", "high": "high", "maximum": "maximum"}
    hw_usage = hw_map.get(task.hardware_usage, "normal")
    args.extend(["--set-hardware-usage", hw_usage])
    
    return args


def _map_severity(raw_severity: str) -> str:
    """映射 Nettacker 严重度到标准值
    
    Args:
        raw_severity: 原始严重度字符串
        
    Returns:
        str: 标准化严重度 (critical/high/medium/low/info)
    """
    severity_map = {
        "high": "critical",
        "critical": "critical",
        "medium": "high",
        "low": "medium",
        "info": "low",
    }
    return severity_map.get(str(raw_severity).lower(), "medium")


def _extract_assets(entries: List[Dict], scan_task, target: str) -> int:
    """从 Nettacker 结果中提取资产
    
    Args:
        entries: JSON条目列表
        scan_task: 关联的扫描任务
        target: 扫描目标
        
    Returns:
        int: 新创建的资产数量
    """
    from website.models import Asset
    
    created = 0
    batch_updates = []  # 批量更新列表
    
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        
        module = entry.get("module_name", "")
        asset_type = _ASSET_MODULE_MAP.get(module)
        if not asset_type:
            continue
        
        # 解析额外信息
        extra = _safe_json_parse(entry.get("json_event", ""))
        
        # 构造资产名称
        entry_target = entry.get("target", target)
        port = entry.get("port")
        name = _build_asset_name(asset_type, entry_target, port, extra, module)
        
        value_str = json.dumps(extra, ensure_ascii=False)[:2000]
        
        # 收集更新操作（批量处理）
        batch_updates.append({
            'target': target,
            'asset_type': asset_type,
            'name': name[:255],
            'value': value_str,
        })
    
    # 批量执行数据库操作
    for update in batch_updates:
        existing = Asset.objects.filter(
            target=update['target'],
            asset_type=update['asset_type'],
            name=update['name']
        ).first()
        
        if existing:
            existing.value = update['value']
            existing.discovered_at = datetime.now()
            existing.save(update_fields=['value', 'discovered_at'])
        else:
            Asset.objects.create(
                scan_task=scan_task,
                asset_type=update['asset_type'],
                name=update['name'],
                value=update['value'],
                status="online",
                target=target,
                team=scan_task.team,
            )
            created += 1
    
    return created


def _build_asset_name(asset_type: str, target: str, port, extra: Dict, module: str) -> str:
    """构造资产显示名称"""
    if asset_type == "port" and port:
        return f"{target}:{port}"
    elif asset_type in ("host", "subdomain"):
        return target
    elif asset_type == "service":
        return target if not port else f"{target}:{port}"
    elif asset_type == "web_tech":
        resp = extra.get("response", {}) if isinstance(extra, dict) else {}
        techs = resp.get("conditions_results", {})
        return ", ".join(str(k) for k in techs.keys()) or module
    elif asset_type == "ssl_cert":
        return target if not port else f"{target}:{port}"
    else:
        return target


def _safe_json_parse(json_str: str) -> Any:
    """安全的JSON解析（容错）"""
    if not isinstance(json_str, str) or not json_str.strip():
        return {}
    try:
        return json.loads(json_str)
    except json.JSONDecodeError:
        return {}


def run_scan(scan_task_id: int, target: str, scanner_type: str):
    """
    后台执行 Nettacker 扫描（核心函数）
    
    功能：
    - 启动 Nettacker 子进程
    - 流式读取输出并解析进度
    - 超时控制和异常处理
    - 结果解析和数据库写入
    - 资源清理（finally块）
    
    Args:
        scan_task_id: 扫描任务ID
        target: 扫描目标地址
        scanner_type: 扫描类型 (quick/deep/custom)
    """
    from website.models import ScanTask, Report, AuditLog, Project, Organization, Asset
    
    task = ScanTask.objects.get(id=scan_task_id)
    
    # 更新任务状态为运行中
    task.status = ScanTask.Status.RUNNING
    task.progress = 0
    task.save(update_fields=['status', 'progress'])
    
    AuditLog.objects.create(
        user=task.created_by,
        action='SCAN_STARTED',
        target_type='ScanTask',
        target_id=str(task.id),
        detail=f"开始扫描 {target} (类型: {scanner_type})",
        team=task.team,
    )
    
    # 准备输出目录
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    output_file = OUTPUT_DIR / "results.json"
    
    # 构建命令
    nettacker_bin = _find_nettacker()
    scan_args = _build_scan_args(task)
    cmd = nettacker_bin + scan_args + ["-i", target, "-o", str(output_file)]
    
    logger.info(f"[{scan_task_id}] Starting scan: {' '.join(cmd)}")
    
    # 计算超时时间
    timeout_seconds = _calculate_timeout(task, scanner_type)
    start_time = datetime.now()
    proc = None
    
    try:
        # 启动子进程
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1
        )
        
        # 注册到活跃进程字典
        with _manager._scans_lock:
            _manager._active_scans[scan_task_id] = proc
        
        # 流式读取输出（进度解析）
        _read_scan_output(proc, task, start_time, timeout_seconds)

        # 标记完成
        task.progress = 100
        task.save(update_fields=['progress'])

        # 加载扫描结果并解析发现
        data = _load_scan_results(output_file)
        findings = [_parse_finding(e, target) for e in (data if isinstance(data, list) else []) if isinstance(e, dict)]
        findings = [f for f in findings if f is not None]

        # 保存发现和提取资产
        project = _get_or_create_default_project(Organization, Project)
        _save_findings(findings, task, project, target)
        asset_count = _extract_assets(data, task, target) if isinstance(data, list) else 0
        
        # 更新最终状态
        task.status = ScanTask.Status.FINISHED
        task.findings_count = len(findings)
        task.finished_at = datetime.now()
        task.progress = 100
        task.save()
        
        AuditLog.objects.create(
            user=task.created_by,
            action='SCAN_COMPLETED',
            target_type='ScanTask',
            target_id=str(task.id),
            detail=f"扫描完成: {len(findings)} 个发现, {asset_count} 个资产",
            team=task.team,
        )
        
        logger.info(f"[{scan_task_id}] Completed: {len(findings)} findings, {asset_count} assets")
        
    except TimeoutError as e:
        _handle_scan_failure(task, str(e), timeout_error=True)
    except Exception as e:
        _handle_scan_failure(task, str(e))
    finally:
        # 清理资源
        if proc and proc.poll() is None:
            proc.terminate()
            try:
                proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                proc.kill()
        
        with _manager._scans_lock:
            _manager._active_scans.pop(scan_task_id, None)


def _calculate_timeout(task, scanner_type: str) -> int:
    """计算扫描超时时间（秒）"""
    user_timeout = getattr(task, 'timeout_minutes', None) or 60
    if user_timeout > 0:
        return user_timeout * 60
    return DEFAULT_TIMEOUTS.get(scanner_type, 10) * 60


def _read_scan_output(proc: subprocess.Popen, task, start_time: datetime, 
                       timeout_seconds: int) -> List[Dict]:
    """流式读取扫描输出并解析进度
    
    Returns:
        list: 发现的漏洞列表
    """
    total_modules = 0
    current_module = 0
    progress_pattern = re.compile(r'module-thread\s+(\d+)/(\d+)')
    
    while True:
        try:
            line = proc.stdout.readline()
            if not line:
                break
            
            line = line.strip()
            
            # 解析进度
            match = progress_pattern.search(line)
            if match:
                current_module = max(current_module, int(match.group(1)))
                total_modules = max(total_modules, int(match.group(2)))
                
                if total_modules > 0:
                    progress = min(99, int(current_module / total_modules * 100))
                    if task.progress != progress:
                        task.progress = progress
                        task.save(update_fields=['progress'])
            
            # 记录重要日志
            if any(kw in line.lower() for kw in ("[+]", "[x]", "[!]", "error", "done")):
                logger.info(f"[{task.id}] Nettacker: {line[:300]}")
            
            # 检查超时
            elapsed = (datetime.now() - start_time).total_seconds()
            if elapsed > timeout_seconds:
                logger.warning(f"[{task.id}] Timeout after {elapsed:.0f}s (limit: {timeout_seconds}s)")
                proc.terminate()
                try:
                    proc.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    proc.kill()
                raise TimeoutError(f"扫描超时 ({timeout_seconds}秒)")
                
        except ValueError:
            break
    
    proc.wait(timeout=30)
    if proc.returncode != 0:
        logger.error(f"[{task.id}] Nettacker exited with code {proc.returncode}")
    
    return []


def _load_scan_results(output_file: Path) -> Any:
    """加载扫描结果JSON"""
    all_entries = []
    
    json_files = [output_file] + sorted(
        OUTPUT_DIR.glob("**/*.json"),
        key=lambda p: p.name
    )
    
    for jf in json_files:
        if not jf.is_file():
            continue
        
        try:
            with open(jf, encoding="utf-8") as f:
                data = json.load(f)
            
            entries = data if isinstance(data, list) else data.get("results", data.get("events", []))
            all_entries.extend(e for e in entries if isinstance(e, dict))
            
        except (json.JSONDecodeError, FileNotFoundError, OSError) as e:
            logger.warning(f"Failed to load results from {jf}: {e}")
            continue
    
    return all_entries


def _parse_finding(entry: Dict, target: str) -> Optional[Dict]:
    """解析单个扫描结果条目"""
    extra = _safe_json_parse(entry.get("json_event", ""))
    resp = extra.get("response", {}) if isinstance(extra, dict) else {}
    cond_results = resp.get("conditions_results", {}) if isinstance(resp, dict) else {}
    
    # 构建漏洞详情
    vuln_details = []
    for key, vals in cond_results.items():
        if key != "open_port" and vals:
            if isinstance(vals, (list, tuple)):
                vuln_details.append(f"{key}: {', '.join(str(v) for v in vals)}")
            else:
                vuln_details.append(f"{key}: {vals}")
    
    title = entry.get("event") or entry.get("module_name") or "Nettacker 发现"
    if len(title) > 200:
        title = title[:200] + "..."
    
    description_parts = [
        f"模块: {entry.get('module_name', 'N/A')}",
        f"目标: {entry.get('target', target)}",
        f"端口: {entry.get('port', 'N/A')}",
    ]
    
    if vuln_details:
        description_parts.append("检测结果:")
        description_parts.extend(vuln_details)
    
    if extra:
        description_parts.append(f"详情: {json.dumps(extra, ensure_ascii=False)[:1000]}")
    
    return {
        "title": str(title),
        "severity": _map_severity(entry.get("severity", "medium")),
        "description": "\n".join(description_parts)[:2000],
        "target": entry.get("target") or target,
    }


def _save_findings(findings: List[Dict], task, project, target: str):
    """保存漏洞发现到数据库"""
    from website.models import Report
    
    for finding in findings[:50]:  # 限制最多50个
        Report.objects.create(
            title=finding["title"][:255],
            description=finding["description"][:2000] or "Nettacker 扫描发现",
            severity=finding.get("severity", "medium"),
            status=Report.Status.PENDING,
            reporter=task.created_by,
            project=project,
            team=task.team,
            affected_url=finding.get("target", target),
        )


def _get_or_create_default_project(Organization, Project):
    """获取或创建默认项目"""
    default_project = Project.objects.first()
    if default_project:
        return default_project
    
    default_org = Organization.objects.first()
    if not default_org:
        default_org = Organization.objects.create(name="默认组织", slug="default")
    
    default_project = Project.objects.create(
        name="默认扫描项目",
        slug="default-scan-project",
        organization=default_org,
        status="production"
    )
    logger.info(f"Created default project: {default_project.id}")
    return default_project


def _handle_scan_failure(task, error_msg: str, timeout_error: bool = False):
    """处理扫描失败"""
    from website.models import AuditLog
    
    task.status = ScanTask.Status.FAILED
    task.finished_at = datetime.now()
    task.progress = 0
    task.save()
    
    action = 'SCAN_TIMEOUT' if timeout_error else 'SCAN_FAILED'
    AuditLog.objects.create(
        user=task.created_by,
        action=action,
        target_type='ScanTask',
        target_id=str(task.id),
        detail=f"扫描{'超时' if timeout_error else '异常'}: {error_msg[:200]}",
        team=task.team,
    )
    
    logger.error(f"[{task.id}] Scan failed: {error_msg}")
