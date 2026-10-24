# Docker 构建环境预克隆仓库方案

当 Docker build 环境无法访问 `github.com`（DNS/网络隔离/GFW）时，Hermes 安装器的 git clone 步骤会失败：

```
fatal: unable to access 'https://github.com/NousResearch/hermes-agent.git/':
  GnuTLS recv error (-110): The TLS connection was non-properly terminated.
```

## 解决方案：宿主机预克隆 + COPY

在宿主机上克隆仓库，然后通过 Docker 的 `COPY` 指令注入镜像，绕过构建环境的网络限制。

### 步骤

```bash
# 1. 在宿主机克隆
git clone --depth 1 https://github.com/NousResearch/hermes-agent.git /tmp/hermes-agent

# 2. 复制到构建上下文（在项目根目录执行）
cp -a /tmp/hermes-agent hermes-agent/
rm -rf hermes-agent/.git    # 移除 .git（52MB）减小上下文大小

# 3. 创建 .dockerignore 排除 .git
cat > .dockerignore << 'EOF'
.git
hermes-agent/.git
workspace/node_modules
EOF

# 4. Dockerfile 中使用 COPY
COPY hermes-agent /usr/local/lib/hermes-agent
RUN cd /usr/local/lib/hermes-agent && \
    python3.11 -m venv venv && \
    . venv/bin/activate && \
    pip install -e '.[all]'
```

### 注意事项

- 克隆后的源码约 117MB（排除 `.git` 后），会增大 Docker 构建上下文
- 确保 `docker-entrypoint.sh` 等不依赖 `.git` 目录
- 每次需要更新 Hermes 版本时，重新克隆并构建
- `pip install -e '.[all]'` 需要从 PyPI 下载约 95 个包，首次安装约 10-20 分钟（ARM64 原生比 QEMU 快 2-3 倍）

### 何时使用

| 场景 | 推荐方式 |
|------|---------|
| 能访问 github.com | Herems 安装器（最快） |
| 能访问 GitHub 但 TLS 不稳定 | `GIT_SSL_NO_VERIFY=1` + Hermes 安装器 |
| 完全无法访问 GitHub | 预克隆 + COPY |
| 想离线构建 | 预克隆 + pip 缓存导出 |
