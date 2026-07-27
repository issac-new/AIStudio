# Hindsight Local External Deployment Reference

> Current state as of 2026-06-15 on macOS (Hermes orchestrator profile)

## Architecture

```
Hermes Agent
  orchestrator     ──┐
  worker-coder     ──┤ memory.provider: hindsight
  worker-researcher ─┘ bank_id_template: hermes-{profile}
                        │ HTTP
                        ▼
                    Hindsight API v0.8.2
                      ├── LLM: DeepSeek deepseek-v4-flash
                      ├── Embeddings: local (sentence-transformers) fallback
                      ├── Reranker: local cross-encoder (cached ~/cache/hindsight-cross-encoder)
                      └── Database: pgvector/pgvector:pg16 (Docker, :5432)
```

## Bank Layout

| Profile | Bank ID | Purpose |
|---------|---------|---------|
| orchestrator | `hermes-orchestrator` | Orchestrator memories (7 facts) |
| worker-coder | `hermes-worker-coder` | Coding task memories (2 facts) |
| worker-researcher | `hermes-worker-researcher` | (created on first use) |

## Component Details

### Docker PostgreSQL
- Image: `pgvector/pgvector:pg16`
- Port: `5432`
- DB: `hindsight`, User: `hindsight`, Password: `hindsight_dev`
- Extension: pgvector

### Hindsight API
- Version: `0.8.2` from `hindsight-api-slim`
- Port: `8888`
- Installation: `uv tool install "hindsight-api-slim[embedded-db]==0.8.2"`
- Extra deps: `uv pip install --python ~/.local/share/uv/tools/hindsight-api-slim/bin/python sentence-transformers`

### Start Script
`~/.hermes/profiles/orchestrator/hindsight/start.sh`

### Embeddings

Ollama v0.30.8 proved incompatible — `/v1/embeddings` returns 501. Using
`local` provider with sentence-transformers instead. See provider matrix
for details on verified working embedding backends.

### Reranker
- Provider: `local` (sentence-transformers CrossEncoder)
- Model path: `~/.cache/hindsight-cross-encoder`
- Model source: `cross-encoder/ms-marco-MiniLM-L-6-v2` (~90MB)
- Note: GGUF-format reranker models (Ollama/LM Studio) are NOT supported

## API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/health` | Health check |
| GET | `/version` | Version info |
| GET | `/v1/default/banks` | List banks |
| POST | `/v1/default/banks/{bank_id}/memories` | Store memory (with entity extraction) |
| POST | `/v1/default/banks/{bank_id}/memories/recall` | Semantic recall (cross-encoder reranked) |
| POST | `/v1/default/banks/{bank_id}/memories/reflect` | LLM-powered synthesis |

## Migration History

2026-06-15: All 33 records migrated from `hermes` bank to `hermes-orchestrator`
using `SET session_replication_role = 'replica'` to bypass FK constraints
across 6 tables (memory_units, entities, chunks, documents, memory_links,
observation_history).

## Pitfalls Resolved

1. `***` in .env = literal three-asterisk password, not a placeholder
2. `openai_compatible` is not a valid Hindsight LLM provider
3. `sk-REDACTED-` keys need base_url `https://api.kimi.com/coding/v1`, not moonshot
4. Migration and main DB URLs use different drivers (asyncpg vs psycopg2)
5. `deepseek-v4-flash` is a reasoning model — output tokens include reasoning
6. HuggingFace models: HTTP fails for large files; use `git clone` + `git lfs pull`
7. Multiple restarts leave stale processes on port 8888; always kill first
8. Ollama v0.30.8 does not support `/v1/embeddings` (501 error)
9. GGUF reranker models not supported by hindsight-api-slim
