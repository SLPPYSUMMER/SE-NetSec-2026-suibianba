"""
SecGuard API 测试脚本
用于快速验证所有接口的可用性
"""

import os
import sys
import django

# 设置 Django 环境
sys.path.insert(0, r'D:\SE-NetSec-2026-suibianba\backend')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'blt.settings')

django.setup()

from django.test import Client
from django.contrib.auth.models import User
import json

def print_separator(title):
    """打印分隔线"""
    print(f"\n{'='*60}")
    print(f"  {title}")
    print('='*60)

def test_api_endpoints():
    """测试所有 SecGuard API 端点"""

    client = Client()
    base_url = '/api/secguard'

    results = []

    # ==============================================================================
    # 测试 1: 认证接口
    # ==============================================================================
    print_separator("测试认证接口")

    # 1.1 检查未登录状态
    response = client.get(f'{base_url}/auth/check')
    data = json.loads(response.content)
    status = "✓ PASS" if response.status_code == 200 and not data.get('authenticated') else "✗ FAIL"
    results.append(('GET /auth/check (未登录)', status, response.status_code))
    print(f"  {status} - {response.status_code}: {data}")

    # 1.2 测试登录（需要先创建测试用户）
    try:
        test_user, created = User.objects.get_or_create(
            username='testuser',
            defaults={
                'email': 'test@example.com',
                'is_staff': True,
                is_superuser: True,
            }
        )
        if created:
            test_user.set_password('TestPass123!')
            test_user.save()
            print("  [INFO] 创建测试用户: testuser / TestPass123!")
    except Exception as e:
        print(f"  [ERROR] 创建测试用户失败: {e}")

    # 1.3 登录测试
    login_data = {'username': 'testuser', 'password': 'TestPass123!'}
    response = client.post(f'{base_url}/auth/login', data=login_data, content_type='application/json')
    if response.status_code == 200:
        data = json.loads(response.content)
        status = "✓ PASS" if data.get('success') else "✗ FAIL"
    else:
        status = "✗ FAIL"
    results.append(('POST /auth/login', status, response.status_code))
    print(f"  {status} - {response.status_code}")

    # 1.4 检查登录后状态
    response = client.get(f'{base_url}/auth/check')
    data = json.loads(response.content)
    status = "✓ PASS" if response.status_code == 200 and data.get('authenticated') else "✗ FAIL"
    results.append(('GET /auth/check (已登录)', status, response.status_code))
    print(f"  {status} - {response.status_code}: {data}")

    # 1.5 获取当前用户信息
    response = client.get(f'{base_url}/auth/me')
    status = "✓ PASS" if response.status_code == 200 else "✗ FAIL"
    results.append(('GET /auth/me', status, response.status_code))
    print(f"  {status} - {response.status_code}")

    # 1.6 登出测试
    response = client.post(f'{base_url}/auth/logout')
    data = json.loads(response.content)
    status = "✓ PASS" if response.status_code == 200 and data.get('success') else "✗ FAIL"
    results.append(('POST /auth/logout', status, response.status_code))
    print(f"  {status} - {response.status_code}: {data}")

    # ==============================================================================
    # 测试 2: CRUD 接口
    # ==============================================================================
    print_separator("测试漏洞报告 CRUD 接口")

    # 重新登录以获取权限
    client.login(username='testuser', password='TestPass123!')

    # 2.1 获取漏洞列表（空列表）
    response = client.get(f'{base_url}/reports')
    status = "✓ PASS" if response.status_code == 200 else "✗ FAIL"
    results.append(('GET /reports (空列表)', status, response.status_code))
    print(f"  {status} - {response.status_code}")

    # 2.2 创建漏洞报告
    from website.models import Project
    try:
        project = Project.objects.first()
        if not project:
            project = Project.objects.create(name="测试项目", description="用于API测试")

        report_data = {
            'title': '测试漏洞-XSS跨站脚本攻击',
            'description': '在搜索框发现XSS漏洞，可执行任意JavaScript代码',
            'severity': 'high',
            'project_id': project.id
        }
        response = client.post(
            f'{base_url}/reports',
            data=json.dumps(report_data),
            content_type='application/json'
        )

        if response.status_code == 201 or response.status_code == 200:
            created_report = json.loads(response.content)
            vuln_id = created_report.get('vuln_id')
            status = "✓ PASS"
            print(f"  {status} - {response.status_code}: 创建成功 - {vuln_id}")
        else:
            status = "✗ FAIL"
            vuln_id = None
            print(f"  {status} - {response.status_code}: {response.content.decode()}")

        results.append(('POST /reports (创建)', status, response.status_code))

    except Exception as e:
        status = "✗ ERROR"
        vuln_id = None
        results.append(('POST /reports (创建)', status, str(e)))
        print(f"  {status} - 异常: {e}")

    # 2.3 获取漏洞详情
    if vuln_id:
        response = client.get(f'{base_url}/reports/{vuln_id}')
        status = "✓ PASS" if response.status_code == 200 else "✗ FAIL"
        results.append((f'GET /reports/{vuln_id}', status, response.status_code))
        print(f"  {status} - {response.status_code}")

        # 2.4 更新漏洞报告
        update_data = {
            'title': '更新后的漏洞标题',
            'description': '更新后的详细描述'
        }
        response = client.put(
            f'{base_url}/reports/{vuln_id}',
            data=json.dumps(update_data),
            content_type='application/json'
        )
        status = "✓ PASS" if response.status_code == 200 else "✗ FAIL"
        results.append((f'PUT /reports/{vuln_id}', status, response.status_code))
        print(f"  {status} - {response.status_code}")
    else:
        print("  [SKIP] 跳过详情和更新测试（创建失败）")

    # 2.5 获取带筛选条件的列表
    response = client.get(f'{base_url}/reports?status=pending&severity=high')
    status = "✓ PASS" if response.status_code == 200 else "✗ FAIL"
    results.append(('GET /reports?status=&severity=', status, response.status_code))
    print(f"  {status} - {response.status_code}")

    # ==============================================================================
    # 测试 3: 状态流转接口
    # ==============================================================================
    print_separator("测试状态流转接口")

    if vuln_id:
        # 3.1 分派漏洞
        assign_data = {
            'assignee_id': test_user.id,
            'comment': '分派给安全团队处理'
        }
        response = client.post(
            f'{base_url}/reports/{vuln_id}/assign',
            data=json.dumps(assign_data),
            content_type='application/json'
        )
        if response.status_code == 200:
            status = "✓ PASS"
            print(f"  {status} - 分派成功")
        else:
            status = "✗ FAIL"
            print(f"  {status} - {response.status_code}: {response.content.decode()}")
        results.append((f'POST /reports/{vuln_id}/assign', status, response.status_code))

        # 3.2 提交修复
        fix_data = {
            'action': 'submit_fix',
            'comment': '已完成修复，对输入进行了HTML编码处理'
        }
        response = client.post(
            f'{base_url}/reports/{vuln_id}/transition',
            data=json.dumps(fix_data),
            content_type='application/json'
        )
        if response.status_code == 200:
            status = "✓ PASS"
            print(f"  {status} - 提交修复成功")
        else:
            status = "✗ FAIL"
            print(f"  {status} - {response.status_code}: {response.content.decode()}")
        results.append((f'POST transition (submit_fix)', status, response.status_code))

        # 3.3 确认复核
        review_data = {
            'action': 'confirm_review',
            'comment': '复核通过，修复有效'
        }
        response = client.post(
            f'{base_url}/reports/{vuln_id}/transition',
            data=json.dumps(review_data),
            content_type='application/json'
        )
        if response.status_code == 200:
            status = "✓ PASS"
            print(f"  {status} - 确认复核成功")
        else:
            status = "✗ FAIL"
            print(f"  {status} - {response.status_code}: {response.content.decode()}")
        results.append((f'POST transition (confirm_review)', status, response.status_code))

        # 3.4 关闭漏洞
        close_data = {
            'action': 'close',
            'comment': '确认关闭'
        }
        response = client.post(
            f'{base_url}/reports/{vuln_id}/transition',
            data=json.dumps(close_data),
            content_type='application/json'
        )
        if response.status_code == 200:
            status = "✓ PASS"
            print(f"  {status} - 关闭漏洞成功")
        else:
            status = "✗ FAIL"
            print(f"  {status} - {response.status_code}: {response.content.decode()}")
        results.append((f'POST transition (close)', status, response.status_code))

        # 3.5 重新打开
        reopen_data = {
            'action': 'reopen',
            'comment': '发现新问题，重新打开'
        }
        response = client.post(
            f'{base_url}/reports/{vuln_id}/transition',
            data=json.dumps(reopen_data),
            content_type='application/json'
        )
        if response.status_code == 200:
            status = "✓ PASS"
            print(f"  {status} - 重新打开成功")
        else:
            status = "✗ FAIL"
            print(f"  {status} - {response.status_code}: {response.content.decode()}")
        results.append((f'POST transition (reopen)', status, response.status_code))
    else:
        print("  [SKIP] 跳过状态流转测试（无有效漏洞ID）")

    # ==============================================================================
    # 测试 4: 审计日志接口
    # ==============================================================================
    print_separator("测试审计日志接口")

    if vuln_id:
        # 4.1 获取漏洞审计日志
        response = client.get(f'{base_url}/reports/{vuln_id}/audit-logs')
        status = "✓ PASS" if response.status_code == 200 else "✗ FAIL"
        results.append((f'GET /reports/{vuln_id}/audit-logs', status, response.status_code))
        logs = json.loads(response.content)
        print(f"  {status} - {response.status_code}: 找到 {len(logs)} 条日志记录")
        for log in logs[:3]:
            print(f"      [{log.get('timestamp')}] {log.get('action')} - {log.get('detail')[:50]}...")

        # 4.2 获取全局审计日志（管理员）
        response = client.get(f'{base_url}/audit-logs')
        status = "✓ PASS" if response.status_code == 200 else "✗ FAIL"
        results.append(('GET /audit-logs (管理员)', status, response.status_code))
        print(f"  {status} - {response.status_code}")
    else:
        print("  [SKIP] 跳过审计日志测试（无有效漏洞ID）")

    # ==============================================================================
    # 测试结果汇总
    # ==============================================================================
    print_separator("测试结果汇总")

    total = len(results)
    passed = sum(1 for _, s, _ in results if 'PASS' in s)
    failed = sum(1 for _, s, _ in results if 'FAIL' in s)

    print(f"\n  总测试数: {total}")
    print(f"  通过:     {passed}")
    print(f"  失败:     {failed}")
    print(f"  通过率:   {(passed/total*100):.1f}%")

    print("\n  详细结果:")
    for name, status, code in results:
        print(f"    {status} | {code:3} | {name}")

    if failed > 0:
        print(f"\n  ⚠️  有 {failed} 个测试失败，请检查上述输出")
        return False
    else:
        print(f"\n  🎉 所有测试通过！")
        return True


if __name__ == '__main__':
    print("=" * 60)
    print("  SecGuard API 自动化测试")
    print("  基于Django Ninja的漏洞管理平台接口验证")
    print("=" * 60)

    success = test_api_endpoints()

    sys.exit(0 if success else 1)
