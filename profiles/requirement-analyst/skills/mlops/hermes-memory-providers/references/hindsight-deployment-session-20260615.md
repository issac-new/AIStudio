# Hindsight Deployment — Session 2026-06-15

## Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| API Server | `uv tool run hindsight-api` (hindsight-api-slim) | 0.8.2 |
| Database | Docker pgvector/pgvector:pg16 | pg16 |
| LLM | DeepSeek V4 Flash | deepseek-v4-flash |
| Embeddings | Local (BGE-small-en-v1.5, 384d) | via sentence-transformers on MPS |
| Reranker | FlashRank → upgraded to local cross-encoder | ms-marco-MiniLM-L-12-v2 → L-6-v2 |
| Provider | Hermes built-in `hindsight` | local_external mode |

## Key Decisions

### Why `uv tool install` instead of Docker
Building the hindsight-api-slim Docker image from source required PyTorch and
transformers — took >10min with no success. The `uv tool install` approach
resolves Python deps directly and avoids Docker build overhead. The tool
installation was done as `hindsight-api-slim[embedded-db]` which includes
pg0-embedded support. Later, `sentence-transformers` was added via
`uv pip install --python <tool-python> sentence-transformers` when the
local cross-encoder reranker was needed.

### Why FlashRank first, then local cross-encoder
- **RRF** (initial choice) — no ML model, algorithmic only. Works offline.
- **FlashRank** (upgrade) — lightweight neural reranker, auto-downloads model.
  Installed via `uv pip install ... flashrank`.
- **Local cross-encoder** (final) — best quality. Required git LFS workaround
  for HuggingFace model download.

### Why DeepSeek V4 Flash
The Kimi Code API key (`sk-REDACTED-...`) was rate-limited (429). DeepSeek
(`sk-REDACTED`) was already configured in the .env and worked reliably.
`deepseek-v4-flash` was chosen over `deepseek-chat` for the reasoning
capabilities, at the cost of higher output-token counts due to reasoning tokens.

## Model Switch Sequence (all profiles)

1. Update `config.yaml`: `model.default=deepseek-v4-flash`, `model.provider=deepseek`
2. Update `profiles/worker-coder/config.yaml` and `profiles/worker-researcher/config.yaml`
3. Update `memos-plugin/config.yaml`: `llm.apiKey=deepseek-key`, `llm.model=deepseek-chat`, `llm.base_url=https://api.deepseek.com/v1`
4. Update `hindsight/start.sh`: `HINDSIGHT_API_LLM_MODEL=deepseek-v4-flash`
5. Restart Hindsight API: `lsof -ti:8888 | xargs kill -9 && ./start.sh`
6. Restart MemOS bridge: `kill $(pgrep -f bridge.cjs)` then relaunch
