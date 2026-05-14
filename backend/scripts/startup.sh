#!/bin/bash
set -e

echo "=== SecGuard Backend Startup ==="

# 确保核心依赖已安装（容错处理）
echo "Checking/installing core dependencies..."
pip install --quiet django django-ninja djangorestframework psycopg2-binary \
  --index-url https://mirrors.aliyun.com/pypi/simple/ \
  --trusted-host mirrors.aliyun.com 2>/dev/null || \
pip install --quiet django django-ninja djangorestframework psycopg2-binary || true

echo "✅ Dependencies ready"

# 执行原始 entrypoint
exec /blt/scripts/entrypoint.sh "$@"
