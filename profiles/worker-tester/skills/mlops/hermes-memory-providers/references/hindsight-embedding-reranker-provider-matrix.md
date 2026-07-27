# Hindsight Embedding & Reranker Provider Matrix

> Verified against hindsight-api-slim v0.8.2 source code (`create_embeddings_from_env` and `create_cross_encoder_from_env`).

## Embedding Providers

Configured via `HINDSIGHT_API_EMBEDDINGS_PROVIDER`.

| Provider | Key Env Vars | Best For |
|----------|-------------|----------|
| `local` | `HINDSIGHT_API_EMBEDDINGS_LOCAL_MODEL` (e.g. `BAAI/bge-small-en-v1.5`) | Offline, privacy-sensitive (needs sentence-transformers) |
| `openai` | `HINDSIGHT_API_EMBEDDINGS_OPENAI_BASE_URL`, `HINDSIGHT_API_EMBEDDINGS_OPENAI_MODEL`, `HINDSIGHT_API_EMBEDDINGS_OPENAI_API_KEY`, `HINDSIGHT_API_EMBEDDINGS_OPENAI_DIMENSIONS` (optional, ≤2000) | OpenAI API or any OpenAI-compatible endpoint (LM Studio, vLLM, SiliconFlow) |
| `onnx` | `HINDSIGHT_API_EMBEDDINGS_ONNX_MODEL_ID` / `_MODEL_PATH` | Low-latency CPU inference |
| `tei` | `HINDSIGHT_API_EMBEDDINGS_TEI_URL` | HuggingFace TEI server |
| `cohere` | `HINDSIGHT_API_EMBEDDINGS_COHERE_API_KEY` | Cohere API |
| `gemini` | `HINDSIGHT_API_EMBEDDINGS_GEMINI_API_KEY` | Google Vertex AI / Gemini |
| `litellm` | `HINDSIGHT_API_LITELLM_API_BASE`, `HINDSIGHT_API_EMBEDDINGS_LITELLM_MODEL` | LiteLLM proxy |
| `litellm-sdk` | `HINDSIGHT_API_EMBEDDINGS_LITELLM_SDK_API_KEY`, `_MODEL`, `_API_BASE` | Direct LiteLLM SDK |
| `openrouter` | `HINDSIGHT_API_EMBEDDINGS_OPENROUTER_API_KEY`, `_MODEL` | OpenRouter API |
| `zeroentropy` | `HINDSIGHT_API_EMBEDDINGS_ZEROENTROPY_API_KEY`, `_MODEL` | ZeroEntropy API |
| `openai-codex` | — | Codex OAuth (uses ~/.codex/auth.json) |

### Using Ollama for Embeddings

**⚠️ Ollama v0.30.8 does NOT support `/v1/embeddings`.** Verified: returns
`501 - {"error": {"message": "This server does not support embeddings. Start it with --embeddings"}}`
for all models. The `--embeddings` flag is also not available in this version.

**Root cause:** Ollama enables the embeddings API only for models whose GGUF
metadata has `general.type: "embed"` (not `"model"`). The `qwen3-embedding-8b`
GGUF conversion marks `general.type: "model"`, so Ollama treats it as a text
generation model and refuses the embeddings endpoint. Even native embedding
models converted to GGUF may lose their embedding type tag.

Diagnose a model's embed compatibility:
```bash
ollama show qwen3-embedding-8b:latest
# Check: model_info.general.type → should be "embed", not "model"
```

Only attempt this if you have verified your Ollama version supports the endpoint:

```bash
# First verify: this should return 200 with embedding data
curl -s http://localhost:11434/v1/embeddings \
  -d '{"model":"qwen3-embedding-8b:latest","input":"test"}' \
  -H "Content-Type: application/json"

# If it returns 501, Ollama doesn't support embeddings.
```

If supported:
```bash
export HINDSIGHT_API_EMBEDDINGS_PROVIDER=openai
export HINDSIGHT_API_EMBEDDINGS_OPENAI_BASE_URL=http://localhost:11434/v1
export HINDSIGHT_API_EMBEDDINGS_OPENAI_MODEL=qwen3-embedding-8b:latest
export HINDSIGHT_API_EMBEDDINGS_OPENAI_API_KEY=ollama
```

### Using LM Studio for Embeddings

LM Studio exposes an OpenAI-compatible `/v1/embeddings` endpoint (untested
with hindsight-api-slim). Requires an API token generated in
LM Studio → Developer → API Keys.

```bash
export HINDSIGHT_API_EMBEDDINGS_PROVIDER=openai
export HINDSIGHT_API_EMBEDDINGS_OPENAI_BASE_URL=http://localhost:1234/v1
export HINDSIGHT_API_EMBEDDINGS_OPENAI_MODEL=qwen3-embedding-8b
export HINDSIGHT_API_EMBEDDINGS_OPENAI_API_KEY=<lm-st...**Note:** The `CHERRY_LMSTUDIO_API_KEY` from Cherry Studio configs is NOT the
same as the LM Studio API token — they use different formats.

### Using SiliconFlow for Embeddings

SiliconFlow (`https://api.siliconflow.cn/v1`) provides OpenAI-compatible embeddings.
Use the `openai` provider:

```bash
export HINDSIGHT_API_EMBEDDINGS_PROVIDER=openai
export HINDSIGHT_API_EMBEDDINGS_OPENAI_BASE_URL=https://api.siliconflow.cn/v1
export HINDSIGHT_API_EMBEDDINGS_OPENAI_MODEL=BAAI/bge-m3
export HINDSIGHT_API_EMBEDDINGS_OPENAI_API_KEY=***
```

**⚠️ Model dimension limits:** SiliconFlow's `Qwen/Qwen3-Embedding-8B` produces
4096-dim vectors. pgvector v0.8.2 has a 2000-dim limit for HNSW/IVFFlat indexes.
The `dimensions` parameter is NOT supported for Qwen3-Embedding-8B (error code
20015). Always verify model output dimensions before configuring:

```bash
# Get actual dimension of any embedding model
curl -s https://api.siliconflow.cn/v1/embeddings \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SF_KEY" \
  -d '{"model":"BAAI/bge-m3","input":"test"}' | python3 -c \
  "import sys,json; d=json.load(sys.stdin); print(len(d['data'][0]['embedding']))"
```

**Safe ≤2000-dim models for SiliconFlow (with pgvector):**
| Model | Dims | Notes |
|-------|------|-------|
| `BAAI/bge-m3` | 1024 | Best multilingual, recommended default |
| `BAAI/bge-large-zh-v1.5` | 1024 | Chinese-optimized |
| `BAAI/bge-small-en-v1.5` | 384 | English only, lightweight |

### Dimension Truncation via OPENAI_DIMENSIONS

Set `HINDSIGHT_API_EMBEDDINGS_OPENAI_DIMENSIONS=<N>` to request truncated
dimensions from providers that support OpenAI's optional parameter. Test
before relying on this:

```bash
# Test truncation support (return code 20015 = unsupported)
curl -s -X POST $BASE_URL/embeddings \
  -H "Authorization: Bearer $KEY" \
  -d '{"model":"...","input":"test","dimensions":1024}'
```

Known working: OpenAI `text-embedding-3-*` models
Known broken: SiliconFlow `Qwen/Qwen3-Embedding-8B` (error 20015)

---

## Reranker Providers

Configured via `HINDSIGHT_API_RERANKER_PROVIDER`.

| Provider | Key Env Vars | Model Format | Quality | Notes |
|----------|-------------|-------------|---------|-------|
| `local` | `HINDSIGHT_API_RERANKER_LOCAL_MODEL` | PyTorch / safetensors (sentence-transformers CrossEncoder) | ★★★★★ | Needs `sentence-transformers`; model path or HF name |
| `tei` | `HINDSIGHT_API_RERANKER_TEI_URL` | TEI-compatible server | ★★★★★ | Remote TEI service |
| `flashrank` | `HINDSIGHT_API_RERANKER_FLASHRANK_MODEL` | Auto-downloaded (~50MB) | ★★★★ | No PyTorch needed, fast CPU |
| `cohere` | `HINDSIGHT_API_RERANKER_COHERE_API_KEY` | Cohere API | ★★★★★ | Paid API |
| `litellm` | `HINDSIGHT_API_RERANKER_LITELLM_API_BASE`, `_MODEL` | LiteLLM proxy models | ★★★★ | Requires LiteLLM proxy server |
| `litellm-sdk` | `HINDSIGHT_API_RERANKER_LITELLM_SDK_API_KEY`, `_MODEL`, `_API_BASE` | Provider-specific (e.g. `deepinfra/Qwen3-reranker-8B`) | ★★★★ | Direct SDK; supports DeepInfra, Together AI, HuggingFace APIs |
| `zeroentropy` | `HINDSIGHT_API_RERANKER_ZEROENTROPY_API_KEY` | ZeroEntropy API | ★★★★ | |
| `siliconflow` | `HINDSIGHT_API_RERANKER_SILICONFLOW_API_KEY` | SiliconFlow API | ★★★★ | |
| `google` | `HINDSIGHT_API_RERANKER_GOOGLE_PROJECT_ID` | Vertex AI | ★★★★★ | |
| `alibaba` | `HINDSIGHT_API_RERANKER_ALIBABA_API_KEY` | Alibaba Cloud | ★★★★ | |
| `openrouter` | `HINDSIGHT_API_RERANKER_OPENROUTER_API_KEY` | OpenRouter | ★★★ | Uses Cohere-like API internally |
| `rrf` | None | Algorithmic (no model) | ★★ | Works offline; no dependencies |
| `jina-mlx` | None (auto-downloads from HF) | MLX format (~0.6B) | ★★★★ | Apple Silicon only; `pip install mlx mlx-lm` |

## ❌ NOT Supported: Ollama & LM Studio as Reranker

**Neither Ollama nor LM Studio can serve as a reranker provider for Hindsight API.**

### Ollama
- Ollama has no `/v1/rerank` or `/api/rerank` endpoint (verified: returns 404)
- GGUF-format reranker models (e.g. `Qwen3-Reranker-8B-GGUF:Q8_0`) cannot be loaded by sentence-transformers (requires PyTorch/safetensors)
- The `openai` embedding provider works for embeddings only; there is no corresponding reranker path

### LM Studio
- LM Studio exposes `/v1/chat/completions` and `/v1/embeddings` but **no `/v1/rerank` endpoint**
- Same GGUF format compatibility issue as Ollama
- Requires API token authentication (configured in LM Studio UI → Developer → API Keys)

### Workarounds

| Goal | Solution |
|------|----------|
| No external dependencies | Use `rrf` — pure algorithmic, no model needed |
| Lightweight local reranker | Use `flashrank` — auto-downloads `ms-marco-MiniLM-L-12-v2` (~50MB) |
| Best quality local reranker | Use `local` with pre-downloaded cross-encoder model (see `hindsight-cross-encoder-download.md`) |
| API-based reranker | Use `cohere`, `siliconflow`, `deepinfra` via `litellm-sdk` |

## Local Reranker Model Path

When using `HINDSIGHT_API_RERANKER_PROVIDER=local` with a local cache path:

```bash
export HINDSIGHT_API_RERANKER_LOCAL_MODEL=/path/to/cross-encoder-model
```

The path must contain a **sentence-transformers compatible model**:
- `config.json` — model configuration
- `pytorch_model.bin` or `model.safetensors` — weights (~90MB for MiniLM-L-6-v2)
- `vocab.txt` or `tokenizer.json` — tokenizer files

The model is loaded via `sentence_transformers.CrossEncoder(model_name=path)`, so any HuggingFace cross-encoder model works as long as it's cached locally in the correct format.

To prepare a pre-downloaded model:
```bash
git clone --depth 1 https://hf-mirror.com/cross-encoder/ms-marco-MiniLM-L-6-v2 /tmp/model
cd /tmp/model && git lfs pull
mv /tmp/model ~/.cache/hindsight-cross-encoder
```
