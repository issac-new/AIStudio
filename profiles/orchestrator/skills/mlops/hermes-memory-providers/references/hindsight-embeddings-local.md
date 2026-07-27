# Hindsight Embeddings: Local Fallback

## Problem

Hindsight recall fails with an embedding-provider error such as:
```
"Failed to generate batch embeddings: Error code: 403 - {'code': 30001, 'message': 'Sorry, your account balance is insufficient'}"
```

This indicates the configured embeddings provider (OpenAI, SiliconFlow, etc.)
cannot be used — either due to missing API key, exhausted quota, or network
restrictions.

## Solution: Switch to Local Sentence-Transformers

Edit the Hindsight environment file (`~/.hindsight/profiles/hermes.env`) and
replace the embedding provider configuration:

```bash
# Before (requires API key, may fail due to balance/quota)
HINDSIGHT_API_EMBEDDINGS_PROVIDER=openai
HINDSIGHT_API_EMBEDDINGS_OPENAI_MODEL=text-embedding-3-small

# After (free, local, no API key)
HINDSIGHT_API_EMBEDDINGS_PROVIDER=sentence-transformers
HINDSIGHT_API_EMBEDDINGS_SENTENCE_TRANSFORMERS_MODEL=all-MiniLM-L6-v2
```

**Why `all-MiniLM-L6-v2`?**
- ~23MB model, reliably cached in HuggingFace Hub
- No download required in most environments
- Fast inference, good quality for semantic search
- Works offline after first use

## Apply the Change

1. Edit `~/.hindsight/profiles/hermes.env` with the new provider settings
2. Restart Hindsight API:
   ```bash
   pkill -f "hindsight-api-slim"
   launchctl load ~/Library/LaunchAgents/io.hindsight.api.plist
   ```
3. Wait for startup (includes DB migrations):
   ```bash
   sleep 10 && curl http://127.0.0.1:8888/health
   # → {"status":"healthy","database":"connected"}
   ```
4. Test recall:
   ```bash
   curl -s -X POST "http://127.0.0.1:8888/v1/default/banks/hermes-orchestrator/memories/recall" \
     -H "Content-Type: application/json" \
     -d '{"query":"test"}' | jq '.results | length'
   # → non-zero count if bank has data
   ```

## Alternative Models

If `all-MiniLM-L6-v2` is not cached or you need multilingual support:

| Model | Size | Notes |
|-------|------|-------|
| `BAAI/bge-small-en-v1.5` | 33MB | English-only, very fast |
| `BAAI/bge-m3` | ~500MB | Multilingual (CN+EN), 1024-dim |
| `sentence-transformers/all-mpnet-base-v2` | 420MB | High quality, general purpose |

Set via:
```bash
HINDSIGHT_API_EMBEDDINGS_SENTENCE_TRANSFORMERS_MODEL=BAAI/bge-small-en-v1.5
```

## Reranker Note

The reranker (`HINDSIGHT_API_RERANKER_PROVIDER`) is **separate** from embeddings.
If the reranker also fails to download models, switch to a no-download option:

```bash
HINDSIGHT_API_RERANKER_PROVIDER=rrf  # Reciprocal Rank Fusion, offline
# or
HINDSIGHT_API_RERANKER_PROVIDER=flashrank  # lightweight local model
```

## Related

- `references/hindsight-embedding-reranker-provider-matrix.md` — full provider matrix
- `references/hindsight-hf-connectivity.md` — HuggingFace download workarounds
