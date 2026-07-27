# Hindsight HuggingFace Connectivity Guide

> Environment: Chinese network (`HF_ENDPOINT=https://hf-mirror.com`), macOS

## The Redirect Problem

When `HF_ENDPOINT=https://hf-mirror.com` is set, `hf-mirror.com` returns **HTTP 308 redirect** to `huggingface.co` for many model files. The `huggingface_hub` Python library does NOT properly follow this redirect chain for HEAD requests, resulting in `LocalEntryNotFoundError` even though the file exists and is downloadable:

```
huggingface_hub.errors.LocalEntryNotFoundError: An error happened while trying
to locate the file on the Hub and we cannot find the requested files in the local
cache. Please check your connection and try again.
```

This affects both `huggingface_hub.hf_hub_download()` and `sentence_transformers.SentenceTransformer()` when they need to download new models.

## Diagnosis

Verify whether the issue is network vs library:

```bash
# Check if the mirror is reachable — expect 308 redirect
curl -sI --max-time 10 https://hf-mirror.com/BAAI/bge-large-zh-v1.5/resolve/main/pytorch_model.bin
# → HTTP/2 308 → redirects to huggingface.co

# Check direct HuggingFace — expect 302 with download URL
curl -sI --max-time 10 https://huggingface.co/BAAI/bge-large-zh-v1.5/resolve/main/pytorch_model.bin
# → HTTP/2 302 → redirects to CDN download URL
```

If both return redirects (not connection errors), the network is fine but the redirect-follow logic in Python libraries is broken.

## Solutions

### Option A: Direct `curl` download (works)

The `curl` command properly follows redirects (with `-L`):

```bash
# Download directly from HuggingFace (slow but works, ~300KB/s)
curl -L --max-time 300 -o /tmp/model/pytorch_model.bin \
  "https://huggingface.co/BAAI/bge-large-zh-v1.5/resolve/main/pytorch_model.bin"
```

This is slow but reliable — download the model weights, then point `HINDSIGHT_API_EMBEDDINGS_LOCAL_MODEL` to the local path.

### Option B: Git LFS via mirror (best for large models)

```bash
git lfs install
git clone --depth 1 https://hf-mirror.com/BAAI/bge-large-zh-v1.5 /tmp/bge-large-zh
cd /tmp/bge-large-zh && git lfs pull
```

**Caveat**: `git lfs pull` may download nothing if LFS objects are already in pointer files. Verify with `ls -lh pytorch_model.bin` — should be ~1.3GB, not a few KB pointer file. If it's still a pointer, run `git lfs fetch --all` then `git checkout`.

### Option C: Use already-cached models

These models are fully cached and ready to use without any download:

| Model | Path | Size | Language |
|-------|------|------|----------|
| `BAAI/bge-small-en-v1.5` | HF cache | 33MB | English |
| `cross-encoder/ms-marco-MiniLM-L-6-v2` | `~/.cache/hindsight-cross-encoder` | 87MB | English |

Configure:
```bash
# Embeddings
export HINDSIGHT_API_EMBEDDINGS_PROVIDER=local
export HINDSIGHT_API_EMBEDDINGS_LOCAL_MODEL=BAAI/bge-small-en-v1.5

# Reranker
export HINDSIGHT_API_RERANKER_PROVIDER=local
export HINDSIGHT_API_RERANKER_LOCAL_MODEL=~/.cache/hindsight-cross-encoder
```

## Cached Models Quick Reference

To check which embedding/reranker models are fully cached:

```bash
# Check which models have actual weight files (>1MB)
for d in ~/.cache/huggingface/hub/models--*--*/; do
  name=$(basename "$d")
  files=$(find "$d" -type f \( -name "*.bin" -o -name "*.safetensors" \) -size +1M 2>/dev/null | head -1)
  if [ -n "$files" ]; then
    sz=$(ls -lh "$files" | awk '{print $5}')
    echo "✅ $name ($sz)"
  fi
done
```

## fallback_order For Embeddings (by reliability)

1. `local` with `BAAI/bge-small-en-v1.5` — always works (cached)
2. `local` with Chinese model — needs download (may fail in restricted networks)
3. `openai` with Ollama — works if Ollama version supports embeddings (v0.30.8 does NOT)
4. `openai` with LM Studio — works if API token is configured
