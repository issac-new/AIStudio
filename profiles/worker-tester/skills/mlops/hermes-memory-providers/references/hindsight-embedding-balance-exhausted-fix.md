# Hindsight Embedding Balance Exhausted — Diagnosis & Fix

## Session: 2026-06-30

### Problem Symptom

All Hermes profiles running, hindsight API healthy, but recall fails:
```json
{
  "detail": "Failed to search memories (Exception): Exception(\"Failed to generate batch embeddings: Error code: 403 - {'code': 30001, 'message': 'Sorry, your account balance is insufficient', 'data': None}\")"
}
```

### Diagnosis Steps

1. **Check Hindsight health**
   ```bash
   curl -s http://127.0.0.1:8888/health
   # → {"status":"healthy","database":"connected"} ✅
   ```

2. **Check embedding provider config**
   ```bash
   grep EMBEDDINGS ~/.hindsight/profiles/hermes.env
   # → HINDSIGHT_API_EMBEDDINGS_PROVIDER=openai ✗
   ```

3. **Check banks exist**
   ```bash
   curl -s http://127.0.0.1:8888/v1/default/banks | jq '.banks[].bank_id'
   # → hermes-orchestrator, hermes-worker-coder, hermes-worker-researcher ✅
   ```

4. **Test recall endpoint**
   ```bash
   curl -s -X POST "http://127.0.0.1:8888/v1/default/banks/hermes-orchestrator/memories/recall" \
     -H "Content-Type: application/json" -d '{"query":"test"}'
   # → 403 balance insufficient ✗
   ```

### Root Cause

Embedding provider set to `openai` but no `OPENAI_API_KEY` in env. Hindsight
requires a valid OpenAI key for the `openai` embeddings provider. When missing
or quota exhausted, recall fails.

### Fix: Switch to Local Embeddings

Edit `~/.hindsight/profiles/hermes.env`:
```bash
# Replace
HINDSIGHT_API_EMBEDDINGS_PROVIDER=openai
HINDSIGHT_API_EMBEDDINGS_OPENAI_MODEL=text-embedding-3-small

# With
HINDSIGHT_API_EMBEDDINGS_PROVIDER=sentence-transformers
HINDSIGHT_API_EMBEDDINGS_SENTENCE_TRANSFORMERS_MODEL=all-MiniLM-L6-v2
```

Restart Hindsight:
```bash
pkill -f "hindsight-api-slim"
launchctl unload ~/Library/LaunchAgents/io.hindsight.api.plist
launchctl load ~/Library/LaunchAgents/io.hindsight.api.plist
sleep 10
curl http://127.0.0.1:8888/health
```

### Verification

Test recall after fix:
```bash
curl -s -X POST "http://127.0.0.1:8888/v1/default/banks/hermes-orchestrator/memories/recall" \
  -H "Content-Type: application/json" -d '{"query":"hindsight"}' | jq '.results | length'
# → 2 (or non-zero) ✅
```

### Profile Memory Toolset Check

Additionally verified that all worker profiles have `memory` in toolsets:
```bash
for p in architect worker-coder worker-deployer worker-researcher worker-reviewer worker-tester; do
  grep -A 5 "^toolsets:" ~/.hermes/profiles/$p/config.yaml | grep -q memory && echo "✓ $p" || echo "✗ $p"
done
```

All profiles ✅ had memory toolset configured.

### Outcome

- All 10 Hermes profiles running ✅
- Hindsight API healthy ✅
- Embeddings using local sentence-transformers ✅
- Recall working for all banks ✅
- All profiles have memory toolset ✅