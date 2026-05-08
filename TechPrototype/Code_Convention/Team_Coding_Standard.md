# SecGuard 漏洞管理平台 - 团队编码规范

## 1. 概述

本规范旨在统一团队代码风格，提高代码质量和可维护性。所有团队成员必须严格遵守此规范。

## 2. 命名规范

### 2.1 通用规则
- **类名**：大驼峰（PascalCase），如 `UserService`
- **方法/函数名**：小驼峰（camelCase），如 `getUserById`
- **变量名**：小驼峰，如 `userName`
- **常量名**：全大写+下划线，如 `MAX_RETRY_COUNT`
- **文件名**：小写+下划线，如 `user_service.py`
- **目录名**：小写+下划线，如 `api_v1`

### 2.2 特殊命名
- **测试文件**：以 `_test.py` 结尾，如 `user_service_test.py`
- **配置文件**：以 `config` 开头，如 `config_dev.py`
- **迁移文件**：遵循 Django 迁移命名规范

## 3. 格式规范

### 3.1 缩进
- 使用 **4个空格**，禁用 Tab 键
- 在 VS Code 中设置：`"editor.insertSpaces": true, "editor.tabSize": 4`

### 3.2 行宽
- 单行代码不超过 **120 字符**
- 过长的表达式应适当换行

### 3.3 空行
- 函数/类之间空 **2行**
- 方法之间空 **1行**
- 逻辑块之间空 **1行**

### 3.4 括号
- 条件表达式使用括号明确优先级
- 函数参数过长时，每个参数独占一行

## 4. 注释规范

### 4.1 文件头部
```python
"""
模块功能描述

Author: 作者名
Date: 2026-04-20
Version: 1.0
"""
```

### 4.2 类注释
```python
class UserService:
    """
    用户服务类
    
    提供用户注册、登录、权限管理等功能
    """
```

### 4.3 方法注释
```python
def register(self, username: str, email: str, password: str) -> User:
    """
    用户注册
    
    Args:
        username: 用户名
        email: 邮箱地址
        password: 明文密码
        
    Returns:
        User: 创建成功的用户对象
        
    Raises:
        ValidationError: 用户名或邮箱已存在
    """
```

### 4.4 代码注释
- 复杂逻辑必须添加注释
- 注释应解释 **为什么** 而非 **是什么**
- 避免无意义注释

## 5. Python 特定规范

### 5.1 导入顺序
1. 标准库导入（如 `os`, `sys`）
2. 第三方库导入（如 `django`, `requests`）
3. 项目内部导入
4. 相对导入

```python
import os
import json

from django.db import models
from ninja import Router

from .services import UserService
from ..utils import encrypt_password
```

### 5.2 类型提示
- 所有函数必须添加类型提示
- 使用 `Optional`, `List`, `Dict` 等类型

```python
def get_users(role: Optional[str] = None) -> List[User]:
    """获取用户列表"""
```

### 5.3 异常处理
- 使用统一的异常类
- 避免空 `except` 块
- 记录异常日志

```python
try:
    user = User.objects.get(id=user_id)
except User.DoesNotExist:
    logger.error(f"User {user_id} not found")
    raise ObjectNotFoundError("用户不存在")
```

## 6. Django 特定规范

### 6.1 模型设计
- 主键使用 UUIDField
- 使用 verbose_name 提供中文说明
- 字段命名使用小写+下划线

```python
class User(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    username = models.CharField(max_length=50, unique=True, verbose_name="用户名")
    email = models.EmailField(unique=True, verbose_name="邮箱")
```

### 6.2 API 设计
- 使用 Django Ninja 框架
- 统一响应格式
- 添加权限装饰器

```python
@router.post("/login", auth=JWTAuth())
def login(request, data: LoginRequest):
    """用户登录"""
    pass
```

## 7. 前端规范（React）

### 7.1 组件命名
- 组件名使用大驼峰
- 文件名为组件名+`.tsx`

### 7.2 Hooks 使用
- 自定义 Hooks 以 `use` 开头
- 避免在循环中使用 Hooks

### 7.3 状态管理
- 使用 React Context 或 Zustand
- 状态命名清晰

## 8. 安全规范

### 8.1 密码处理
- 使用 BCrypt 加密（10轮）
- 禁止明文存储密码

### 8.2 SQL 注入防护
- 使用 ORM 查询
- 禁止拼接 SQL

### 8.3 XSS 防护
- 使用 React 自动转义
- 对用户输入进行过滤

### 8.4 权限控制
- 每个 API 都需要权限校验
- 使用 JWT Token 认证

## 9. 日志规范

### 9.1 日志级别
- **DEBUG**：详细调试信息（开发环境）
- **INFO**：业务流程记录（生产环境）
- **WARNING**：警告信息（需要关注）
- **ERROR**：错误信息（需要修复）
- **CRITICAL**：严重错误（服务不可用）

### 9.2 日志格式
```python
logger.info(f"User {user_id} logged in from {ip_address}")
logger.error(f"Failed to send email to {email}", exc_info=True)
```

## 10. Git 规范

### 10.1 分支命名
- `feature/xxx`：新功能开发
- `bugfix/xxx`：修复 Bug
- `hotfix/xxx`：紧急修复
- `release/xxx`：发布版本

### 10.2 提交信息
- 使用英文动词开头
- 简洁明了（不超过 50 字符）
- 描述具体变更

```
feat: 添加用户注册功能
fix: 修复登录页面样式问题
docs: 更新 API 文档
```

## 11. 测试规范

### 11.1 测试覆盖
- 单元测试覆盖率 ≥ 80%
- 核心功能必须有集成测试

### 11.2 测试命名
- 测试方法以 `test_` 开头
- 描述清晰

```python
def test_user_register_success(self):
    """测试用户注册成功"""
    pass
```

## 12. 代码审查

### 12.1 PR 要求
- 必须有至少 1 人审查
- 通过所有测试
- 符合编码规范

### 12.2 审查要点
- 安全性
- 性能
- 可维护性
- 代码风格

## 附录

### A. 工具配置
- **IDE**：VS Code
- **格式化工具**：Black
- **代码检查**：flake8, pylint
- **类型检查**：mypy

### B. 参考文档
- [PEP 8 -- Style Guide for Python Code](https://www.python.org/dev/peps/pep-0008/)
- [Django Coding Style](https://docs.djangoproject.com/en/dev/internals/contributing/writing-code/coding-style/)
- [React Style Guide](https://react.dev/learn/style-guide)

---

**版本**：v1.0  
**生效日期**：2026年4月20日  
**制定团队**：suibianba 团队