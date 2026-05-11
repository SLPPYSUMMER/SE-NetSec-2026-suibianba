"""Nettacker 扫描器集成 - 自动扫描任务执行器"""
import subprocess, threading, logging, os, json, glob, shutil, re
from datetime import datetime

logger = logging.getLogger(__name__)

NETTACKER_CMD = os.environ.get("NETTACKER_CMD", "nettacker")
OUTPUT_DIR = "/tmp/nettacker_results"

# 模块分组（前端自定义扫描用）
MODULE_GROUPS = {
    "端口扫描": ["port_scan", "icmp_scan"],
    "子域名": ["subdomain_scan", "subdomain_takeover_vuln"],
    "Web发现": ["admin_scan", "dir_scan", "http_status_scan", "http_html_title_scan",
                 "http_redirect_scan", "pma_scan", "viewdns_reverse_iplookup_scan"],
    "CVE检测": ["log4j_cve_2021_44228_vuln", "apache_cve_2021_41773_vuln",
                "apache_cve_2021_42013_vuln", "apache_ofbiz_cve_2024_38856_vuln",
                "confluence_cve_2023_22515_vuln", "confluence_cve_2023_22527_vuln",
                "citrix_cve_2019_19781_vuln", "citrix_cve_2023_4966_vuln",
                "grafana_cve_2021_43798_vuln", "teamcity_cve_2024_27198_vuln",
                "ivanti_ics_cve_2023_46805_vuln", "ivanti_epmm_cve_2023_35082_vuln",
                "adobe_coldfusion_cve_2023_26360_vuln", "msexchange_cve_2021_26855_vuln",
                "msexchange_cve_2021_34473_vuln", "omigod_cve_2021_38647_vuln",
                "forgerock_am_cve_2021_35464_vuln", "f5_cve_2020_5902_vuln",
                "cisco_hyperflex_cve_2021_1497_vuln", "aviatrix_cve_2021_40870_vuln",
                "vbulletin_cve_2019_16759_vuln", "prestashop_cve_2021_37538_vuln",
                "zoho_cve_2021_40539_vuln", "tieline_cve_2021_35336_vuln",
                "wp_plugin_cve_2021_38314_vuln", "wp_plugin_cve_2021_39316_vuln",
                "wp_plugin_cve_2021_39320_vuln", "wp_plugin_cve_2023_6875_vuln",
                "accela_cve_2021_34370_vuln", "cloudron_cve_2021_40868_vuln",
                "cyberoam_netgenie_cve_2021_38702_vuln", "exponent_cms_cve_2021_38751_vuln",
                "galera_webtemp_cve_2021_40960_vuln", "gurock_testrail_cve_2021_40875_vuln",
                "hoteldruid_cve_2021-37833_vuln", "justwirting_cve_2021_41878_vuln",
                "maxsite_cms_cve_2021_35265_vuln", "novnc_cve_2021_3654_vuln",
                "payara_cve_2021_41381_vuln", "phpinfo_cve_2021_37704_vuln",
                "placeos_cve_2021_41826_vuln", "puneethreddyhc_sqli_cve_2021_41648_vuln",
                "puneethreddyhc_sqli_cve_2021_41649_vuln", "qsan_storage_xss_cve_2021_37216_vuln",
                "tjws_cve_2021_37573_vuln", "graphql_vuln"],
    "Web安全": ["clickjacking_vuln", "http_cors_vuln", "http_cookie_vuln",
                "content_security_policy_vuln", "content_type_options_vuln",
                "strict_transport_security_vuln", "x_powered_by_vuln",
                "x_xss_protection_vuln", "server_version_vuln",
                "http_options_enabled_vuln", "wp_xmlrpc_pingback_vuln",
                "wp_xmlrpc_dos_vuln"],
    "SSL/TLS": ["ssl_certificate_weak_signature_vuln", "ssl_expired_certificate_vuln",
                "ssl_expiring_certificate_scan", "ssl_self_signed_certificate_vuln",
                "ssl_weak_cipher_vuln", "ssl_weak_version_vuln"],
    "信息收集": ["web_technologies_scan", "waf_scan", "drupal_modules_scan",
                 "drupal_theme_scan", "drupal_version_scan", "joomla_template_scan",
                 "joomla_user_enum_scan", "joomla_version_scan", "wordpress_version_scan",
                 "wp_plugin_scan", "wp_theme_scan", "wp_timethumbs_scan",
                 "confluence_version_scan", "moveit_version_scan",
                 "ivanti_csa_lastpatcheddate_scan", "ivanti_epmm_lastpatcheddate_scan",
                 "ivanti_ics_lastpatcheddate_scan", "ivanti_vtm_version_scan",
                 "citrix_lastpatcheddate_scan", "apache_struts_vuln"],
    "暴力破解": ["ssh_brute", "ftp_brute", "ftps_brute", "smtp_brute", "smtps_brute",
                 "pop3_brute", "pop3s_brute", "telnet_brute", "wp_xmlrpc_bruteforce_vuln"],
}

# 资产提取映射：模块名 → AssetType
_ASSET_MODULE_MAP = {
    "port_scan": "port",
    "icmp_scan": "host",
    "subdomain_scan": "subdomain",
    "subdomain_takeover_vuln": "subdomain",
    "http_status_scan": "service",
    "http_html_title_scan": "service",
    "web_technologies_scan": "web_tech",
    "ssl_certificate_weak_signature_vuln": "ssl_cert",
    "ssl_expired_certificate_vuln": "ssl_cert",
    "ssl_expiring_certificate_scan": "ssl_cert",
    "ssl_self_signed_certificate_vuln": "ssl_cert",
    "ssl_weak_cipher_vuln": "ssl_cert",
    "ssl_weak_version_vuln": "ssl_cert",
}


def _find_nettacker():
    """Return the usable nettacker invocation as a list of args."""
    for candidate in ([NETTACKER_CMD], ["python", "-m", "nettacker"]):
        try:
            result = subprocess.run(candidate + ["--help"], capture_output=True, timeout=10)
            if result.returncode == 0:
                return candidate
        except (FileNotFoundError, subprocess.TimeoutExpired):
            continue
    raise FileNotFoundError("nettacker CLI not found, tried: nettacker, python -m nettacker")


def _build_scan_args(task):
    """根据 ScanTask 配置构建 nettacker 模块参数和性能参数。"""
    extra_args = ["-d"]

    # 模块选择
    if task.selected_modules and task.selected_modules.strip():
        extra_args.extend(["-m", task.selected_modules.strip()])
    elif task.scanner_type == "quick":
        extra_args.extend(["--profile", "scan"])
    else:
        extra_args.extend(["-m", "all"])

    # 性能参数
    extra_args.extend(["-t", str(task.thread_count)])
    extra_args.extend(["-M", str(task.parallel_modules)])
    extra_args.extend(["--set-hardware-usage", task.hardware_usage])

    return extra_args


def _extract_assets(json_entries, scan_task, target):
    """从 Nettacker JSON 输出中提取资产并保存到 Asset 表。"""
    from website.models import Asset

    created = 0
    for entry in json_entries:
        if not isinstance(entry, dict):
            continue
        module = entry.get("module_name", "")
        asset_type = _ASSET_MODULE_MAP.get(module)
        if not asset_type:
            continue

        # 解析 json_event 获取额外信息
        extra = {}
        je = entry.get("json_event", "")
        if isinstance(je, str) and je.strip():
            try:
                extra = json.loads(je)
            except json.JSONDecodeError:
                pass

        # 构造资产名称
        entry_target = entry.get("target", target)
        port = entry.get("port")
        if asset_type == "port" and port:
            name = f"{entry_target}:{port}"
        elif asset_type in ("host", "subdomain"):
            name = entry_target
        elif asset_type == "service":
            name = entry_target if not port else f"{entry_target}:{port}"
        elif asset_type == "web_tech":
            resp = extra.get("response", {}) if isinstance(extra, dict) else {}
            techs = resp.get("conditions_results", {})
            name = ", ".join(str(k) for k in techs.keys()) or module
        elif asset_type == "ssl_cert":
            name = entry_target if not port else f"{entry_target}:{port}"
        else:
            name = entry_target

        # 去重：同 target+type+name 覆盖更新
        existing = Asset.objects.filter(
            target=target, asset_type=asset_type, name=name
        ).first()
        if existing:
            existing.value = json.dumps(extra, ensure_ascii=False)[:2000]
            existing.discovered_at = datetime.now()
            existing.save()
        else:
            Asset.objects.create(
                scan_task=scan_task,
                asset_type=asset_type,
                name=name[:255],
                value=json.dumps(extra, ensure_ascii=False)[:2000],
                status="online",
                target=target,
                team=scan_task.team,
            )
            created += 1

    return created


def run_scan(scan_task_id: int, target: str, scanner_type: str):
    """后台执行 Nettacker 扫描（无硬超时，流式读取进度）。"""
    from website.models import ScanTask, Report, AuditLog, Project

    task = ScanTask.objects.get(id=scan_task_id)
    task.status = ScanTask.Status.RUNNING
    task.progress = 0
    task.save()

    AuditLog.objects.create(
        user=task.created_by, action='SCAN_STARTED', target_type='ScanTask',
        target_id=str(task.id),
        detail=f"开始扫描 {target} (类型: {scanner_type})", team=task.team,
    )

    # 清理并创建输出目录
    shutil.rmtree(OUTPUT_DIR, ignore_errors=True)
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    output_file = os.path.join(OUTPUT_DIR, "results.json")
    nettacker_bin = _find_nettacker()
    scan_args = _build_scan_args(task)
    cmd = nettacker_bin + scan_args + [
        "-i", target,
        "-o", output_file,
    ]

    logger.info(f"Running Nettacker via '{' '.join(nettacker_bin)}': {' '.join(cmd[len(nettacker_bin):])}")

    try:
        # Popen 流式读取，无硬超时
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                text=True, bufsize=1)
        total_modules = 0
        current_module = 0

        # 流式读取 stdout，解析进度
        for line in proc.stdout:
            line = line.strip()
            # 解析日志行: [timestamp][+++] ... module-thread X/Y ...
            m = re.search(r'module-thread\s+(\d+)/(\d+)', line)
            if m:
                current_module = int(m.group(1))
                total_modules = max(total_modules, int(m.group(2)))
                if total_modules > 0:
                    progress = min(99, int(current_module / total_modules * 100))
                    task.progress = progress
                    task.save(update_fields=["progress"])

            # 日志透传
            if any(kw in line.lower() for kw in ("[+]", "[x]", "[!]", "error", "done")):
                logger.info(f"Nettacker: {line[:300]}")

        proc.wait()
        stderr_out = proc.stderr.read()
        if proc.returncode != 0:
            logger.error(f"Nettacker exited with code {proc.returncode}: {stderr_out[:500]}")

        # 标记完成
        task.progress = 100
        task.save(update_fields=["progress"])

        findings = []

        # 从 JSON 输出文件解析结果
        for jf in [output_file] + sorted(glob.glob(os.path.join(OUTPUT_DIR, "**/*.json"), recursive=True)):
            if not os.path.isfile(jf):
                continue
            try:
                with open(jf, encoding="utf-8") as f:
                    data = json.load(f)
                entries = data if isinstance(data, list) else data.get("results", data.get("events", []))
                for entry in entries:
                    if not isinstance(entry, dict):
                        continue
                    extra = {}
                    je = entry.get("json_event", "")
                    if isinstance(je, str) and je.strip():
                        try:
                            extra = json.loads(je)
                        except json.JSONDecodeError:
                            pass
                    resp = extra.get("response", {}) if isinstance(extra, dict) else {}
                    cond_results = resp.get("conditions_results", {}) if isinstance(resp, dict) else {}

                    vuln_details = []
                    for cond_key, cond_vals in cond_results.items():
                        if cond_key != "open_port" and cond_vals:
                            if isinstance(cond_vals, (list, tuple)):
                                vuln_details.append(f"{cond_key}: {', '.join(str(v) for v in cond_vals)}")
                            else:
                                vuln_details.append(f"{cond_key}: {cond_vals}")

                    title = entry.get("event") or entry.get("module_name") or "Nettacker 发现"
                    if len(title) > 200:
                        title = title[:200] + "..."

                    severity = _map_severity(entry.get("severity", "medium"))

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

                    findings.append({
                        "title": str(title),
                        "severity": severity,
                        "description": "\n".join(description_parts)[:2000],
                        "target": entry.get("target") or target,
                    })
            except (json.JSONDecodeError, FileNotFoundError, OSError):
                continue

        # 写入 Report
        default_project = Project.objects.first()
        for f in findings[:50]:
            Report.objects.create(
                title=f["title"][:255],
                description=f["description"][:2000] or "Nettacker 扫描发现",
                severity=f.get("severity", "medium"),
                status=Report.Status.PENDING,
                reporter=task.created_by,
                project=default_project,
                team=task.team,
                affected_url=f.get("target", target),
            )

        # 提取资产
        asset_count = _extract_assets(
            [e for e in (data if isinstance(data, list) else []) if isinstance(e, dict)],
            task, target
        ) if isinstance(data, list) else 0

        task.status = ScanTask.Status.FINISHED
        task.findings_count = len(findings)
        task.finished_at = datetime.now()
        task.progress = 100
        task.save()

        AuditLog.objects.create(
            user=task.created_by, action='SCAN_COMPLETED', target_type='ScanTask',
            target_id=str(task.id),
            detail=f"扫描完成: {len(findings)} 个发现, {asset_count} 个资产", team=task.team,
        )

        logger.info(f"Scan {scan_task_id} completed: {len(findings)} findings, {asset_count} assets")

    except Exception as e:
        task.status = ScanTask.Status.FAILED
        task.finished_at = datetime.now()
        task.progress = 0
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
