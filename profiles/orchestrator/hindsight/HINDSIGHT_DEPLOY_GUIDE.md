# Hindsight Local External 部署配置指南

## 概述

本指南介绍如何在 macOS 上为 Hermes Agent 部署 Hindsight 作为外部长期记忆模块（Local External 模式）。Hindsight 提供知识图谱驱动的语义记忆系统，支持实体提取、多策略检索和 LLM 驱动的记忆综合。

**版本**: v0.8.2 | **环境**: macOS 26.5.1 | **Hermes Profiles**: orchestrator / worker-coder / worker-researcher

---

## 目录

1. [架构概览](#1-架构概览)
2. [环境要求](#2-环境要求)
3. [部署步骤](#3-部署步骤)
4. [内存模块配置](#4-内存模块配置)
5. [Reranker 配置](#5-reranker-配置)
6. [验证测试](#6-验证测试)
7. [运维管理](#7-运维管理)
8. [故障排除](#8-故障排除)
9. [配置参考](#9-配置参考)

---

## 1. 架构概览

```
┌──────────────────────────────────────────────────────────┐
│                   Hermes Agent                           │
│                                                          │
│  orchestrator ──┐                                        │
│  worker-coder  ─┤── memory.provider: hindsight           │
│  worker-research├─  bank_id_template: hermes-{profile}   │
│                 │  (按 profile 自动隔离 bank)             │
│  ───────────────┘                                        │
└──────────────────────┬───────────────────────────────────┘
                       │ HTTP (localhost:8888)
                       ▼
┌──────────────────────────────────────────────────────────┐
│              Hindsight API Server                         │
│                                                           │
│  ┌─────────────────┐    ┌──────────────────────────────┐  │
│  │ LLM: DeepSeek   │    │ Embeddings: Local (BGE)     │  │
│  │ V4 Flash        │    │ BAAI/bge-small-en-v1.5      │  │
│  │ deepseek-chat   │    │ 384-dim, Apple MPS          │  │
│  │ api.deepseek.com│    │                              │  │
│  └─────────────────┘    └──────────────────────────────┘  │
│  ┌─────────────────┐    ┌──────────────────────────────┐  │
│  │ Reranker:       │    │ Database: pgvector:pg16     │  │
│  │ Cross-Encoder   │    │ Docker PostgreSQL           │  │
│  │ ms-marco-       │    │ hindsight:hindsight_dev     │  │
│  │ MiniLM-L-6-v2   │    │ localhost:5432              │  │
│  │ 本地磁盘加载     │    │                              │  │
│  └─────────────────┘    └──────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

### Bank 隔离策略

| Profile | Bank ID | 说明 |
|---------|---------|------|
| orchestrator | `hermes-orchestrator` | 编排器记忆 |
| worker-coder | `hermes-worker-coder` | 编码任务记忆 |
| worker-researcher | `hermes-worker-researcher` | 研究员记忆 |

各 profile 的记忆通过 `bank_id_template: hermes-{profile}` 自动隔离，互不干扰。

---

## 2. 环境要求

### 系统要求

| 组件 | 版本 | 说明 |
|------|------|------|
| **Docker Desktop** | v29.5.3+ | macOS 版，用于运行 pgvector PostgreSQL |
| **uv** | 最新 | Python 包管理器，用于运行 hindsight-api |
| **Python** | 3.11+ | 运行环境（由 uv 自动管理） |
| **Git LFS** | 2.x+ | 下载 cross-encoder 模型权重 |

### API Keys

| Key | 来源 | 用途 |
|-----|------|------|
| `DEEPSEEK_API_KEY` | DeepSeek Console | Hindsight LLM 调用（实体提取/综合） |
| `HF_ENDPOINT` | HuggingFace | 嵌入模型下载（默认 hf-mirror.com） |

### 端口占用

| 端口 | 服务 | 说明 |
|------|------|------|
| `8888` | Hindsight API | HTTP API 服务 |
| `5432` | PostgreSQL | pgvector 数据库 |

---

## 3. 部署步骤

### 3.1 克隆 Hindsight MemPalace 仓库

```bash
git clone --depth 1 https://github.com/holetron/hindsight-mempalace.git
cd hindsight-mempalace
```

此 fork 在原始 Hindsight 基础上增加了 MemPalace 层次化记忆结构（房间/走廊/层级）。

### 3.2 安装 Hindsight API

使用 `uv tool install` 安装 hindsight-api-slim：

```bash
uv tool install "hindsight-api-slim[embedded-db]==0.8.2"
```

安装完成后会生成 `hindsight-api` 命令：

```bash
# 验证安装
uv tool run hindsight-api --help
```

> **注意**: 安装过程会下载大量 Python 依赖（litellm、claude-agent-sdk、onnxruntime 等），首次安装可能需要 5-15 分钟。

### 3.3 安装额外依赖

Hindsight 的 local reranker（cross-encoder）需要 PyTorch 和 sentence-transformers：

```bash
uv pip install --python ~/.local/share/uv/tools/hindsight-api-slim/bin/python \
  sentence-transformers
```

### 3.4 启动 PostgreSQL (Docker pgvector)

```bash
cd hindsight-mempalace
docker compose -f docker-compose.mempalace.yml up -d db
```

**验证数据库就绪**:

```bash
docker ps --filter name=hindsight
# 输出: Container hindsight-db-1 Started (healthy)
```

PostgreSQL 配置：
- 主机: `localhost` / `127.0.0.1`
- 端口: `5432`
- 数据库: `hindsight`
- 用户: `hindsight`
- 密码: `hindsight_dev`
- 扩展: pgvector

> ⚠️ `.env` 文件不要包含 `DB_PASSWORD=***` 字面量。默认密码为 `hindsight_dev`。错误的密码会导致 Hindsight API 启动失败。

### 3.5 下载 Cross-Encoder Reranker 模型

由于 HuggingFace 官方及镜像的 HTTP 直连均无法稳定下载大文件（>400MB 超时），采用 Git LFS 协议下载：

```bash
# 先安装 git lfs
brew install git-lfs
git lfs install

# 克隆模型仓库（纯元数据，速度快）
git clone --depth 1 https://hf-mirror.com/cross-encoder/ms-marco-MiniLM-L-6-v2 \
  /tmp/cross-encoder-model

# 拉取 LFS 权重文件（实际模型 ~90MB）
cd /tmp/cross-encoder-model
git lfs pull

# 复制到本地持久化路径
mkdir -p ~/.cache/hindsight-cross-encoder
cp -r /tmp/cross-encoder-model/* ~/.cache/hindsight-cross-encoder/

# 验证加载
~/.local/share/uv/tools/hindsight-api-slim/bin/python -c "
from sentence_transformers import CrossEncoder
model = CrossEncoder('~/.cache/hindsight-cross-encoder')
print('✅ Model loaded:', model.predict([('test query', 'test passage')]))
"
```

### 3.6 创建启动脚本

创建 `~/.hermes/profiles/orchestrator/hindsight/start.sh`:

```bash
#!/bin/bash
# Hindsight API launcher script
set -e

# Read DeepSeek API key from .env
DS_KEY=$(grep ^DEEPSEEK_API_KEY $HOME/.hermes/profiles/orchestrator/.env | head -1 | cut -d= -f2-)

export HINDSIGHT_API_LLM_PROVIDER=deepseek
export HINDSIGHT_API_LLM_API_KEY="$DS_KEY"
export HINDSIGHT_API_LLM_MODEL=deepseek-v4-flash
export HINDSIGHT_API_DATABASE_URL="postgresql://hindsight:hindsight_dev@localhost:5432/hindsight"
export HINDSIGHT_API_MIGRATION_DATABASE_URL="postgresql+psycopg2://hindsight:hindsight_dev@127.0.0.1:5432/hindsight"
export HINDSIGHT_API_HOST=0.0.0.0
export HINDSIGHT_API_PORT=8888
export HINDSIGHT_API_LOG_LEVEL=info
export HINDSIGHT_API_EMBEDDINGS_PROVIDER=local
export HINDSIGHT_API_RERANKER_PROVIDER=local
export HINDSIGHT_API_RERANKER_LOCAL_MODEL=~/.cache/hindsight-cross-encoder
export HINDSIGHT_API_RUN_MIGRATIONS=true
export HF_ENDPOINT=https://hf-mirror.com

echo "Starting Hindsight API..."
echo "  LLM:       $HINDSIGHT_API_LLM_PROVIDER/$HINDSIGHT_API_LLM_MODEL"
echo "  API Key:   ${HINDSIGHT_API_LLM_API_KEY:0:15}...${HINDSIGHT_API_LLM_API_KEY: -4}"
echo "  Port:      $HINDSIGHT_API_PORT"
echo "  DB:        localhost:5432/hindsight"
echo "  Embeddings: local (BGE-small)"
echo "  Reranker:  $HINDSIGHT_API_RERANKER_PROVIDER (local path)"

uv tool run hindsight-api
```

```bash
chmod +x ~/.hermes/profiles/orchestrator/hindsight/start.sh
```

### 3.7 启动 Hindsight API

```bash
# 确保端口空闲
lsof -ti:8888 | xargs kill -9 2>/dev/null

# 后台启动（独立于当前会话，nohup 保持运行）
nohup ~/.hermes/profiles/orchestrator/hindsight/start.sh > /tmp/hindsight-api.log 2>&1 &

# 等待启动（首次需加载嵌入模型，约 1-2 分钟）
sleep 90

# 验证健康状态
curl -s http://localhost:8888/health
# 期望: {"status":"healthy","database":"connected"}
```

---

## 4. 内存模块配置

### 4.1 创建 Hindsight 配置（orchestrator）

创建 `~/.hermes/profiles/orchestrator/hindsight/config.json`:

```json
{
  "mode": "local_external",
  "api_url": "http://localhost:8888",
  "bank_id": "hermes",
  "bank_id_template": "hermes-{profile}",
  "recall_budget": "mid",
  "recall_method": "recall",
  "auto_recall": true,
  "auto_retain": true,
  "retain_async": true,
  "retain_every_n_turns": 1,
  "memory_mode": "hybrid",
  "recall_types": "observation,world,experience",
  "recall_max_tokens": 4096
}
```

> `bank_id_template: hermes-{profile}` 使不同 Hermes profile 使用独立的 bank：
> - orchestrator → `hermes-orchestrator`
> - worker-coder → `hermes-worker-coder`
> - worker-researcher → `hermes-worker-researcher`

### 4.2 安装 hindsight-client

```bash
pip3 install "hindsight-client==0.6.1"
```

### 4.3 配置所有 Hermes Profile

编辑各 profile 的 `config.yaml`，设置 memory provider 为 `hindsight`：

**orchestrator** (`~/.hermes/profiles/orchestrator/config.yaml`):
```yaml
memory:
  provider: hindsight
  memory_enabled: true
  user_profile_enabled: true
  write_approval: false
  memory_char_limit: 2200
  user_char_limit: 1375

plugins:
  enabled:
    - hindsight
    # - 其他插件

model:
  default: deepseek-v4-flash
  provider: deepseek
  base_url: ""
```

**worker-coder** (`~/.hermes/profiles/worker-coder/config.yaml`):
```yaml
memory:
  provider: hindsight
  memory_enabled: true
  user_profile_enabled: true

model:
  default: deepseek-v4-flash
  provider: deepseek
  base_url: ""
```

**worker-researcher** (`~/.hermes/profiles/worker-researcher/config.yaml`):
```yaml
memory:
  provider: hindsight
  memory_enabled: true
  user_profile_enabled: true

model:
  default: deepseek-v4-flash
  provider: deepseek
  base_url: ""
```

### 4.4 环境变量

确保 `~/.hermes/profiles/orchestrator/.env` 包含:
```
DEEPSEEK_API_KEY=sk-xxx...xxxx
```

> ⏳ 配置变更后，当前运行中的 orchestrator 会话仍使用旧配置。需要**新建会话**使新配置生效。Worker profile 在下次 kanban 任务派发时自动继承新配置。

---

## 5. Reranker 配置

Hindsight 支持多种重排序器。当前使用 **Cross-Encoder**（local）—— 质量最高的本地神经网络重排序。

### 可用 Reranker 选项

| Provider | 类型 | 效果 | 依赖 |
|----------|------|------|------|
| **`local`** ✅ | Cross-Encoder | ⭐⭐⭐ 最优 | 需下载模型（~90MB 权重） |
| `flashrank` | 轻量神经网络 | ⭐⭐ 良好 | 需下载模型（~50MB） |
| `rrf` | 算法融合 | ⭐ 一般 | 无依赖 |
| `cohere` | API | ⭐⭐⭐ | 需要 API Key |

### Cross-Encoder 配置

```bash
# 环境变量（已配置在 start.sh 中）
export HINDSIGHT_API_RERANKER_PROVIDER=local
export HINDSIGHT_API_RERANKER_LOCAL_MODEL=~/.cache/hindsight-cross-encoder
```

模型缓存路径: `~/.cache/hindsight-cross-encoder/`

启动日志确认:
```
Reranker: initializing local provider with model ~/.cache/hindsight-cross-encoder
Reranker: local provider initialized (max_concurrent=4)
```

检索日志确认:
```
[RECALL] Reranking [cross-encoder]: 7 candidates scored in 1.656s
Combined scoring: ce * recency_boost(0.2) * temporal_boost(0.2)
```

---

## 6. 验证测试

### 6.1 健康检查

```bash
curl -s http://localhost:8888/health
# {"status":"healthy","database":"connected"}

curl -s http://localhost:8888/version
# {"api_version":"0.8.2","features":{...}}
```

### 6.2 记忆存储测试

```bash
curl -s -X POST "http://localhost:8888/v1/default/banks/hermes-orchestrator/memories" \
  -H "Content-Type: application/json" \
  -d '{"items":[{"content":"Test memory for Hindsight verification"}]}'
# 期望: {"success":true,"items_count":1,"usage":{"input_tokens":...,"output_tokens":...}}
```

### 6.3 语义检索测试

```bash
curl -s -X POST "http://localhost:8888/v1/default/banks/hermes-orchestrator/memories/recall" \
  -H "Content-Type: application/json" \
  -d '{"query":"test memory","limit":3}'
# 期望: {"results":[...], "entities":{...}}
```

### 6.4 查看所有 Banks

```bash
curl -s http://localhost:8888/v1/default/banks | python3 -m json.tool
```

### 6.5 Hermes Provider 验证

```python
from plugins.memory import load_memory_provider

provider = load_memory_provider("hindsight")
print(f"Loaded: {provider.name}")       # hindsight
print(f"Available: {provider.is_available()}")  # True

provider.initialize(
    session_id="test-session",
    hermes_home="$HOME/.hermes/profiles/orchestrator",
    platform="cli",
    agent_identity="orchestrator"
)
```

---

## 7. 运维管理

### 7.1 启动/停止

```bash
# 启动 PostgreSQL
docker compose -f docker-compose.mempalace.yml up -d db

# 启动 Hindsight API
cd ~/.hermes/profiles/orchestrator/hindsight
nohup ./start.sh > /tmp/hindsight-api.log 2>&1 &

# 停止 Hindsight API
lsof -ti:8888 | xargs kill

# 停止 PostgreSQL（保留数据）
docker compose -f docker-compose.mempalace.yml stop db

# 完全停止（删除数据）
docker compose -f docker-compose.mempalace.yml down -v
```

### 7.2 查看日志

```bash
# Hindsight API 日志
tail -f /tmp/hindsight-api.log

# 数据库日志
docker logs hindsight-db-1
```

### 7.3 数据库管理

```bash
# 连接到 PostgreSQL
docker exec -it hindsight-db-1 psql -U hindsight -d hindsight

# 查看所有 bank 的记忆数据
docker exec hindsight-db-1 psql -U hindsight -d hindsight \
  -c "SELECT bank_id, COUNT(*) as fact_count FROM memory_units GROUP BY bank_id;"

# 查看最新记忆
docker exec hindsight-db-1 psql -U hindsight -d hindsight \
  -c "SELECT bank_id, LEFT(text, 60) as content, created_at FROM memory_units ORDER BY created_at DESC LIMIT 10;"
```

### 7.4 备份/恢复

```bash
# 备份数据库
docker exec hindsight-db-1 pg_dump -U hindsight -d hindsight > hindsight_backup_$(date +%Y%m%d).sql

# 恢复数据库
cat hindsight_backup.sql | docker exec -i hindsight-db-1 psql -U hindsight -d hindsight
```

### 7.5 升级 Hindsight API

```bash
# 停止服务
lsof -ti:8888 | xargs kill

# 安装新版本
uv tool install "hindsight-api-slim[embedded-db]==0.9.0"

# 重启
./start.sh
```

---

## 8. 故障排除

### 8.1 API 无法启动 — 端口占用

**症状**: `curl: connection refused` 或 `Address already in use`

**解决**:
```bash
lsof -i:8888
lsof -ti:8888 | xargs kill -9
./start.sh
```

### 8.2 数据库连接失败

**症状**: `password authentication failed for user "hindsight"`

**排查**:
```bash
# 检查 Docker 运行状态
docker ps --filter name=hindsight

# 检查密码
docker exec hindsight-db-1 env | grep PASSWORD

# 测试连接
python3 -c "
import psycopg2
conn = psycopg2.connect(
    host='127.0.0.1', port=5432,
    user='hindsight', password='hindsight_dev', dbname='hindsight'
)
print('Connected!')
"
```

**修复**: 密码错误需重建数据库容器：
```bash
docker compose -f docker-compose.mempalace.yml down -v
# 确保 .env 中没有 DB_PASSWORD=*** 字面量
docker compose -f docker-compose.mempalace.yml up -d db
```

### 8.3 Cross-Encoder 模型下载失败

**症状**: `Couldn't connect to 'https://hf-mirror.com'`

**原因**: HuggingFace 镜像无法直接 HTTP 下载大模型文件。

**解决**: 使用 Git LFS 协议替代 HTTP：
```bash
# 通过 git clone + git lfs pull 下载
git lfs install
git clone --depth 1 https://hf-mirror.com/cross-encoder/ms-marco-MiniLM-L-6-v2 /tmp/model
cd /tmp/model && git lfs pull

# 复制到持久化路径
mkdir -p ~/.cache/hindsight-cross-encoder
cp -r /tmp/model/* ~/.cache/hindsight-cross-encoder/
```

### 8.4 LLM 验证失败

**症状**: `AuthenticationError` 或 `Connection verification failed`

**排查**:
```bash
# 验证 API Key
python3 -c "
from openai import OpenAI
client = OpenAI(api_key='sk-xxx', base_url='https://api.deepseek.com/v1')
resp = client.chat.completions.create(model='deepseek-v4-flash', messages=[{'role': 'user', 'content': 'hi'}])
print(resp.choices[0].message.content)
"

# 检查环境变量
echo $HINDSIGHT_API_LLM_API_KEY
```

### 8.5 不同 Profile 记忆未隔离

**症状**: orchestrator 和 worker-coder 的记忆混在一起

**检查**:
```bash
# 确认 bank_id_template 已设置
cat ~/.hermes/profiles/orchestrator/hindsight/config.json | grep bank_id_template

# 查看各 bank 的数据量
docker exec hindsight-db-1 psql -U hindsight -d hindsight \
  -c "SELECT bank_id, COUNT(*) FROM memory_units GROUP BY bank_id;"
```

**修复**: 确保 `config.json` 中包含 `"bank_id_template": "hermes-{profile}"`。

### 8.6 多次重启后端口冲突

```bash
# 强制清理所有相关进程
pkill -f "hindsight-api" 2>/dev/null
lsof -ti:8888 | xargs kill -9 2>/dev/null
```

---

## 9. 配置参考

### 9.1 完整目录结构

```
~/.hermes/
├── profiles/
│   ├── orchestrator/
│   │   ├── config.yaml                    # memory.provider: hindsight
│   │   ├── .env                           # DEEPSEEK_API_KEY
│   │   └── hindsight/
│   │       ├── config.json                # local_external 配置 + bank_id_template
│   │       └── start.sh                   # API 启动脚本
│   ├── worker-coder/
│   │   └── config.yaml                    # memory.provider: hindsight
│   └── worker-researcher/
│       └── config.yaml                    # memory.provider: hindsight
└── kanban/boards/kanban001/workspaces/t_38513e2a/hindsight/
    └── docker-compose.mempalace.yml        # PostgreSQL + pgvector
```

### 9.2 环境变量大全

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `HINDSIGHT_API_LLM_PROVIDER` | `deepseek` | LLM 提供商 |
| `HINDSIGHT_API_LLM_API_KEY` | — | DeepSeek API Key |
| `HINDSIGHT_API_LLM_MODEL` | `deepseek-v4-flash` | 模型名称 |
| `HINDSIGHT_API_DATABASE_URL` | — | PostgreSQL 连接串 (asyncpg) |
| `HINDSIGHT_API_MIGRATION_DATABASE_URL` | — | 迁移用连接串 (psycopg2) |
| `HINDSIGHT_API_HOST` | `0.0.0.0` | 监听地址 |
| `HINDSIGHT_API_PORT` | `8888` | 监听端口 |
| `HINDSIGHT_API_LOG_LEVEL` | `info` | 日志级别 |
| `HINDSIGHT_API_EMBEDDINGS_PROVIDER` | `local` | 嵌入模型提供商 |
| `HINDSIGHT_API_EMBEDDINGS_LOCAL_MODEL` | `BAAI/bge-small-en-v1.5` | 本地嵌入模型 |
| `HINDSIGHT_API_RERANKER_PROVIDER` | `local` | 重排序提供商 |
| `HINDSIGHT_API_RERANKER_LOCAL_MODEL` | `cross-encoder/...` | Cross-encoder 模型路径/名称 |
| `HINDSIGHT_API_RUN_MIGRATIONS` | `true` | 自动运行数据库迁移 |
| `HF_ENDPOINT` | HuggingFace | HuggingFace Hub 镜像节点 |

### 9.3 API 端点

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/health` | 健康检查 |
| GET | `/version` | 版本信息 |
| GET | `/v1/default/banks` | 列出所有 Bank |
| POST | `/v1/default/banks/{bank_id}/memories` | 存储记忆（含实体提取） |
| POST | `/v1/default/banks/{bank_id}/memories/recall` | 语义检索 |
| POST | `/v1/default/banks/{bank_id}/memories/reflect` | LLM 综合分析 |

### 9.4 支持的 LLM Providers

`openai`, `groq`, `ollama`, `gemini`, `anthropic`, `lmstudio`, `llamacpp`, `vertexai`, `minimax`, `deepseek`, `litellm`, `openrouter`, `zai`, `fireworks`, `nous`

### 9.5 支持的 Embeddings Providers

`local` (sentence-transformers), `onnx`, `tei`, `openai`, `openai-codex`, `openrouter`, `cohere`, `google`, `zeroentropy`, `litellm`, `litellm-sdk`

---

**文档版本**: 2.0  
**适用版本**: Hindsight API v0.8.2 / hindsight-mempalace  
**最后更新**: 2026-06-15  
**变更记录**:  
- v2.0: Reranker 切换为 local cross-encoder（Git LFS 下载），所有 Profile 使用 hindsight，bank_id_template 实现隔离，模型改为 deepseek-v4-flash
