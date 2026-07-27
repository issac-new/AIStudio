#!/bin/bash
# Hindsight API launcher script — 本地中英文模型离线模式
set -e

# Read API keys from .env — use DAMOXING proxy (DeepSeek direct key expired)
DS_KEY=$(grep ^DAMOXING_API_KEY $HOME/.hermes/profiles/orchestrator/.env | head -1 | cut -d= -f2-)
DS_BASE=$(grep ^DAMOXING_BASE_URL $HOME/.hermes/profiles/orchestrator/.env | head -1 | cut -d= -f2-)

export HINDSIGHT_API_LLM_PROVIDER=openai
export HINDSIGHT_API_LLM_API_KEY="$DS_KEY"
export HINDSIGHT_API_LLM_MODEL=glm-5.2
export HINDSIGHT_API_LLM_BASE_URL="${DS_BASE}/v1"
export HINDSIGHT_API_DATABASE_URL="postgresql://hindsight:hindsight_dev@localhost:5432/hindsight"
export HINDSIGHT_API_MIGRATION_DATABASE_URL="postgresql+psycopg2://hindsight:hindsight_dev@127.0.0.1:5432/hindsight"
export HINDSIGHT_API_HOST=0.0.0.0
export HINDSIGHT_API_PORT=8888
export HINDSIGHT_API_LOG_LEVEL=info

# --- Embeddings: 本地 BAAI/bge-large-zh-v1.5 (1024-dim, 中英文, C-MTEB #1) ---
export HINDSIGHT_API_EMBEDDINGS_PROVIDER=local
export HINDSIGHT_API_EMBEDDINGS_LOCAL_MODEL="BAAI/bge-large-zh-v1.5"
export HINDSIGHT_API_EMBEDDINGS_LOCAL_FORCE_CPU=false
export HINDSIGHT_API_EMBEDDINGS_LOCAL_TRUST_REMOTE_CODE=false

# --- Reranker: 本地 BAAI/bge-reranker-large (中英文, C-MTEB #1) ---
export HINDSIGHT_API_RERANKER_PROVIDER=local
export HINDSIGHT_API_RERANKER_LOCAL_MODEL="BAAI/bge-reranker-large"
export HINDSIGHT_API_RERANKER_LOCAL_FORCE_CPU=false
export HINDSIGHT_API_RERANKER_LOCAL_FP16=true

export HINDSIGHT_API_RUN_MIGRATIONS=true
export HF_ENDPOINT=https://hf-mirror.com

echo "Starting Hindsight API (Local Models Mode)..."
echo "  LLM:        $HINDSIGHT_API_LLM_PROVIDER/$HINDSIGHT_API_LLM_MODEL (API)"
echo "  Port:       $HINDSIGHT_API_PORT"
echo "  DB:         localhost:5432/hindsight"
echo "  Embeddings: local BAAI/bge-large-zh-v1.5 (1024-dim, zh+en)"
echo "  Reranker:   local BAAI/bge-reranker-large (zh+en)"

uv tool run hindsight-api
