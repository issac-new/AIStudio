#!/bin/bash
# Hindsight API launcher script — 本地中英文模型离线模式
set -e

# Route LLM through cc-switch claude queue (127.0.0.1:15721)
# CRITICAL: use anthropic provider → /v1/messages → cc-switch routes to CLAUDE app_type
# (openai provider → /v1/chat/completions → gets routed to CODEX app_type which has broken MKimi)
# This ensures Hindsight uses the same claude failover queue as Hermes itself.
export HINDSIGHT_API_LLM_PROVIDER=anthropic
export HINDSIGHT_API_LLM_API_KEY="PROXY_MANAGED"
export HINDSIGHT_API_LLM_MODEL=glm-5.3
export HINDSIGHT_API_LLM_BASE_URL="http://127.0.0.1:15721"
# cc-switch may route glm-5.3 to providers that reject explicit temperature
# (e.g. HKimi/Kimi K3 only allows temperature=1). Omit it so the upstream
# picks its own default.
export HINDSIGHT_API_LLM_TEMPERATURE=none
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
echo "  LLM:        $HINDSIGHT_API_LLM_PROVIDER/$HINDSIGHT_API_LLM_MODEL (via cc-switch 15721)"
echo "  Port:       $HINDSIGHT_API_PORT"
echo "  DB:         localhost:5432/hindsight"
echo "  Embeddings: local BAAI/bge-large-zh-v1.5 (1024-dim, zh+en)"
echo "  Reranker:   local BAAI/bge-reranker-large (zh+en)"

uv tool run hindsight-api
