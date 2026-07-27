#!/bin/bash
# ============================================
# Hindsight API 启动脚本 — 本地中英文模型离线模式
# 模型: BAAI/bge-large-zh-v1.5 (Embedding) + BAAI/bge-reranker-large (Reranker)
# 适用: Git Bash / WSL / Linux / macOS
# ============================================
set -e

# --- 路径配置 ---
HERMES_HOME="${HERMES_HOME:-$HOME/.hermes}"
DOT_ENV="$HERMES_HOME/profiles/orchestrator/.env"
HINDSIGHT_OFFLINE="$HERMES_HOME/hindsight-offline"

# --- 读取 DeepSeek API Key ---
if [ -f "$DOT_ENV" ]; then
    DS_KEY=$(grep ^DEEPSEEK_API_KEY "$DOT_ENV" | head -1 | cut -d= -f2-)
else
    echo "ERROR: $DOT_ENV not found."
    exit 1
fi

# --- 数据库 ---
export HINDSIGHT_API_DATABASE_URL="postgresql://hindsight:hindsight_dev@localhost:5432/hindsight"
export HINDSIGHT_API_MIGRATION_DATABASE_URL="postgresql+psycopg2://hindsight:hindsight_dev@127.0.0.1:5432/hindsight"
export HINDSIGHT_API_RUN_MIGRATIONS=true

# --- 服务 ---
export HINDSIGHT_API_HOST=0.0.0.0
export HINDSIGHT_API_PORT=8888
export HINDSIGHT_API_LOG_LEVEL=info

# --- LLM: DeepSeek API (在线, 记忆综合) ---
export HINDSIGHT_API_LLM_PROVIDER=deepseek
export HINDSIGHT_API_LLM_API_KEY="$DS_KEY"
export HINDSIGHT_API_LLM_MODEL=deepseek-v4-flash

# --- Embedding: 本地 BAAI/bge-large-zh-v1.5 (1024-dim, 中英文, C-MTEB #1) ---
export HINDSIGHT_API_EMBEDDINGS_PROVIDER=local
export HINDSIGHT_API_EMBEDDINGS_LOCAL_MODEL="$HINDSIGHT_OFFLINE/model/embedding"
export HINDSIGHT_API_EMBEDDINGS_LOCAL_FORCE_CPU=false
export HINDSIGHT_API_EMBEDDINGS_LOCAL_TRUST_REMOTE_CODE=false

# --- Reranker: 本地 BAAI/bge-reranker-large (中英文, C-MTEB #1) ---
export HINDSIGHT_API_RERANKER_PROVIDER=local
export HINDSIGHT_API_RERANKER_LOCAL_MODEL="$HINDSIGHT_OFFLINE/model/reranker"
export HINDSIGHT_API_RERANKER_LOCAL_FORCE_CPU=false
export HINDSIGHT_API_RERANKER_LOCAL_FP16=true

# --- HF 镜像 (备用, 万一需要补下载) ---
export HF_ENDPOINT=https://hf-mirror.com

echo "Starting Hindsight API (Local ZH+EN Models Mode)..."
echo "  LLM:        $HINDSIGHT_API_LLM_PROVIDER/$HINDSIGHT_API_LLM_MODEL (API)"
echo "  Embedding:  local BAAI/bge-large-zh-v1.5 (1024-dim, zh+en, offline)"
echo "  Reranker:   local BAAI/bge-reranker-large (zh+en, offline)"
echo "  Port:       $HINDSIGHT_API_PORT"
echo "  DB:         localhost:5432/hindsight"
echo "  Model dir:  $HINDSIGHT_OFFLINE/model"

uv tool run hindsight-api
