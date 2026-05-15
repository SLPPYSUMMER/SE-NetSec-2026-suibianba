FROM python:3.11.2 AS builder

ENV PYTHONUNBUFFERED=1
WORKDIR /blt

RUN sed -i 's/deb.debian.org/mirrors.aliyun.com/g' /etc/apt/sources.list && \
    apt-get update && \
    apt-get install -y postgresql-client libpq-dev \
    libmemcached11 libmemcachedutil2 libmemcached-dev libz-dev \
    libglib2.0-0 libsm6 libxext6 libxrender1 libgomp1 \
    libgtk-3-0 libavcodec-dev libavformat-dev libswscale-dev \
    libgstreamer-plugins-base1.0-dev libgstreamer1.0-dev \
    libpng-dev libjpeg-dev libtiff-dev libwebp-dev && \
    rm -rf /var/lib/apt/lists/*

# weasyprint PDF export dependencies
RUN sed -i 's/deb.debian.org/mirrors.aliyun.com/g' /etc/apt/sources.list && \
    apt-get update && \
    apt-get install -y --no-install-recommends \
    libpango-1.0-0 libpangocairo-1.0-0 libcairo2 libgdk-pixbuf-2.0-0 && \
    rm -rf /var/lib/apt/lists/*

# 配置国内镜像源加速（阿里云 + 清华源备份）
RUN pip install --upgrade pip && pip install poetry==2.2.1
RUN pip config set global.index-url https://mirrors.aliyun.com/pypi/simple/ && \
    pip config set global.trusted-host mirrors.aliyun.com
RUN poetry config virtualenvs.create false
RUN poetry source add --priority=primary aliyun https://mirrors.aliyun.com/pypi/simple/ 2>/dev/null || true && \
    poetry source add --priority=default tsinghua https://mirrors.tuna.tsinghua.edu.cn/pypi/simple/ 2>/dev/null || true

COPY pyproject.toml poetry.lock* requirements.txt ./
RUN pip uninstall -y httpx || true

# 安装核心依赖（优先使用 poetry，失败则回退到 pip）
RUN echo "=== Attempting Poetry Install ===" && \
    (poetry lock 2>/dev/null || true) && \
    (poetry install --no-root --no-interaction --timeout 300 && \
     echo "✅ Poetry install succeeded" || \
     (echo "⚠️  Poetry install failed, using pip fallback..." && \
      pip install --no-cache-dir --index-url https://mirrors.aliyun.com/pypi/simple/ \
      --trusted-host mirrors.aliyun.com \
      -r requirements.txt && \
      echo "✅ Pip fallback install succeeded"))

# 确保关键依赖已安装
RUN pip install django django-ninja djangorestframework psycopg2-binary \
    --index-url https://mirrors.aliyun.com/pypi/simple/ \
    --trusted-host mirrors.aliyun.com || true

RUN pip install django-cors-headers 2>/dev/null || true

# Install OWASP Nettacker - automated penetration testing tool
RUN pip install nettacker --index-url https://mirrors.aliyun.com/pypi/simple/ --timeout 120 || \
    pip install nettacker --index-url https://pypi.org/simple/ --timeout 120 || \
    (pip install git+https://github.com/OWASP/Nettacker.git --timeout 180 || \
     echo "Warning: nettacker installation failed, scan feature may not work")

# Verify nettacker is usable (CLI or at least importable)
RUN nettacker --help 2>/dev/null || python -m nettacker --help 2>/dev/null || \
    python -c "import nettacker; print('nettacker module OK')" 2>/dev/null || \
    echo "Note: nettacker not available, scanner will use fallback"

FROM python:3.11.2-slim
ENV PYTHONUNBUFFERED=1
WORKDIR /blt

COPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

RUN sed -i 's/deb.debian.org/mirrors.aliyun.com/g' /etc/apt/sources.list && \
    apt-get update && \
    apt-get install -y postgresql-client libpq-dev \
    libmemcached11 libmemcachedutil2 \
    libglib2.0-0 libsm6 libxext6 libxrender1 libgomp1 \
    libgtk-3-0 libavcodec58 libavformat58 libswscale5 \
    libpng16-16 libjpeg62-turbo libtiff5 libwebp6 && \
    rm -rf /var/lib/apt/lists/*

# weasyprint PDF export dependencies
RUN sed -i 's/deb.debian.org/mirrors.aliyun.com/g' /etc/apt/sources.list && \
    apt-get update && \
    apt-get install -y --no-install-recommends \
    libpango-1.0-0 libpangocairo-1.0-0 libcairo2 libgdk-pixbuf-2.0-0 && \
    rm -rf /var/lib/apt/lists/*

COPY . /blt

RUN if [ -f /blt/scripts/entrypoint.sh ]; then chmod +x /blt/scripts/entrypoint.sh; fi && \
    if [ -f /blt/scripts/entrypoint.sh ]; then sed -i 's/\r$//' /blt/scripts/entrypoint.sh; fi

EXPOSE 8000
ENTRYPOINT ["/blt/scripts/entrypoint.sh"]
CMD ["poetry", "run", "python", "manage.py", "runserver", "0.0.0.0:8000"]
