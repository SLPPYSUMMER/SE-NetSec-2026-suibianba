# SecGuard 团队编码规范

## 目录

1. [概述](#1-概述)
2. [Python/Django 编码规范](#2-pythondjango-编码规范)
   - 2.1 命名规则
   - 2.2 代码格式
   - 2.3 注释规范
   - 2.4 类与方法规范
   - 2.5 数据库操作规范
3. [JavaScript/React 编码规范](#3-javascriptreact-编码规范)
   - 3.1 命名规则
   - 3.2 代码格式
   - 3.3 组件开发规范
   - 3.4 Hooks 使用规范
4. [通用规范](#4-通用规范)
   - 4.1 错误处理
   - 4.2 日志规范
   - 4.3 安全规范
   - 4.4 Git 提交规范
5. [附录](#5-附录)

---

## 1. 概述

本编码规范旨在：
- 提高代码可读性和可维护性
- 确保团队代码风格一致
- 增强代码安全性
- 促进团队协作效率

所有团队成员必须严格遵守本规范。

---

## 2. Python/Django 编码规范

### 2.1 命名规则

| 类型 | 命名方式 | 示例 |
|------|----------|------|
| 类名 | 大驼峰式（PascalCase） | `ReportService`, `UserManager` |
| 函数/方法名 | 小驼峰式（camelCase） | `create_report`, `get_user_info` |
| 变量名 | 下划线分隔（snake_case） | `user_id`, `max_file_size` |
| 常量名 | 全大写+下划线分隔 | `MAX_RETRY`, `SECRET_KEY` |
| 模块/文件名 | 下划线分隔（snake_case） | `report_service.py`, `auth_utils.py` |
| 数据库表名 | 下划线分隔，全小写，复数形式 | `users`, `vulnerability_reports` |
| 模型类名 | 大驼峰式，单数形式 | `User`, `Report` |

### 2.2 代码格式

- **缩进**：使用4个空格
- **行宽**：每行不超过120字符
- **空行**：
  - 函数/类定义前后各空2行
  - 函数内逻辑块之间空1行
- **空格**：
  - 二元运算符前后加空格（`a + b`，非 `a+b`）
  - 逗号后加空格
  - 冒号后加空格（字典、函数参数默认值）

### 2.3 注释规范

**模块注释**：文件开头，包含文件说明、作者、版本

```python
"""
漏洞报告服务模块
负责漏洞报告的创建、查询、更新等业务逻辑

Author: 林源龙
Version: 1.0
"""
```

**类注释**：类定义前，说明类的职责

```python
class ReportService:
    """
    漏洞报告服务类
    提供漏洞报告相关的业务操作
    """
```

**方法注释**：方法定义前，包含功能说明、参数、返回值

```python
def create_report(self, data: dict) -> Report:
    """
    创建漏洞报告
    
    Args:
        data: 报告数据字典，包含title, description, severity等字段
        
    Returns:
        Report: 创建成功的漏洞报告对象
        
    Raises:
        ValidationError: 数据验证失败时抛出
        PermissionError: 权限不足时抛出
    """
```

**行内注释**：复杂逻辑处添加注释，解释"为什么"而非"做什么"

### 2.4 类与方法规范

**类设计原则**：
- 单一职责：每个类只负责一个功能领域
- 依赖注入：通过构造函数注入依赖
- 接口隔离：定义清晰的公共方法

**方法设计原则**：
- 方法长度不超过50行
- 每个方法只做一件事
- 参数不超过5个

### 2.5 数据库操作规范

**使用 ORM**：
- 优先使用 Django ORM，避免直接写 SQL
- 查询使用 `filter()`、`exclude()` 等方法
- 批量操作使用 `bulk_create()`、`bulk_update()`

**查询优化**：
- 使用 `select_related()` 和 `prefetch_related()` 避免 N+1 查询
- 添加适当的索引
- 复杂查询考虑使用 `annotate()` 和 `aggregate()`

---

## 3. JavaScript/React 编码规范

### 3.1 命名规则

| 类型 | 命名方式 | 示例 |
|------|----------|------|
| 组件名 | 大驼峰式 | `ReportForm`, `VulnerabilityList` |
| 函数/方法名 | 小驼峰式 | `handleSubmit`, `fetchReports` |
| 变量名 | 小驼峰式 | `isLoading`, `reportData` |
| 常量名 | 全大写+下划线 | `API_BASE_URL`, `MAX_RETRY` |
| 文件命名 | 组件用大驼峰，工具函数用小驼峰 | `ReportForm.jsx`, `apiUtils.js` |

### 3.2 代码格式

- **缩进**：使用2个空格
- **行宽**：每行不超过120字符
- **空行**：组件逻辑块之间空1行
- **括号**：
  - if/for/while 语句的条件表达式前后加空格
  - 箭头函数参数超过1个时加括号

### 3.3 组件开发规范

**组件结构**：
```jsx
// 1. 导入语句（按字母序排列）
import React, { useState, useEffect } from 'react';
import { Button, Input } from 'antd';

// 2. 组件定义
const ReportForm = ({ onSubmit }) => {
    // 3. 状态定义
    const [formData, setFormData] = useState({ title: '', description: '' });
    const [isLoading, setIsLoading] = useState(false);
    
    // 4. 副作用
    useEffect(() => {
        // 初始化逻辑
    }, []);
    
    // 5. 事件处理
    const handleSubmit = async (e) => {
        e.preventDefault();
        // 提交逻辑
    };
    
    // 6. 渲染
    return (
        <form onSubmit={handleSubmit}>
            {/* 表单内容 */}
        </form>
    );
};

// 7. 导出
export default ReportForm;
```

**组件拆分原则**：
- 一个组件只负责一个功能
- 复杂组件拆分为多个小组件
- 可复用的逻辑提取为自定义 Hooks

### 3.4 Hooks 使用规范

**使用规则**：
- 只在函数组件顶层调用 Hooks
- 不要在循环、条件或嵌套函数中调用 Hooks
- 自定义 Hooks 以 `use` 开头命名

**常用 Hooks**：
- `useState`: 管理组件状态
- `useEffect`: 处理副作用
- `useCallback`: 缓存函数引用
- `useMemo`: 缓存计算结果

---

## 4. 通用规范

### 4.1 错误处理

**错误响应格式**：
```json
{
    "status": "error",
    "code": 400,
    "message": "参数验证失败",
    "details": ["title字段不能为空"]
}
```

**异常处理原则**：
- 捕获所有可能的异常
- 提供清晰的错误信息
- 不要暴露系统内部信息给前端

### 4.2 日志规范

| 级别 | 使用场景 | 示例 |
|------|----------|------|
| DEBUG | 详细调试信息 | 函数参数、返回值 |
| INFO | 重要业务操作 | 用户登录、报告创建 |
| WARNING | 潜在问题 | 过期Token尝试 |
| ERROR | 错误但不影响系统 | API调用失败 |
| CRITICAL | 严重错误 | 服务不可用 |

**日志格式**：
```python
# Python
logger.info(f"用户 {user_id} 登录成功，IP: {ip_address}")

# JavaScript
console.info(`用户 ${userId} 登录成功`);
```

### 4.3 安全规范

| 风险类型 | 防范措施 |
|----------|----------|
| SQL注入 | 使用ORM，参数化查询 |
| XSS攻击 | 前端转义，后端过滤，CSP配置 |
| 密码泄露 | BCrypt加密，HTTPS传输 |
| 未授权访问 | JWT认证，RBAC权限控制 |
| CSRF攻击 | CSRF Token验证 |
| 文件上传 | 类型校验，路径白名单，大小限制 |
| 敏感信息 | 日志脱敏，响应过滤 |

### 4.4 Git 提交规范

**提交信息格式**：
```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**type 类型**：
| 类型 | 说明 |
|------|------|
| feat | 新功能 |
| fix | 修复bug |
| docs | 文档更新 |
| style | 代码格式调整 |
| refactor | 代码重构 |
| test | 测试代码 |
| chore | 构建/工具更新 |

**示例**：
```
feat(report): 添加漏洞报告导出功能

- 支持PDF格式导出
- 支持HTML格式导出
- 添加导出按钮组件
```

---

## 5. 附录

### A. 代码审查清单

- [ ] 代码符合命名规范
- [ ] 有足够的注释
- [ ] 没有硬编码的魔法数字
- [ ] 错误处理完善
- [ ] 没有安全漏洞
- [ ] 测试用例覆盖核心逻辑

### B. 工具推荐

| 工具 | 用途 |
|------|------|
| Black | Python代码格式化 |
| ESLint | JavaScript代码检查 |
| Prettier | 代码格式化 |
| SonarLint | 代码质量检查 |

---

**版本**：v1.0  
**生效日期**：2026年5月8日  
**团队**：随便吧！