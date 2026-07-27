# Memory Provider Deployment (Quick Reference)

> Absorbed from `memory-provider-deployment`. Complementary deployment guidance for MemOS and Hindsight providers. The primary skill (`hermes-memory-providers`) covers full detail.

## Architecture

```
Hermes Agent → memory.provider: memtensor | hindsight
  → Local Plugin (MemOS): Node bridge + SQLite via bridge.cjs
  → External Server (Hindsight): API server + Docker PostgreSQL
```

## Key Pitfalls Not Fully Covered in Primary Skill

### Background Process Lifecycle
Hindsight started via `terminal(background=true)` is attached to the tool lifecycle — when the session ends, the process gets SIGTERM.
```bash
# ✅ Decouple from session
nohup ./start.sh > /tmp/hindsight.log 2>&1 &
```

### Port Cleanup (Two-Step)
```bash
# ❌ Compound command kills the new process too
lsof -ti:8888 | xargs kill -9 && ./start.sh
# ✅ Separate steps
lsof -ti:8888 | xargs kill -9 && sleep 2 && ./start.sh
```

### MemOS _plugin_root() Path Bug
Patch `daemon_manager.py::_plugin_root()` to find `memos-local-plugin` dir.

### Hindsight Reranker Selection
| Provider | Quality | Download | Notes |
|----------|---------|----------|-------|
| `local` | Best | ~400MB cross-encoder | May fail behind Chinese firewall |
| `flashrank` | Good | ~50MB ONNX | Best practical choice offline |
| `rrf` | Basic | 0 (algorithm) | Fallback, no download |

### Bank Migration (FK-Safe)
```sql
SET session_replication_role = 'replica';
UPDATE documents SET bank_id = 'new-bank' WHERE bank_id = 'old-bank';
UPDATE memory_units SET bank_id = 'new-bank' WHERE bank_id = 'old-bank';
-- ... all other bank_id tables ...
SET session_replication_role = 'origin';
```

### Model-Switching Verification
When switching ALL profiles to a new model, verify:
```
~/.hermes/profiles/{orchestrator,worker-coder,worker-researcher}/config.yaml
~/.hermes/profiles/{orchestrator,worker-coder,worker-researcher}/hindsight/start.sh
~/.hermes/profiles/{orchestrator,worker-coder,worker-researcher}/.env
```
