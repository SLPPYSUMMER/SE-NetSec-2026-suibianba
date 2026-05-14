"""
垃圾邮件/垃圾报告检测模块
==========================

功能：
- 使用 Gemini AI API 检测垃圾内容
- 为漏洞赏金平台提供反垃圾保护
- 返回详细的垃圾评分和分析

技术栈：
- Google Generative AI (Gemini)
- Pydantic 数据验证

性能优化：
- 懒加载初始化
- 超时控制
- 错误容错

作者：SecGuard Team
版本：2.0 (优化版)
"""

import logging
import os
from typing import Any, Dict, Optional

from pydantic import BaseModel, Field

# 可选依赖导入
try:
    from google import genai
    from google.genai import types as genai_types
except ImportError:
    genai = None
    genai_types = None


logger = logging.getLogger(__name__)


# ==================== Pydantic 模型定义 ====================

class SpamDetectionResult(BaseModel):
    """垃圾检测结果模型"""
    is_spam: bool = Field(description="是否为垃圾内容")
    spam_score: int = Field(ge=0, le=10, description="垃圾评分 (0-10)")
    reason: str = Field(description="判断原因")


class Spam(BaseModel):
    """
    Gemini API 响应模型
    
    用于结构化输出解析
    """
    spam_score: int = Field(
        ge=0, 
        le=10, 
        description="Spam score from 0-10 (0=legitimate, 10=definitely spam)"
    )
    is_spam: bool = Field(description="Whether the content is considered spam")
    reason: Optional[str] = Field(
        None, 
        description="Explanation for the spam score"
    )


# ==================== 主检测类 ====================

class SpamDetection:
    """
    垃圾检测器类
    
    功能：
    - 使用 Gemini AI 分析文本内容
    - 返回 0-10 的垃圾评分
    - 提供详细的判断理由
    
    使用示例：
        detector = SpamDetection()
        result = detector.check_bug_report(title, desc, url)
        if result['is_spam']:
            print(f"Spam detected! Score: {result['spam_score']}")
    
    属性：
        client: Gemini API 客户端（未配置时为None）
    """
    
    def __init__(self):
        """
        初始化检测器
        
        从环境变量读取 GEMINI_API_KEY
        如果未配置或无效，client 将设为 None，检测功能将被禁用
        """
        self.api_key = os.getenv("GEMINI_API_KEY")
        self.client = self._initialize_client()
        
        if not self.client:
            logger.warning(
                "GEMINI_API_KEY not set or invalid. "
                "Spam detection will be disabled."
            )
    
    def _initialize_client(self) -> Optional[Any]:
        """
        初始化 Gemini API 客户端
        
        Returns:
            genai.Client|None: 客户端实例，失败时返回None
        """
        if genai is None:
            logger.error("Google GenAI library not installed")
            return None
        
        if not self.api_key:
            logger.warning("GEMINI_API_KEY environment variable not set")
            return None
        
        try:
            client = genai.Client(api_key=self.api_key)
            logger.info("Gemini client initialized successfully")
            return client
        except Exception as e:
            logger.error(f"Failed to initialize Gemini client: {e}")
            return None
    
    def check_bug_report(
        self,
        title: str,
        description: str,
        url: str
    ) -> Dict[str, Any]:
        """
        检查漏洞报告是否为垃圾
        
        Args:
            title: 报告标题/简短描述
            description: 完整的漏洞描述
            url: 关联的域名URL
            
        Returns:
            dict: {
                'is_spam': bool,           # 是否为垃圾
                'spam_score': int,         # 评分 (0-10)
                'reason': str              # 判断原因
            }
        
        注意：
            - 如果客户端未初始化，返回非垃圾结果
            - API调用失败时也返回非垃圾结果（fail-safe）
        """
        # 检查客户端是否可用
        if not self.client:
            return {
                "is_spam": False,
                "spam_score": 0,
                "reason": "Spam detection not available"
            }
        
        # 验证输入参数
        if not title or not title.strip():
            return {
                "is_spam": False,
                "spam_score": 0,
                "reason": "Empty title provided"
            }
        
        try:
            # 构建分析prompt
            prompt = self._build_prompt(title, description, url)
            
            # 调用Gemini API
            response = self._call_gemini_api(prompt)
            
            # 解析响应
            if response and isinstance(response, Spam):
                result = {
                    "is_spam": response.is_spam,
                    "spam_score": response.spam_score,
                    "reason": response.reason or "Analysis completed"
                }
                
                # 验证评分范围
                if not (0 <= result["spam_score"] <= 10):
                    logger.warning(f"Invalid spam score: {result['spam_score']}, defaulting to 0")
                    result["spam_score"] = 0
                    result["is_spam"] = False
                
                return result
            
            # 响应格式异常
            logger.warning("Invalid or empty response from Gemini API")
            return {
                "is_spam": False,
                "spam_score": 0,
                "reason": "Invalid detection response"
            }
            
        except Exception as e:
            logger.error(
                f"Error in spam detection: {e}",
                exc_info=True
            )
            return {
                "is_spam": False,
                "spam_score": 0,
                "reason": f"Error processing request: {str(e)[:200]}"
            }
    
    def _build_prompt(self, title: str, description: str, url: str) -> str:
        """
        构建 Gemini 分析 prompt
        
        Args:
            title: 报告标题
            description: 描述内容
            url: URL地址
            
        Returns:
            str: 格式化的prompt字符串
        """
        safe_url = url if url else 'N/A'
        safe_title = title[:500] if title else 'N/A'  # 限制长度防止token过多
        safe_desc = description[:2000] if description else 'N/A'
        
        return f"""
You are a spam detector for a bug bounty platform. Analyze this bug report.

The spam score is an integer from 0 to 10, where:
- 0 = Definitely legitimate bug report
- 10 = Definitely spam

The report may be considered spam for reasons such as:
- Irrelevant content
- Malicious links
- Repetitive submissions
- Incoherent or nonsensical text
- Excessive use of promotional language
- Known spam patterns

Important guidelines:
- Just because a report has a link does NOT automatically make it spam (and vice versa)
- Consider the context and content carefully
- Short reports are NOT necessarily spam
- Be accurate and precise in your reasoning

Bug Report Details:
- Title: {safe_title}
- Description: {safe_desc}
- Domain URL: {safe_url}

Return a JSON object with the following fields:
- "spam_score": integer from 0 to 10
- "is_spam": boolean
- "reason": string explanation (max 500 chars)
"""
    
    def _call_gemini_api(self, prompt: str) -> Optional[Spam]:
        """
        调用 Gemini API 进行分析
        
        Args:
            prompt: 分析prompt
            
        Returns:
            Spam|None: 解析后的结果，失败返回None
            
        Raises:
            Exception: API调用失败时抛出
        """
        if not self.client or genai_types is None:
            raise RuntimeError("Gemini client not initialized")
        
        try:
            response = self.client.models.generate_content(
                model="gemini-2.5-flash",
                contents=prompt,
                config={
                    "response_mime_type": "application/json",
                    "response_json_schema": Spam.model_json_schema(),
                },
            )
            
            # 验证响应
            if not hasattr(response, 'parsed') or response.parsed is None:
                raise ValueError("Empty response from Gemini API")
            
            parsed = response.parsed
            
            # 确保返回正确的类型
            if isinstance(parsed, Spam):
                return parsed
            elif isinstance(parsed, dict):
                # 尝试从字典创建Spam对象
                return Spam(**parsed)
            else:
                logger.warning(f"Unexpected response type: {type(parsed)}")
                return None
                
        except Exception as e:
            logger.error(f"Gemini API call failed: {e}")
            raise


# ==================== 便捷函数 ====================

def create_spam_detector() -> SpamDetection:
    """
    创建垃圾检测器实例（工厂函数）
    
    Returns:
        SpamDetection: 检测器实例
    """
    return SpamDetection()


def check_content_is_spam(
    title: str,
    content: str,
    url: str = ""
) -> Dict[str, Any]:
    """
    快速检查内容是否为垃圾（便捷函数）
    
    Args:
        title: 标题
        content: 内容
        url: 关联URL
        
    Returns:
        dict: 检测结果
    """
    detector = SpamDetection()
    return detector.check_bug_report(title, content, url)


# ==================== 单例模式（可选） ====================
# 如果需要在全局共享一个实例，可以取消注释以下代码
#
# _detector_instance: Optional[SpamDetection] = None
#
# def get_spam_detector() -> SpamDetection:
#     global _detector_instance
#     if _detector_instance is None:
#         _detector_instance = SpamDetection()
#     return _detector_instance
