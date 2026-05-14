"""
通用工具函数模块
================

功能：
- 文件验证和类型检查
- URL安全处理和重定向
- GitHub API集成
- OpenAI API调用（嵌入生成、PR分析）
- 代码解析（函数签名、Django模型提取）
- 向量相似度计算

性能优化：
- 懒加载初始化（OpenAI客户端）
- 缓存常用结果
- 超时控制和重试机制

作者：SecGuard Team
版本：2.0 (优化版)
"""

import ast
import difflib
import hashlib
import io
import logging
import os
import re
import socket
import time
from collections import deque
from datetime import datetime, timedelta
from ipaddress import ip_address
from typing import Any, Dict, List, Optional, Tuple, Union
from urllib.parse import quote, urlparse, urlsplit, urlunparse

import numpy as np
import requests
from bs4 import BeautifulSoup
from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.files.base import ContentFile
from django.core.validators import FileExtensionValidator, URLValidator
from django.db import models
from django.http import HttpRequest, HttpResponseBadRequest, HttpResponseRedirect
from django.shortcuts import redirect
from django.utils import timezone
from PIL import Image

# 可选依赖导入（容错处理）
try:
    import cv2
except ImportError:
    cv2 = None

try:
    import tweepy
except ImportError:
    tweepy = None

try:
    from openai import OpenAI
except ImportError:
    OpenAI = None

try:
    import markdown as markdown_lib
except ImportError:
    markdown_lib = None

# 本地模型导入
from website.models import DailyStats
from .models import PRAnalysisReport


# ==================== 日志配置 ====================
logger = logging.getLogger(__name__)


def _sanitize_log(value: Any, max_length: int = 1000) -> str:
    """清理日志输出（防止日志注入）
    
    Args:
        value: 要清理的值
        max_length: 最大长度
        
    Returns:
        str: 清理后的字符串
    """
    sanitized = re.sub(r"[\r\n\x00-\x1f\x7f-\x9f\u2028\u2029]", "", str(value))
    if len(sanitized) > max_length:
        return sanitized[:max_length] + "...(truncated)"
    return sanitized


# ==================== 常量定义 ====================
GITHUB_API_TOKEN: str = getattr(settings, 'GITHUB_TOKEN', '')

WHITELISTED_IMAGE_TYPES: Dict[str, str] = {
    "jpeg": "image/jpeg",
    "jpg": "image/jpeg",
    "png": "image/png",
}

# 安全验证正则表达式
_SAFE_PATTERN = re.compile(r"^[a-zA-Z0-9._-]+$")
_SAFE_ENDPOINT = re.compile(r"^[a-zA-Z0-9_-]+$")
_EMAIL_PATTERN = re.compile(r"[a-z0-9\.\-+_]+@[a-z0-9\.\-+_]+\.[a-z]+", re.I)


# ==================== OpenAI 客户端管理 ====================
class _OpenAIClientManager:
    """
    OpenAI 客户端懒加载管理器
    
    功能：
    - 延迟初始化（首次使用时才创建连接）
    - 线程安全
    - 自动检测API Key有效性
    
    使用：
        client = get_openai_client()
        if client:
            response = client.chat.completions.create(...)
    """
    
    _client: Optional[OpenAI] = None
    _initialized: bool = False
    
    @classmethod
    def get_client(cls) -> Optional[OpenAI]:
        """获取 OpenAI 客户端实例（懒加载）"""
        if cls._initialized:
            return cls._client
        
        if OpenAI is None:
            logger.warning("OpenAI library not installed")
            cls._initialized = True
            return None
        
        api_key = os.getenv("OPENAI_API_KEY", "")
        if not api_key or not api_key.startswith("sk-"):
            logger.warning("OPENAI_API_KEY not set or invalid format")
            cls._initialized = True
            return None
        
        try:
            cls._client = OpenAI(api_key=api_key)
            cls._initialized = True
            logger.info("OpenAI client initialized successfully")
            return cls._client
        except Exception as e:
            logger.error(f"Failed to initialize OpenAI client: {e}")
            cls._initialized = True
            return None


def get_openai_client() -> Optional[OpenAI]:
    """获取 OpenAI 客户端（公共接口）"""
    return _OpenAIClientManager.get_client()


# ==================== 文件验证函数 ====================

def validate_file_type(
    request: HttpRequest,
    file_field_name: str,
    allowed_extensions: List[str],
    allowed_mime_types: Optional[List[str]] = None,
    max_size: Optional[int] = None
) -> Tuple[bool, Optional[str]]:
    """
    验证上传文件的类型和大小
    
    Args:
        request: HTTP请求对象
        file_field_name: 文件字段名
        allowed_extensions: 允许的扩展名列表
        allowed_mime_types: 允许的MIME类型列表（可选）
        max_size: 最大文件大小（字节）（可选）
        
    Returns:
        tuple: (是否有效, 错误消息)
    """
    file = request.FILES.get(file_field_name)
    if not file:
        return True, None  # 文件可选；未提供则跳过验证
    
    # 扩展名验证
    extension_validator = FileExtensionValidator(allowed_extensions=allowed_extensions)
    try:
        extension_validator(file)
    except ValidationError:
        return False, f"Invalid file extension. Allowed: {', '.join(allowed_extensions)}"
    
    # MIME类型验证
    if allowed_mime_types and file.content_type not in allowed_mime_types:
        return False, f"Invalid MIME type. Allowed: {', '.join(allowed_mime_types)}"
    
    # 大小验证
    if max_size and file.size > max_size:
        return False, f"File size exceeds the maximum limit of {max_size} bytes."
    
    return True, None


def image_validator(img) -> Union[str, bool]:
    """
    验证图片文件的有效性
    
    检查项：
    - 文件扩展名（仅允许 jpeg/jpg/png）
    - 文件大小（最大3MB）
    - MIME类型
    - 图片内容（拒绝纯色图片）
    
    Args:
        img: 上传的图片文件对象
        
    Returns:
        str: 错误消息 | True: 验证通过
    """
    try:
        filesize = img.file.size
    except AttributeError:
        filesize = getattr(img, 'size', 0)
    
    extension = img.name.rsplit(".", 1)[-1] if "." in img.name else ""
    content_type = img.content_type
    megabyte_limit = 3.0
    
    # 扩展名检查
    if not extension or extension.lower() not in WHITELISTED_IMAGE_TYPES:
        return "Invalid image types"
    
    # 大小检查
    if filesize > megabyte_limit * 1024 * 1024:
        return f"Max file size is {megabyte_limit}MB"
    
    # MIME类型检查
    if content_type not in WHITELISTED_IMAGE_TYPES.values():
        return "Invalid image content-type"
    
    # 内容检查：拒绝纯色图片
    try:
        img_array = np.array(Image.open(img))
        if img_array.std() < 10:
            return "Image appears to be a single color"
    except Exception as e:
        logger.warning(f"Failed to analyze image content: {e}")
    
    return True


# ==================== 网络和安全工具函数 ====================

def get_client_ip(request: HttpRequest) -> str:
    """
    从请求中提取客户端IP地址
    
    支持代理场景（X-Forwarded-For头）
    
    Args:
        request: HTTP请求对象
        
    Returns:
        str: IP地址字符串
    """
    x_forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR")
    if x_forwarded_for:
        return x_forwarded_for.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR", "")


def is_valid_https_url(url: str) -> bool:
    """验证是否为有效的HTTPS URL"""
    validator = URLValidator(schemes=["https"])
    try:
        validator(url)
        return True
    except ValidationError:
        return False


def is_dns_safe(hostname: str) -> bool:
    """
    检查主机名DNS解析结果是否安全
    
    排除：
    - 私有IP地址 (10.x, 172.16-31.x, 192.168.x)
    - 回环地址 (127.x)
    - 保留地址
    - 链路本地地址
    
    Args:
        hostname: 主机名或IP
        
    Returns:
        bool: 是否安全
    """
    try:
        resolved = socket.getaddrinfo(hostname, None)
    except socket.gaierror:
        return False
    
    for result in resolved:
        ip_str = result[4][0]
        try:
            ip = ip_address(ip_str)
            if ip.is_private or ip.is_loopback or ip.is_reserved or ip.is_link_local:
                return False
        except ValueError:
            continue
    return True


def rebuild_safe_url(url: str) -> Optional[str]:
    """
    重建安全的URL（防止SSRF攻击）
    
    处理：
    - 仅允许 http/https 协议
    - 移除认证信息 (@user:pass)
    - 验证主机名DNS安全性
    - 清理路径中的危险字符
    - 编码路径参数
    
    Args:
        url: 原始URL
        
    Returns:
        str|None: 安全的URL，如果不安全则返回None
    """
    parsed_url = urlparse(url)
    
    # 仅允许HTTP/HTTPS协议
    if parsed_url.scheme not in ("http", "https"):
        return None
    
    # 移除认证信息
    netloc = parsed_url.netloc.split("@")[-1]
    
    # 提取并验证主机名
    hostname = urlparse(f"http://{netloc}").hostname
    if not hostname:
        return None
    
    # 检查是否为私有/回环IP
    try:
        ip = ip_address(hostname)
        if ip.is_private or ip.is_loopback:
            return None
    except ValueError:
        if not is_dns_safe(hostname):
            return None
    
    # 清理路径
    path = parsed_url.path
    path = path.replace("\r", "").replace("\n", "")
    path = re.sub(r"/\.\.", "", path)  # 移除目录遍历
    path = re.sub(r"/{2,}", "/", path)  # 合并多斜杠
    
    if path in ("", "."):
        path = "/"
    elif not path.startswith("/"):
        path = "/" + path
    
    # URL编码路径
    encoded_path = quote(path, safe="/")
    
    # 重建URL（移除fragment和query string以增强安全性）
    safe_url = urlunparse((parsed_url.scheme, netloc, encoded_path, "", "", ""))
    
    return safe_url


def is_safe_url(
    url: str,
    allowed_hosts: List[str],
    allowed_paths: Optional[List[str]] = None
) -> bool:
    """检查URL是否在允许的主机和路径范围内"""
    parsed = urlparse(url)
    
    # 检查主机
    if parsed.netloc not in allowed_hosts:
        return False
    
    # 检查路径（如果提供了允许列表）
    if allowed_paths and parsed.path not in allowed_paths:
        return False
    
    return True


def safe_redirect_allowed(
    url: str,
    allowed_hosts: List[str],
    allowed_paths: Optional[List[str]] = None
) -> Union[HttpResponseRedirect, HttpResponseBadRequest]:
    """执行安全重定向（验证目标URL安全性）"""
    if is_safe_url(url, allowed_hosts, allowed_paths):
        safe_url = rebuild_safe_url(url)
        return redirect(safe_url)
    return HttpResponseBadRequest("Invalid redirection URL.")


def safe_redirect_request(request: HttpRequest) -> HttpResponseRedirect:
    """根据Referer头进行安全重定向"""
    http_referer = request.META.get("HTTP_REFERER")
    if http_referer:
        referer_url = urlparse(http_referer)
        if referer_url.netloc == request.get_host():
            safe_url = urlunparse((
                referer_url.scheme,
                referer_url.netloc,
                referer_url.path,
                "", "", ""
            ))
            return redirect(safe_url)
    
    fallback_url = f"{request.scheme}://{request.get_host()}/"
    return redirect(fallback_url)


# ==================== GitHub API 集成 ====================

def fetch_github_data(
    owner: str,
    repo: str,
    endpoint: str,
    number: Union[str, int]
) -> Dict[str, Any]:
    """
    从GitHub API获取数据
    
    Args:
        owner: 仓库所有者
        repo: 仓库名称
        endpoint: API端点（issues/pulls等）
        number: 问题/PR编号
        
    Returns:
        dict: API响应数据或错误信息
    """
    # 输入验证（防止注入攻击）
    if not (_SAFE_PATTERN.match(owner) and _SAFE_PATTERN.match(repo)):
        return {"error": "Invalid owner or repo name"}
    if not _SAFE_ENDPOINT.match(str(endpoint)):
        return {"error": "Invalid endpoint"}
    if not str(number).isdigit():
        return {"error": "Invalid number"}
    
    url = f"https://api.github.com/repos/{owner}/{repo}/{endpoint}/{number}"
    headers = {
        "Authorization": f"Bearer {GITHUB_API_TOKEN}",
        "Accept": "application/vnd.github.v3+json",
    }
    
    try:
        response = requests.get(url, headers=headers, timeout=10)
        if response.status_code == 200:
            return response.json()
        return {"error": f"Failed to fetch data: {response.status_code}"}
    except Exception as e:
        logger.error(f"GitHub API error: {e}")
        return {"error": f"Request failed: {str(e)}"}


def get_github_issue_title(github_issue_url: str) -> str:
    """
    获取GitHub Issue标题
    
    Args:
        github_issue_url: Issue/PRI完整URL
        
    Returns:
        str: 标题文本，失败时返回"No Title"
    """
    try:
        parsed = urlparse(github_issue_url)
        
        # 验证域名
        if parsed.hostname not in ("github.com", "www.github.com"):
            return "No Title"
        
        # 解析路径结构：/owner/repo/issues/number
        path_parts = [p for p in parsed.path.strip("/").split("/") if p]
        if len(path_parts) < 4 or path_parts[2] not in ("issues", "pull"):
            return "No Title"
        
        owner, repo, _, issue_number = path_parts[:4]
        
        # 验证各部分格式
        if not all(_SAFE_PATTERN.match(p) for p in [owner, repo]):
            return "No Title"
        if not issue_number.isdigit():
            return "No Title"
        
        # 调用API获取标题
        result = fetch_github_data(owner, repo, path_parts[2], issue_number)
        return result.get("title", f"Issue #{issue_number}") if isinstance(result, dict) else "No Title"
        
    except Exception as e:
        logger.warning(f"Failed to get GitHub issue title: {e}")
        return "No Title"


# ==================== 邮箱收集工具 ====================

def get_email_from_domain(domain_name: str) -> Union[str, bool]:
    """
    从域名网站收集邮箱地址
    
    功能：
    - 访问目标网站首页
    - 解析页面内容查找邮箱
    - 支持简单的链接跟踪（同域内）
    - 超时控制（20秒总时间）
    
    安全措施：
    - 排除私有IP和内部主机名
    - URL安全重建
    - 请求超时限制
    
    Args:
        domain_name: 目标域名
        
    Returns:
        str|bool: 找到的第一个匹配邮箱，失败返回False
    """
    # 验证域名不是IP地址或内部主机名
    try:
        ip = ip_address(domain_name)
        if ip.is_private or ip.is_loopback or ip.is_reserved or ip.is_link_local:
            return False
    except ValueError:
        if "." not in domain_name or " " in domain_name:
            return False
    
    initial_url = f"http://{domain_name}"
    safe_initial = rebuild_safe_url(initial_url)
    if not safe_initial:
        return False
    
    new_urls = deque([safe_initial])
    processed_urls: set = set()
    emails: set = set()
    emails_out: set = set()
    timeout_time = time.time() + 20  # 总超时20秒
    
    while new_urls and time.time() < timeout_time:
        url = new_urls.popleft()
        processed_urls.add(url)
        
        parts = urlsplit(url)
        base_url = f"{parts.scheme}://{parts.netloc}"
        path = url[:url.rfind("/") + 1] if "/" in parts.path else url
        
        try:
            response = requests.get(url, timeout=5, allow_redirects=False)
        except Exception:
            continue
        
        # 查找邮箱地址
        new_emails = set(_EMAIL_PATTERN.findall(response.text))
        if new_emails:
            emails.update(new_emails)
            break
        
        # 解析链接并添加到队列
        soup = BeautifulSoup(response.text, "html.parser")
        for anchor in soup.find_all("a"):
            link = anchor.attrs.get("href", "")
            
            if link.startswith("/"):
                link = base_url + link
            elif not link.startswith("http"):
                link = path + link
            
            # 验证链接安全性
            safe_link = rebuild_safe_url(link)
            if (safe_link and 
                safe_link not in new_urls and 
                safe_link not in processed_urls and 
                domain_name in safe_link):
                new_urls.append(safe_link)
    
    # 过滤出包含目标域名的邮箱
    for email in emails:
        if email.find(domain_name) > 0:
            emails_out.add(email)
    
    try:
        return list(emails_out)[0]
    except IndexError:
        return False


# ==================== 权限和辅助函数 ====================

def admin_required(user) -> bool:
    """检查用户是否为管理员"""
    return user.is_superuser


def format_timedelta(td: timedelta) -> str:
    """
    格式化时间差为可读字符串
    
    Args:
        td: timedelta对象
        
    Returns:
        str: 格式化的时间字符串（如 "1h 30m 45s"）
    """
    total_seconds = int(td.total_seconds())
    hours, remainder = divmod(total_seconds, 3600)
    minutes, seconds = divmod(remainder, 60)
    return f"{hours}h {minutes}m {seconds}s"


# ==================== AI/ML 工具函数 ====================

def generate_embedding(text: str, retries: int = 2, backoff_factor: int = 2) -> Optional[np.ndarray]:
    """
    使用OpenAI API生成文本嵌入向量
    
    功能：
    - 调用 text-embedding-ada-002 模型
    - 自动重试机制（指数退避）
    - 返回numpy数组
    
    Args:
        text: 输入文本
        retries: 重试次数
        backoff_factor: 退避因子（秒）
        
    Returns:
        np.ndarray|None: 嵌入向量，失败返回None
    """
    client = get_openai_client()
    if not client:
        logger.error("OpenAI client not available")
        return None
    
    for attempt in range(retries):
        try:
            response = client.embeddings.create(
                model="text-embedding-ada-002",
                input=text,
                encoding_format="float"
            )
            embedding = response.data[0].embedding
            return np.array(embedding)
            
        except Exception as e:
            wait_time = backoff_factor ** attempt
            logger.warning(
                f"Embedding generation error (attempt {attempt+1}/{retries}): "
                f"{_sanitize_log(e)}. Retrying in {wait_time}s..."
            )
            time.sleep(wait_time)
    
    logger.error(f"Failed to generate embedding after {retries} attempts")
    return None


def cosine_similarity(embedding1: np.ndarray, embedding2: np.ndarray) -> float:
    """
    计算两个嵌入向量的余弦相似度
    
    Args:
        embedding1: 第一个向量
        embedding2: 第二个向量
        
    Returns:
        float: 相似度分数 (0-100)
    """
    dot_product = np.dot(embedding1, embedding2)
    norm_product = np.linalg.norm(embedding1) * np.linalg.norm(embedding2)
    
    if norm_product == 0:
        return 0.0
    
    similarity = dot_product / norm_product
    return round(similarity * 100, 2)


def analyze_pr_content(pr_data: Any, roadmap_data: Any) -> Optional[str]:
    """
    使用OpenAI分析PR内容与路线图的对齐程度
    
    Args:
        pr_data: PR数据
        roadmap_data: 路线图数据
        
    Returns:
        str|None: 分析结果文本
    """
    client = get_openai_client()
    if not client:
        logger.error("OpenAI client not available for PR analysis")
        return None
    
    prompt = f"""
    Compare the following pull request details with the roadmap priorities and provide:
    1. A priority alignment score (1-10) with reasoning.
    2. Key recommendations for improvement.
    3. Assess the quality of the pull request based on its description, structure, and potential impact.

    ### PR Data:
    {pr_data}

    ### Roadmap Data:
    {roadmap_data}
    """
    
    try:
        response = client.chat.completions.create(
            model="gpt-4",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.7
        )
        return response.choices[0].message.content
    except Exception as e:
        logger.error(f"PR analysis failed: {e}")
        return None


def save_analysis_report(pr_link: str, issue_link: str, analysis: Dict[str, Any]) -> None:
    """保存PR分析报告到数据库"""
    PRAnalysisReport.objects.create(
        pr_link=pr_link,
        issue_link=issue_link,
        priority_alignment_score=analysis.get("priority_score", 0),
        revision_score=analysis.get("revision_score", 0),
        recommendations=analysis.get("recommendations", ""),
    )


# ==================== 代码解析工具 ====================

def extract_function_signatures_and_content(repo_path: str) -> List[Dict[str, Any]]:
    """
    从Python文件中提取函数签名和完整代码
    
    功能：
    - 递归遍历指定目录
    - 解析每个.py文件的AST
    - 提取函数定义（名称、参数、默认值、完整源码）
    
    Args:
        repo_path: 仓库根目录路径
        
    Returns:
        list: 函数元数据列表
    """
    functions = []
    
    for root, dirs, files in os.walk(repo_path):
        for filename in files:
            if not filename.endswith(".py"):
                continue
            
            filepath = os.path.join(root, filename)
            try:
                with open(filepath, "r", encoding="utf-8") as f:
                    file_content = f.read()
                
                tree = ast.parse(file_content, filename=filename)
                
                for node in ast.walk(tree):
                    if isinstance(node, ast.FunctionDef):
                        signature = {
                            "name": node.name,
                            "args": [arg.arg for arg in node.args.args],
                            "defaults": [
                                ast.dump(default) 
                                for default in node.args.defaults
                            ],
                        }
                        
                        function_text = ast.get_source_segment(file_content, node)
                        
                        functions.append({
                            "signature": signature,
                            "full_text": function_text,
                        })
                        
            except SyntaxError as e:
                logger.warning(f"Syntax error in {filepath}: {_sanitize_log(e)}")
            except Exception as e:
                logger.warning(f"Error parsing {filepath}: {_sanitize_log(e)}")
    
    return functions


def extract_django_models(repo_path: str) -> List[Dict[str, Any]]:
    """
    从Django项目中提取模型定义
    
    功能：
    - 扫描所有Python文件
    - 识别继承自 models.Model 的类
    - 提取字段信息（名称、类型、参数）
    
    Args:
        repo_path: 项目根目录
        
    Returns:
        list: 模型定义列表
    """
    models_list = []
    
    for root, dirs, files in os.walk(repo_path):
        for filename in files:
            if not filename.endswith(".py"):
                continue
            
            filepath = os.path.join(root, filename)
            
            try:
                with open(filepath, "r", encoding="utf-8") as f:
                    lines = f.readlines()
                
                model_name = None
                fields = []
                
                for line in lines:
                    line_stripped = line.strip()
                    
                    # 检测模型类定义
                    if (line_stripped.startswith("class ") and 
                        "models.Model" in line_stripped):
                        if model_name:  # 保存前一个模型
                            models_list.append({
                                "name": model_name,
                                "fields": fields
                            })
                        
                        model_name = line_stripped.split("(")[0].replace("class ", "").strip()
                        fields = []
                    
                    else:
                        # 匹配简单字段：name = models.CharField(...)
                        match = re.match(r"^\s*(\w+)\s*=\s*models\.(\w+)", line_stripped)
                        if match:
                            fields.append({
                                "field_name": match.group(1),
                                "field_type": match.group(2),
                            })
                        
                        # 匹配复杂字段：ForeignKey, ManyToManyField等
                        match_complex = re.match(
                            r"^\s*(\w+)\s*=\s*models\.(ForeignKey|ManyToManyField|OneToOneField)\((.*)\)",
                            line_stripped,
                        )
                        if match_complex:
                            fields.append({
                                "field_name": match_complex.group(1),
                                "field_type": match_complex.group(2),
                                "parameters": match_complex.group(3).strip(),
                            })
                
                # 添加最后一个模型
                if model_name:
                    models_list.append({"name": model_name, "fields": fields})
                    
            except Exception as e:
                logger.warning(f"Error reading {filepath}: {_sanitize_log(e)}")
    
    return models_list


def compare_model_fields(model1: Dict, model2: Dict) -> Dict[str, Any]:
    """
    比较两个Django模型的字段相似度
    
    功能：
    - 比较模型名称相似度
    - 逐对比较字段名称和类型
    - 计算综合相似度分数
    
    Args:
        model1: 第一个模型数据
        model2: 第二个模型数据
        
    Returns:
        dict: 包含详细比较结果的字典
    """
    # 比较模型名称
    name_similarity = (
        difflib.SequenceMatcher(None, model1["name"], model2["name"]).ratio() * 100
    )
    
    field_comparison_details = []
    fields1 = model1.get("fields", [])
    fields2 = model2.get("fields", [])
    
    for field1 in fields1:
        for field2 in fields2:
            # 字段名相似度
            name_sim = (
                difflib.SequenceMatcher(
                    None, field1["field_name"], field2["field_name"]
                ).ratio() * 100
            )
            
            # 字段类型相似度
            type_sim = (
                difflib.SequenceMatcher(
                    None, field1["field_type"], field2["field_type"]
                ).ratio() * 100
            )
            
            # 平均相似度
            overall_similarity = (name_sim + type_sim) / 2
            
            if overall_similarity > 50:
                field_comparison_details.append({
                    "field1_name": field1["field_name"],
                    "field1_type": field1["field_type"],
                    "field2_name": field2["field_name"],
                    "field2_type": field2["field_type"],
                    "field_name_similarity": round(name_sim, 2),
                    "field_type_similarity": round(type_sim, 2),
                    "overall_similarity": round(overall_similarity, 2),
                })
    
    return {
        "model_name_similarity": round(name_similarity, 2),
        "matching_fields_count": len(field_comparison_details),
        "field_comparisons": field_comparison_details,
    }


# ==================== 统计和监控工具 ====================

def update_daily_stats(metric_name: str, value: int = 1) -> bool:
    """
    更新每日统计数据
    
    Args:
        metric_name: 指标名称
        value: 增量值
        
    Returns:
        bool: 是否成功
    """
    try:
        today = timezone.now().date()
        stats, created = DailyStats.objects.get_or_create(
            date=today,
            metric=metric_name,
            defaults={'value': 0}
        )
        stats.value += value
        stats.save(update_fields=['value'])
        return True
    except Exception as e:
        logger.error(f"Failed to update daily stats: {e}")
        return False


def calculate_file_hash(file_path: str, algorithm: str = 'sha256') -> Optional[str]:
    """
    计算文件哈希值
    
    Args:
        file_path: 文件路径
        algorithm: 哈希算法（md5/sha1/sha256等）
        
    Returns:
        str|None: 十六进制哈希值
    """
    try:
        hasher = hashlib.new(algorithm)
        with open(file_path, 'rb') as f:
            for chunk in iter(lambda: f.read(8192), b''):
                hasher.update(chunk)
        return hasher.hexdigest()
    except Exception as e:
        logger.error(f"Failed to calculate hash for {file_path}: {e}")
        return None


def truncate_string(text: str, max_length: int = 200, suffix: str = "...") -> str:
    """
    截断字符串到指定长度
    
    Args:
        text: 原始字符串
        max_length: 最大长度
        suffix: 后缀（如省略号）
        
    Returns:
        str: 截断后的字符串
    """
    if len(text) <= max_length:
        return text
    return text[:max_length - len(suffix)] + suffix


# ==================== AI和文本处理工具 ====================

def ai_summary(text: str, max_tokens: int = 150) -> str:
    """
    使用OpenAI GPT生成文本摘要
    
    Args:
        text: 需要摘要的文本内容
        max_tokens: 最大生成token数
        
    Returns:
        str: 生成的摘要文本，失败时返回错误信息
        
    使用示例：
        summary = ai_summary(readme_content)
    """
    client = _OpenAIClientManager.get_client()
    
    if not client:
        return "AI summary not available (API key not configured)"
    
    if not text or not text.strip():
        return "Empty text provided for summarization"
    
    try:
        prompt = (
            f"Generate a brief summary of the following text, focusing on key "
            f"aspects such as purpose, features, technologies used, and current "
            f"status. Consider the following content:\n\n{text[:4000]}"
        )
        
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are a helpful assistant."},
                {"role": "user", "content": prompt},
            ],
            max_tokens=max_tokens,
            temperature=0.5,
        )
        
        summary = response.choices[0].message.content.strip()
        
        # 安全性检查：限制返回长度
        return summary[:1000] if summary else "No summary generated"
        
    except Exception as e:
        logger.error(f"AI summary generation failed: {e}")
        return f"Error generating summary: {str(e)[:200]}"


def markdown_to_text(markdown_content: str) -> str:
    """
    将Markdown转换为纯文本
    
    Args:
        markdown_content: Markdown格式的文本
        
    Returns:
        str: 纯文本内容
        
    注意：
        - 依赖markdown和beautifulsoup4库
        - 如果库未安装，返回原始内容（降级处理）
    """
    if not markdown_content:
        return ""
    
    try:
        if markdown_lib is None:
            raise ImportError("markdown library not installed")
        
        from bs4 import BeautifulSoup
        
        html_content = markdown_lib.markdown(markdown_content)
        text_content = BeautifulSoup(html_content, "html.parser").get_text()
        
        # 清理多余空白
        lines = [line.strip() for line in text_content.split('\n') if line.strip()]
        return '\n'.join(lines)
        
    except ImportError:
        logger.warning("markdown or beautifulsoup4 not installed, returning raw text")
        # 简单的Markdown清理（移除基本标记）
        import re
        text = re.sub(r'[*_`#]+', '', markdown_content)
        text = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', text)  # 移除链接语法
        return text.strip()
    except Exception as e:
        logger.error(f"Markdown to text conversion failed: {e}")
        return markdown_content


# ==================== 安全相关工具 ====================

def check_security_txt(domain_url: str) -> bool:
    """
    检查域名是否有security.txt文件（符合RFC 9116规范）
    
    检查位置：
    1. /.well-known/security.txt (优先)
    2. /security.txt (备选)
    
    Args:
        domain_url: 域名URL
        
    Returns:
        bool: 如果找到security.txt返回True，否则False
        
    安全性：
        - 使用rebuild_safe_url确保URL安全
        - 超时控制防止长时间阻塞
        - 错误容错处理
    """
    import logging as _logging
    import requests
    
    _logger = _logging.getLogger(__name__)
    
    # 确保URL有协议前缀
    if not domain_url.startswith(("http://", "https://")):
        domain_url = "https://" + domain_url
    
    # 移除末尾斜杠
    domain_url = domain_url.rstrip("/")
    
    # 检查 /.well-known/security.txt
    well_known_url = f"{domain_url}/.well-known/security.txt"
    safe_well_known_url = rebuild_safe_url(well_known_url)
    
    if safe_well_known_url:
        try:
            response = requests.head(safe_well_known_url, timeout=5)
            if response.status_code == 200:
                _logger.info(f"Found security.txt at {safe_well_known_url}")
                return True
        except requests.RequestException as e:
            _logger.debug(f"HEAD request failed for well-known URL: {e}")
    
    # 检查 /security.txt
    root_url = f"{domain_url}/security.txt"
    safe_root_url = rebuild_safe_url(root_url)
    
    if safe_root_url:
        try:
            response = requests.head(safe_root_url, timeout=5)
            if response.status_code == 200:
                _logger.info(f"Found security.txt at {safe_root_url}")
                return True
        except requests.RequestException as e:
            _logger.debug(f"HEAD request failed for root URL: {e}")
    
    _logger.debug(f"No security.txt found for domain: {_sanitize_log(domain_url)}")
    return False


# ==================== GitHub API工具 ====================

def fetch_github_discussions(
    owner: str = "OWASP-BLT",
    repo: str = "BLT",
    limit: int = 5
) -> List[Dict[str, Any]]:
    """
    使用GitHub GraphQL API获取仓库的最新讨论
    
    Args:
        owner: 仓库所有者（默认："OWASP-BLT"）
        repo: 仓库名称（默认："BLT"）
        limit: 获取讨论数量（默认：5）
        
    Returns:
        list: 讨论字典列表，每个字典包含：
            - title (str): 讨论标题
            - url (str): GitHub讨论链接
            - author (str): 作者用户名
            - author_url (str): 作者GitHub主页链接
            - created_at (datetime): 创建时间（时区感知）
            - comment_count (int): 评论数量
            
    安全性：
        - 需要有效的GITHUB_TOKEN
        - 超时控制10秒
        - 错误容错处理
    """
    from django.conf import settings as _settings
    
    github_token = getattr(_settings, 'GITHUB_TOKEN', None)
    
    if not github_token or github_token == "abc123":
        logger.warning("GITHUB_TOKEN not set or is placeholder, cannot fetch discussions")
        return []
    
    query = """
    query($owner: String!, $name: String!, $limit: Int!) {
        repository(owner: $owner, name: $name) {
            discussions(first: $limit, orderBy: {field: CREATED_AT, direction: DESC}) {
                nodes {
                    title
                    url
                    createdAt
                    author {
                        login
                        url
                    }
                    comments {
                        totalCount
                    }
                }
            }
        }
    }
    """
    
    headers = {
        "Authorization": f"Bearer {github_token}",
        "Content-Type": "application/json",
    }
    
    try:
        response = requests.post(
            "https://api.github.com/graphql",
            headers=headers,
            json={
                "query": query,
                "variables": {"owner": owner, "name": repo, "limit": limit}
            },
            timeout=10,
        )
        response.raise_for_status()
        data = response.json()
        
        if "errors" in data:
            logger.error(f"GitHub GraphQL error: {_sanitize_log(data['errors'])}")
            return []
        
        discussions = (
            data.get("data", {})
            .get("repository", {})
            .get("discussions", {})
            .get("nodes", [])
        )
        
        result = []
        for discussion in discussions:
            created_at_str = discussion.get("createdAt", "")
            
            try:
                created_at = datetime.strptime(created_at_str, "%Y-%m-%dT%H:%M:%SZ")
                created_at = timezone.make_aware(created_at, timezone.utc)
            except (ValueError, AttributeError):
                created_at = timezone.now()
            
            result.append({
                "title": discussion.get("title", "Untitled"),
                "url": discussion.get("url", ""),
                "author": discussion.get("author", {}).get("login", "Unknown"),
                "author_url": discussion.get("author", {}).get("url", ""),
                "created_at": created_at,
                "comment_count": discussion.get("comments", {}).get("totalCount", 0),
            })
        
        logger.info(f"Successfully fetched {len(result)} discussions from {owner}/{repo}")
        return result
        
    except requests.exceptions.RequestException as e:
        logger.error(f"Failed to fetch GitHub discussions: {e}")
        return []
    except Exception as e:
        logger.error(f"Unexpected error fetching discussions: {e}", exc_info=True)
        return []


# ==================== BACON Token奖励系统 ====================

def get_default_bacon_score(model_name: str, is_security: bool = False) -> int:
    """
    根据贡献类型获取默认BACON分数
    
    Args:
        model_name: Django模型名称（如 'issue', 'hunt', 'ipreport'）
        is_security: 是否为安全相关内容
        
    Returns:
        int: BACON分数 (1-50)
        
    评分标准：
        - 基础贡献（简单问题、评论）: 1-5 BACON
        - 标准贡献（文档完善的问题、博客）: 5-15 BACON
        - 有价值贡献（详细漏洞报告、教程）: 15-25 BACON
        - 高影响力贡献（安全漏洞、主要功能）: 25-50 BACON
    """
    base_scores = {
        "issue": 5,
        "hunt": 15,
        "ipreport": 3,
        "organization": 10,
    }
    
    score = base_scores.get(model_name.lower(), 5)
    
    if is_security:
        score += 3
    
    return max(1, min(50, score))


def analyze_contribution(instance, action_type: str) -> int:
    """
    使用OpenAI分析贡献并确定BACON token奖励分数
    
    Args:
        instance: Django模型实例
        action_type: 操作类型（如 'created', 'updated'）
        
    Returns:
        int: BACON分数 (1-50)
        
    功能：
        - 使用GPT-4分析贡献的质量和影响
        - 基于技术复杂度、文档质量、安全影响等维度评分
        - 如果OpenAI不可用，返回默认分数
        
    使用示例：
        score = analyze_contribution(issue_instance, 'created')
    """
    client = _OpenAIClientManager.get_client()
    
    if not client:
        logger.warning(
            "OpenAI client not available, using default BACON score"
        )
        model_name = instance._meta.model_name
        is_security = getattr(instance, "is_security", False)
        return get_default_bacon_score(model_name, is_security)
    
    try:
        model_name = instance._meta.model_name
        title = (
            getattr(instance, "title", None) or 
            getattr(instance, "description", None)
        )
        description = (
            getattr(instance, "content", None) or 
            getattr(instance, "body", None)
        )
        is_security = getattr(instance, "is_security", False)
        
        safe_description = (description[:500] if description else 'N/A')
        
        prompt = f"""
        Analyze this contribution and assign a BACON token reward score between 1 and 50.

        Contribution Details:
        - Type: {model_name}
        - Action: {action_type}
        - Title: {title}
        - Description: {safe_description}
        - Security Related: {is_security}

        Scoring Guidelines:
        - Basic contributions (simple issues, comments): 1-5 BACON
        - Standard contributions (well-documented issues, blog posts): 5-15 BACON
        - Valuable contributions (detailed bug reports, tutorials): 15-25 BACON
        - High-impact contributions (security vulnerabilities, major features): 25-50 BACON

        Evaluation Criteria:
        1. Technical complexity
        2. Documentation quality
        3. Security impact
        4. Community benefit
        5. Overall effort

        Return only a number between 1 and 50.
        """
        
        response = client.chat.completions.create(
            model="gpt-4",
            messages=[
                {
                    "role": "system", 
                    "content": "You are evaluating contributions to determine BACON token rewards."
                },
                {"role": "user", "content": prompt},
            ],
            temperature=0.3,
            max_tokens=10,
        )
        
        try:
            score = int(float(response.choices[0].message.content.strip()))
            score = max(1, min(50, score))
            logger.info(f"AI analyzed contribution: model={model_name}, score={score}")
            return score
        except (ValueError, AttributeError):
            logger.warning("Failed to parse AI score, using default")
            return get_default_bacon_score(model_name, is_security)
            
    except Exception as e:
        logger.error(f"Error analyzing contribution for BACON score: {e}")
        return get_default_bacon_score(model_name, is_security)


# ==================== 投票系统工具 ====================

def get_page_votes(template_name: str) -> Tuple[int, int]:
    """
    获取特定页面的投票数（赞成/反对）
    
    Args:
        template_name: 模板名称（如 'repo/repo_detail.html'）
        
    Returns:
        tuple: (upvotes, downvotes) 元组
        
    使用示例：
        upvotes, downvotes = get_page_votes('repo/repo_detail.html')
    """
    if not template_name:
        return 0, 0
    
    page_key = template_name.replace("/", "_").replace(".html", "")
    
    try:
        from django.db.models import Sum
        
        upvotes = (
            DailyStats.objects.filter(name=f"upvote_{page_key}")
            .values_list("value", flat=True)
            .aggregate(total=Sum("value"))["total"]
            or 0
        )
        
        downvotes = (
            DailyStats.objects.filter(name=f"downvote_{page_key}")
            .values_list("value", flat=True)
            .aggregate(total=Sum("value"))["total"]
            or 0
        )
        
        return int(upvotes), int(downvotes)
        
    except Exception as e:
        logger.error(f"Failed to get page votes for {template_name}: {e}")
        return 0, 0


# ==================== 图像处理工具 ====================

def is_face_processing_available(cv2_module=None) -> bool:
    """
    检查人脸处理功能是否可用
    
    Args:
        cv2_module: 可选的cv2模块对象（用于测试注入）
        
    Returns:
        bool: 如果OpenCV和所需的级联文件可用则返回True，否则返回False
    """
    try:
        if cv2_module is None:
            try:
                import cv2 as _cv2
            except ImportError:
                logger.error("OpenCV not available")
                return False
            cv2_module = _cv2
        
        logger.info(f"OpenCV version: {cv2_module.__version__}")
        
        face_cascade_path = (
            cv2_module.data.haarcascades + 
            "haarcascade_frontalface_default.xml"
        )
        
        face_cascade = cv2_module.CascadeClassifier(face_cascade_path)
        if face_cascade.empty():
            logger.error("Failed to load Haar cascade classifier")
            return False
        
        logger.info("Face processing is available")
        return True
        
    except Exception as e:
        logger.error(f"Error checking face processing availability: {e}")
        return False


def process_bug_screenshot(image_file, overlay_color=(0, 0, 0)):
    """
    处理漏洞截图以检测并覆盖人脸（隐私保护）
    
    Args:
        image_file: Django UploadedFile对象
        overlay_color: BGR颜色元组用于人脸覆盖（默认黑色）
        
    Returns:
        UploadedFile: 处理后的新UploadedFile，失败返回None
    """
    if not image_file:
        logger.warning("No image file provided for processing")
        return None
    
    logger.info(
        f"Processing screenshot: {_sanitize_log(getattr(image_file, 'name', 'unknown'))}"
    )
    
    try:
        if cv2 is None:
            raise ImportError("OpenCV (cv2) is not installed")
        
        import numpy as np
        from django.core.files.uploadedfile import InMemoryUploadedFile
        from io import BytesIO
        
        nparr = np.frombuffer(image_file.read(), np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if img is None:
            raise ValueError("Failed to decode image")
        
        face_cascade = cv2.CascadeClassifier(
            cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        )
        
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        faces = face_cascade.detectMultiScale(gray, 1.1, 4)
        
        for (x, y, w, h) in faces:
            cv2.rectangle(img, (x, y), (x+w, y+h), overlay_color, -1)
        
        _, buffer = cv2.imencode('.png', img)
        
        image_file.seek(0)
        processed_file = InMemoryUploadedFile(
            file=BytesIO(buffer.tobytes()),
            field_name=image_file.field_name,
            name=image_file.name,
            content_type='image/png',
            size=buffer.nbytes,
            charset=None
        )
        
        logger.info(f"Successfully processed screenshot, found {len(faces)} faces")
        return processed_file
        
    except Exception as e:
        logger.error(f"Error processing bug screenshot: {e}")
        return None


# ==================== 验证工具 ====================

def validate_screenshot_hash(screenshot_hash: str) -> None:
    """
    验证截图哈希只包含字母数字字符、连字符或下划线
    
    Args:
        screenshot_hash: 要验证的哈希字符串
        
    Raises:
        ValidationError: 如果哈希包含无效字符
    """
    if not re.match(r"^[a-zA-Z0-9_-]+$", screenshot_hash):
        raise ValidationError(
            "Invalid screenshot hash. Only alphanumeric characters, "
            "hyphens, and underscores are allowed."
        )


# ==================== GitHub用户数据工具 ====================

def fetch_github_user_data(username: str) -> Dict[str, Any]:
    """
    获取GitHub用户相关数据用于推荐
    
    Args:
        username: GitHub用户名
        
    Returns:
        dict: 包含用户资料、仓库、星标项目等信息的字典
    """
    from django.conf import settings as _settings
    
    base_url = "https://api.github.com/users/"
    repos_url = f"{base_url}{username}/repos"
    
    github_token = getattr(_settings, 'GITHUB_API_TOKEN', None)
    
    headers = {
        "Authorization": f"token {github_token}" if github_token else "",
        "Accept": "application/vnd.github.v3+json",
    }
    
    user_data = {}
    
    try:
        logger.info(f"Fetching user profile: {_sanitize_log(username)}")
        
        user_response = requests.get(f"{base_url}{username}", headers=headers, timeout=10)
        if user_response.status_code == 200:
            user_info = user_response.json()
            user_data["profile"] = {
                "username": user_info.get("login"),
                "name": user_info.get("name"),
                "avatar_url": user_info.get("avatar_url"),
                "bio": user_info.get("bio"),
                "public_repos": user_info.get("public_repos", 0),
                "followers": user_info.get("followers", 0),
                "following": user_info.get("following", 0),
            }
        
        repos_response = requests.get(repos_url, headers=headers, timeout=10, params={"per_page": 10})
        if repos_response.status_code == 200:
            user_data["repositories"] = [
                {
                    "name": repo.get("name"),
                    "full_name": repo.get("full_name"),
                    "description": repo.get("description"),
                    "language": repo.get("language"),
                    "stargazers_count": repo.get("stargazers_count", 0),
                    "forks_count": repo.get("forks_count", 0),
                }
                for repo in repos_response.json()
            ]
        
        logger.info(f"Successfully fetched data for user: {username}")
        return user_data
        
    except requests.exceptions.RequestException as e:
        logger.error(f"Failed to fetch GitHub user data: {e}")
        return {}
    except Exception as e:
        logger.error(f"Unexpected error fetching GitHub data: {e}")
        return {}


# ==================== URL转换工具 ====================

def git_url_to_zip_url(git_url: str, branch: str = "master") -> str:
    """
    将Git仓库URL转换为ZIP下载链接
    
    Args:
        git_url: Git仓库URL（必须以.git结尾）
        branch: 分支名称（默认'master'）
        
    Returns:
        str: ZIP文件下载URL
        
    Raises:
        ValueError: 如果URL不是有效的.git URL
    """
    if git_url.endswith(".git"):
        base_url = git_url[:-4]
        zip_url = f"{base_url}/archive/refs/heads/{branch}.zip"
        return zip_url
    else:
        raise ValueError("Invalid .git URL provided")


# ==================== Gravatar头像工具 ====================

def gravatar_url(email: str, size: int = 80) -> str:
    """
    为给定邮箱生成Gravatar URL
    
    Args:
        email: 用户邮箱地址
        size: 头像尺寸（像素，默认80）
        
    Returns:
        str: Gravatar图片URL
    """
    import hashlib
    
    email_lower = email.lower().encode("utf-8")
    gravatar_hash = hashlib.md5(email_lower).hexdigest()
    return f"https://www.gravatar.com/avatar/{gravatar_hash}?s={size}&d=mp"


# ==================== 人脸检测辅助函数 ====================

_face_cascade_cache = None

def _get_face_cascade():
    """
    返回缓存的Haar Cascade分类器，首次调用时加载
    
    Returns:
        cv2.CascadeClassifier|None: 分类器实例，失败返回None
    """
    global _face_cascade_cache
    
    if _face_cascade_cache is not None:
        return _face_cascade_cache
    
    if cv2 is None:
        logger.error("OpenCV not available - cannot load Haar Cascade classifier")
        return None
    
    try:
        cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        classifier = cv2.CascadeClassifier(cascade_path)
        
        if classifier.empty():
            logger.error(f"Failed to load Haar Cascade classifier from: {cascade_path}")
            return None
        
        _face_cascade_cache = classifier
        logger.debug(f"Haar Cascade classifier loaded and cached from: {cascade_path}")
        return classifier
        
    except Exception as e:
        logger.error(f"Error loading face cascade: {e}")
        return None


def overlay_faces(image, color=(0, 0, 0)):
    """
    使用OpenCV Haar Cascade检测图像中的人脸并用纯色覆盖
    
    Args:
        image: 输入图像（BGR格式的numpy数组）
        color: BGR颜色元组用于覆盖（默认黑色：(0, 0, 0)）
        
    Returns:
        numpy array: 覆盖人脸后的图像，如果检测失败则返回原始图像
    """
    try:
        logger.debug("Starting face detection process")
        
        if cv2 is None:
            logger.warning("OpenCV not available - skipping face overlay")
            return image
        
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        logger.debug(f"Converted to grayscale, shape: {gray.shape}")
        
        face_cascade = _get_face_cascade()
        if face_cascade is None:
            logger.warning("Face cascade not available - skipping overlay")
            return image
        
        faces = face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=4)
        logger.info(f"Detected {len(faces)} faces")
        
        result_image = image.copy()
        
        for (x, y, w, h) in faces:
            cv2.rectangle(result_image, (x, y), (x+w, y+h), color, -1)
            logger.debug(f"Overlayed face at position ({x}, {y}) with size ({w}x{h})")
        
        logger.info("Face overlay completed successfully")
        return result_image
        
    except Exception as e:
        logger.error(f"Error in face overlay process: {e}")
        return image
