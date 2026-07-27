# Hindsight Cross-Encoder Model Download Workaround

> When `HF_ENDPOINT=https://hf-mirror.com` fails for cross-encoder models

## Problem

Hindsight's `HINDSIGHT_API_RERANKER_PROVIDER=local` downloads
`cross-encoder/ms-marco-MiniLM-L-6-v2` on startup. In Chinese networks,
`hf-mirror.com` hosts config files (small) but redirects model weights
(large) to `huggingface.co`, which times out.

## Solution: Git LFS via mirror's Git protocol

The mirror's Git protocol works even when HTTP downloads fail:

```bash
# 1. Clone repo (metadata only, fast - ~2s)
git clone --depth 1 https://hf-mirror.com/cross-encoder/ms-marco-MiniLM-L-6-v2 /tmp/cross-encoder-model

# 2. Pull LFS weights (uses Git protocol, ~3min for ~90MB model.safetensors)
cd /tmp/cross-encoder-model
git lfs pull

# 3. Copy to local persistent cache
cp -r /tmp/cross-encoder-model ~/.cache/hindsight-cross-encoder

# 4. Configure Hindsight to use local path
export HINDSIGHT_API_RERANKER_PROVIDER=local
export HINDSIGHT_API_RERANKER_LOCAL_MODEL=~/.cache/hindsight-cross-encoder
```

## Why This Works

| Method | Protocol | Result |
|--------|----------|--------|
| `HF_ENDPOINT=https://hf-mirror.com` + Python | HTTP → Redirect → huggingface.co | Timeout (firewall) |
| `curl -L` | HTTP → 308 → 307 → 302 → 200 | Slow, eventual 200 but data xfer fails |
| `git clone` + `git lfs pull` | Git protocol (smart HTTP) | Works (Git handles the mirror's CDN differently) |

## Verification

```bash
python3 -c "
from sentence_transformers import CrossEncoder
import time
start = time.time()
model = CrossEncoder('~/.cache/hindsight-cross-encoder')
print(f'Loaded in {time.time()-start:.1f}s')
scores = model.predict([('test query', 'test passage')])
print(f'Score: {scores}')
"
```

Expected: loaded in ~0.6s, score like `[-2.41]`.
