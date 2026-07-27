---
name: hermes-memory-providers
title: Hermes Memory Provider Deployment
description: >-
  Install, configure, and troubleshoot external memory backends (MemOS/memtensor,
  Hindsight, etc.) for Hermes Agent. Covers provider discovery, config wiring,
  daemon management, and common pitfalls for Local Embedded and Local External modes.
triggers:
  - "install memory"
  - "configure memory provider"
  - "setup hindsight"
  - "setup memos"
  - "memory provider deployment"
  - "change memory.provider"
  - "diagnose memory provider"
---

# Hermes Memory Provider Deployment

## Overview

Hermes Agent supports external memory providers via a plugin system. Providers
are discovered at startup from two locations:
1. **Built-in**: `hermes-agent/plugins/memory/<name>/` (bundled with source)
2. **User-installed**: `~/.hermes/plugins/<name>/` or `~/.hermes/profiles/<profile>/plugins/<name>/`

The active provider is set in `config.yaml`:
```yaml
memory:
  provider: hindsight    # or memtensor, honcho, mem0, etc.
  memory_enabled: true
  user_profile_enabled: true
```

Each provider may also need a plugin entry in:
```yaml
plugins:
  enabled:
    - hindsight
    - memtensor
```

## General Workflow

1. Install the provider's client library (`hindsight-client`, `memtensor`, etc.)
2. Set up the backend server (Docker, embedded daemon, or cloud API)
3. Configure `memory.provider` in Hermes config
4. Create provider-specific config file if needed
5. Start the backend daemon
6. Verify provider discovery via the Hermes memory system

## Provider: Hindsight (local_external)

### Install

```bash
# Install the API server as a uv tool
uv tool install "hindsight-api-slim[embedded-db]==0.8.2"

# Or use uvx for ephemeral runs
uvx hindsight-api@0.8.2 --daemon
```

### Docker PostgreSQL

```yaml
# docker-compose.mempalace.yml (from hindsight-mempalace fork)
services:
  db:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_DB: hindsight
      POSTGRES_USER: hindsight
      POSTGRES_PASSWORD: hindsight_dev   # default; omit .env to use this
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U hindsight"]
```

Or start standalone:
```bash
docker run -d \
  --name hindsight-pg \
  -e POSTGRES_DB=hindsight \
  -e POSTGRES_USER=hindsight \
  -e POSTGRES_PASSWORD=hindsight_dev \
  -p 5432:5432 \
  pgvector/pgvector:pg16
```

**⚠️ Password pitfall**: If using a `.env` file in the docker-compose directory,
ensure `DB_PASSWORD` is set to the actual password, not `***` (which is
interpreted as a literal three-asterisk password).

### Environment Variables

| Variable | Required | Value |
|----------|----------|-------|
| `HINDSIGHT_API_LLM_PROVIDER` | Yes | One of: `openai`, `groq`, `ollama`, `gemini`, `anthropic`, `lmstudio`, `llamacpp`, `vertexai`, `deepseek`, `litellm`, `openrouter` |
| `HINDSIGHT_API_LLM_API_KEY` | Yes | API key |
| `HINDSIGHT_API_LLM_MODEL` | Yes | e.g. `kimi-for-coding` |
| `HINDSIGHT_API_LLM_BASE_URL` | For custom APIs | e.g. `https://api.moonshot.cn/v1` |
| `HINDSIGHT_API_DATABASE_URL` | Yes | `postgresql://hindsight:hindsight_dev@localhost:5432/hindsight` |
| `HINDSIGHT_API_EMBEDDINGS_PROVIDER` | Yes | `openai`, `local`, or `onnx` |
| `HINDSIGHT_API_EMBEDDINGS_OPENAI_BASE_URL` | For Ollama | `http://localhost:11434/v1` — set this to use Ollama as embeddings backend |
| `HINDSIGHT_API_EMBEDDINGS_OPENAI_MODEL` | For Ollama | e.g. `qwen3-embedding-8b:latest` — the Ollama model name |
| `HINDSIGHT_API_EMBEDDINGS_OPENAI_API_KEY` | For Ollama | `ollama` (dummy key, Ollama doesn't check auth) |
| `HINDSIGHT_API_RERANKER_PROVIDER` | Yes | Local: `rrf` (recommended, no download) or `flashrank` or `local` (cross-encoder). API: `siliconflow` (needs `HINDSIGHT_API_RERANKER_SILICONFLOW_API_KEY`) or `cohere` |
| `HINDSIGHT_API_PORT` | No | Default: 8888 |
| `HINDSIGHT_ENABLE_API` | No | `true` |
| `HINDSIGHT_ENABLE_CP` | No | `false` |

### Critical: Reranker Provider

**DO NOT** use `HINDSIGHT_API_RERANKER_PROVIDER=local` without setting
`HINDSIGHT_API_RERANKER_LOCAL_MODEL` to a cached local path unless
HuggingFace is accessible. The local reranker downloads
`cross-encoder/ms-marco-MiniLM-L-6-v2` from HuggingFace on startup and will
crash if HF is unreachable. If you have a pre-downloaded model at a local
path, set `HINDSIGHT_API_RERANKER_LOCAL_MODEL=/path/to/model` — no HF
download needed.

Safe options:
- `rrf` — Reciprocal Rank Fusion, no model download (recommended)
- `flashrank` — lightweight local model
- `cohere` — uses Cohere API

### Critical: Embeddings Provider — avoid OpenAI balance traps

**`HINDSIGHT_API_EMBEDDINGS_PROVIDER=openai` requires a valid OpenAI API key
with sufficient balance.** If the key is missing or the account balance is
insufficient, ALL recall operations fail with:
```
"Failed to generate batch embeddings: Error code: 403 -
{'code': 30001, 'message': 'Sorry, your account balance is insufficient'}"
```

**Recommended default: `sentence-transformers` (free, local, no API key).**

```bash
# ~/.hindsight/profiles/hermes.env
HINDSIGHT_API_EMBEDDINGS_PROVIDER=sentence-transformers
HINDSIGHT_API_EMBEDDINGS_SENTENCE_TRANSFORMERS_MODEL=all-MiniLM-L6-v2
```

This model (~23MB) is cached in the HuggingFace Hub cache and works
immediately. No API keys, no balance, no network calls during recall.

**Config file location**: `~/.hindsight/profiles/hermes.env` — this is the
shared env file loaded by the Hindsight API launchd service (the launch.py
launcher in `~/.hermes/profiles/orchestrator/hindsight/launch.py` sources
this file).

**Apply fix (macOS launchd):**
```bash
# Edit hermes.env first, then:
launchctl unload ~/Library/LaunchAgents/io.hindsight.api.plist
launchctl load ~/Library/LaunchAgents/io.hindsight.api.plist
sleep 5 && curl -s http://127.0.0.1:8888/health
# → {"status":"healthy","database":"connected"}
```

**Verify recall works after switch:**
```bash
curl -s -X POST "http://127.0.0.1:8888/v1/default/banks/hermes-orchestrator/memories/recall" \
  -H "Content-Type: application/json" \
  -d '{"query":"test"}' | jq '.results | length'
# → Returns count (e.g., 83) — if 403/balance error, config not applied yet
```

**When OpenAI/SiliconFlow embeddings ARE needed** (e.g. higher quality
multilingual search), ensure the API key is set AND the account has balance
before switching providers. Test with the recall command above.

**Verify ALL profiles have memory toolset** — not just `memory.provider: hindsight`
in config.yaml. Each profile must also have `memory` in its `toolsets` list:

```bash
for p in orchestrator architect worker-coder worker-researcher worker-deployer worker-reviewer worker-tester project-manager requirement-analyst; do
  echo "=== $p ==="
  grep -A 5 "^toolsets:" ~/.hermes/profiles/$p/config.yaml 2>/dev/null | grep "memory" && echo "  ✅ memory toolset" || echo "  ❌ MISSING memory toolset"
done
```

### LLM Provider Support

**`openai_compatible` is NOT a valid Hindsight provider.** The supported
providers are: `openai`, `groq`, `ollama`, `ollama-cloud`, `gemini`, `anthropic`,
`lmstudio`, `llamacpp`, `vertexai`, `openai-codex`, `claude-code`, `mock`,
`none`, `minimax`, `deepseek`, `litellm`, `litellmrouter`, `bedrock`, `volcano`,
`openrouter`, `zai`, `opencode-go`, `fireworks`, `nous`.

Use `openai` with a custom `HINDSIGHT_API_LLM_BASE_URL` for any OpenAI-compatible API endpoint (e.g. Ollama at `http://localhost:11434/v1`, LM Studio at `http://localhost:1234/v1`).

## ⚠️ DeepSeek V4 Flash (reasoning model)

`deepseek-v4-flash` is a reasoning model that consumes tokens differently than
`deepseek-chat`. Output token counts include `reasoning_tokens`, meaning a
simple memory retain may show 700+ output tokens when <100 would be expected.
Test with at least `max_tokens=100` or the reasoning will consume the entire
token budget with no visible content left.

Configure as:
```bash
HINDSIGHT_API_LLM_PROVIDER=deepseek
HINDSIGHT_API_LLM_MODEL=deepseek-v4-flash
# base_url defaults to https://api.deepseek.com automatically
```

When switching from `deepseek-chat` to `deepseek-v4-flash`:
1. Update the start script or env vars
2. `lsof -ti:8888 | xargs kill -9`
3. Restart; no database migration needed

**Switching all Hermes profiles to a new model/backend:** Always update EVERY
profile — orchestrator, worker-coder, worker-researcher. A config change only
to the orchestrator profile leaves workers using the old setup.

## All-Profile Configuration

Hermes operates **9 profiles** (orchestrator + architect + project-manager +
requirement-analyst + worker-coder + worker-deployer + worker-researcher +
worker-reviewer + worker-tester). When making any change to memory backend,
**ALL 9 profiles must be updated**, not just the 3 that historically had
Hindsight configured.

**⚠️ Common gap (encountered in production)**: All 9 profiles had
`memory.provider: hindsight` and `hindsight` in plugins.enabled, but only 3
had `hindsight/config.json`. The other 6 silently fell back to cloud defaults
(no API key → empty recalls, no errors raised). Always audit ALL profiles for
the config file, not just the ones you know were set up. See
`references/worker-memory-provider-diagnostic.md` for the full 9-profile
audit checklist.

### Profile Wiring Checklist

Each profile needs ALL of the following for Hindsight to work:

| # | Component | Where | Example |
|---|-----------|-------|---------|
| 1 | `memory.provider: hindsight` | `config.yaml` | `provider: hindsight` |
| 2 | `hindsight` in `plugins.enabled` | `config.yaml` | `enabled: [hindsight, acp-client, ...]` |
| 3 | `hindsight/config.json` | `<profile>/hindsight/config.json` | See config below |
| 4 | `memory` in `toolsets` (worker profiles) | `config.yaml` | `toolsets: hermes-cli,acp,kanban,memory` |

**Common mistake:** Setting `memory.provider: hindsight` in config.yaml is NOT
sufficient. Without items 2-4 above, the profile will silently fall back to
default cloud mode with no API key — memory recalls will return empty and
retains will fail silently.

**Check all profiles at once:**
```bash
for p in orchestrator worker-coder worker-researcher; do
  echo "=== $p ==="
  grep -A2 '^memory:' ~/.hermes/profiles/$p/config.yaml | grep 'provider:' || echo "  ❌ MISSING provider"
  grep -A5 'enabled:' ~/.hermes/profiles/$p/config.yaml | grep -q 'hindsight' && echo "  ✅ hindsight plugin" || echo "  ❌ MISSING hindsight plugin"
  [ -f ~/.hermes/profiles/$p/hindsight/config.json ] && echo "  ✅ hindsight/config.json" || echo "  ❌ MISSING config"
  grep -q 'memory' ~/.hermes/profiles/$p/config.yaml && echo "  ✅ memory toolset" || echo "  ⚠️  check toolsets"
  echo
done
```

### Worker profiles need their OWN hindsight/config.json

**Workers DO NOT inherit the orchestrator's config.** The Hindsight client
resolves config by checking `$HERMES_HOME/hindsight/config.json`. For worker
profiles, `$HERMES_HOME` is `~/.hermes/profiles/worker-coder/`, NOT
`~/.hermes/profiles/orchestrator/`. If missing, Hindsight falls back to
`~/.hindsight/config.json` (shared legacy path, typically absent) then env vars
(defaulting to cloud mode with no configured API key).

Worker profiles also need `hindsight` in their `plugins.enabled` list —
the `hindsight` plugin must be registered at startup for the memory provider
to be discoverable. The plugin doesn't automatically enable just because
`memory.provider: hindsight` is set.

### Creating worker config.json

Copy the orchestrator's config to **ALL** profiles (not just worker-coder and
worker-researcher — also architect, project-manager, requirement-analyst,
worker-deployer, worker-reviewer, worker-tester):

```bash
for p in architect project-manager requirement-analyst \
         worker-coder worker-deployer worker-researcher \
         worker-reviewer worker-tester; do
  mkdir -p ~/.hermes/profiles/$p/hindsight
  cp ~/.hermes/profiles/orchestrator/hindsight/config.json ~/.hermes/profiles/$p/hindsight/
done
```

The `bank_id_template: hermes-{profile}` ensures each profile gets its own
isolated bank automatically. No need to manually set different bank IDs.

### Multi-User Bank Isolation

When the Hindsight API serves **multiple users** (e.g., team members on
different machines connecting to the same API instance), the default
`hermes-{profile}` template does NOT isolate by user — all users sharing
the `orchestrator` profile see the same `hermes-orchestrator` bank.

Switch to `hermes-{user}-{profile}` in ALL 9 profiles' `hindsight/config.json`:

```json
{
  "bank_id_template": "hermes-{user}-{profile}"
}
```

**⚠️ The `{user}` value is NOT a bare username from the message body.** It
comes from the Matrix event's `sender` field — a full MXID like
`@testuser1:matrix.org`. The `_sanitize_bank_segment()` function
(`__init__.py:562`) replaces `@` and `:` with `-`, so the actual bank_id is
`hermes-testuser1-matrix-org-orchestrator`, NOT `hermes-testuser1-orchestrator`.

The full source chain (5 files):
1. `plugins/platforms/matrix/adapter.py:2584` — `sender = str(getattr(event, "sender", ""))`
2. `plugins/platforms/matrix/adapter.py:2820` — `self.build_source(user_id=sender, ...)`
3. `gateway/platforms/base.py:5683` — `SessionSource(user_id=sender, ...)`
4. `agent/agent_init.py:1482` — `_init_kwargs["user_id"] = agent._user_id`
5. `plugins/memory/hindsight/__init__.py:1289` — `_resolve_bank_id_template(user=self._user_id, ...)`

The TUI sessions with no user collapse to the old format
(`hermes--orchestrator` → `hermes-orchestrator`), so existing banks and
historical data remain accessible — **fully backwards compatible**.

| Source | {user} raw | After sanitization | Resolved bank_id |
|--------|-----------|-------------------|------------------|
| TUI (no user) | `""` | `""` → collapses | `hermes-orchestrator` |
| Matrix testuser1 | `@testuser1:matrix.org` | `testuser1-matrix-org` | `hermes-testuser1-matrix-org-orchestrator` |
| Telegram | `123456789` | `123456789` | `hermes-123456789-orchestrator` |

**When to use**: one Hindsight API serving agents accessed by multiple users.
**When NOT to use**: single-user machine — `hermes-{profile}` is sufficient.

**API verification**: Use `urllib.request` inside `execute_code` — do NOT
use `curl ... | python3` (Hermes security scanner blocks pipe-to-interpreter).

➡️ Full isolation guide with source chain + verification code:
`references/bank-isolation.md` in the `hermes-agent-migration` skill.

### Verifying banks via API

After config is in place, verify that each profile's bank exists:

```bash
curl -s http://localhost:8888/v1/default/banks | python3 -c \
  "import sys,json; d=json.load(sys.stdin); print([b['bank_id'] for b in d.get('banks',[])])"
```

Expected: `['hermes-architect', 'hermes-orchestrator', 'hermes-project-manager',
'hindsight-requirement-analyst', 'hermes-worker-coder', 'hermes-worker-deployer',
'hindsight-worker-researcher', 'hermes-worker-reviewer', 'hermes-worker-tester']`
(9 profile banks + possibly `hermes-default` from early testing)

Banks are auto-created on first memory write — if a bank is missing, run a
test retain from that profile or write directly via API:

```bash
curl -s -X POST "http://localhost:8888/v1/default/banks/hermes-worker-researcher/memories" \
  -H "Content-Type: application/json" \
  -d '{"items":[{"content":"Bank initialization"}]}'
```

```yaml
# ~/.hermes/profiles/orchestrator/config.yaml
memory:
  provider: hindsight
  memory_enabled: true

# ~/.hermes/profiles/worker-coder/config.yaml
memory:
  provider: hindsight
  memory_enabled: true

# ~/.hermes/profiles/worker-researcher/config.yaml
memory:
  provider: hindsight
  memory_enabled: true
```

Worker profiles take effect on next kanban dispatch. Current orchestrator
session needs a new Hermes session to pick up the config change.

### ⚠️ Toolsets check: worker profiles need `memory` in toolsets

Setting `memory.provider: hindsight` in a profile's config.yaml is NOT
sufficient — the profile must also have `memory` in its `toolsets` list,
otherwise the hindsight tools (`hindsight_recall`, `hindsight_retain`, etc.)
will not be available to the agent running under that profile.

Check and fix:
```bash
# Verify each profile has 'memory' in toolsets
for p in ~/.hermes/profiles/*/; do
  name=$(basename $p)
  toolsets=$(grep -A5 'toolsets:' "$p/config.yaml" | grep -v 'toolsets:' | head -1)
  echo "$name: $toolsets"
done

# Add memory toolset (if missing)
hermes config set toolsets "hermes-cli,acp,kanban,memory" --profile worker-coder
hermes config set toolsets "hermes-cli,acp,kanban,memory" --profile worker-researcher
```

## Bank Isolation via bank_id_template

By default all profiles share one bank (e.g., "hermes"). To isolate memory per
profile:

```json
{
  "bank_id": "hermes",
  "bank_id_template": "hermes-{profile}"
}
```

Supported template placeholders:
- `{profile}` — profile name (orchestrator, worker-coder, etc.)
- `{workspace}` — workspace identifier
- `{platform}` — platform (cli, telegram, etc.)
- `{user}` — user identity (gateway sessions)
- `{session}` — session ID

**For multi-user Hindsight** (one API serving agents accessed by multiple
users): use `hermes-{user}-{profile}` instead of `hermes-{profile}`. This
prevents cross-user memory leakage. TUI sessions collapse to the old format
(backwards compatible). See "Multi-User Bank Isolation" above.

When switching from a shared bank to template-based isolation, existing memory
data must be migrated to the new bank(s). See `references/bank-migration.md`
for the FK-safe migration procedure.

## ⚠️ Hacking Hindsight Embeddings on a Budget

When the configured embedding provider (OpenAI, SiliconFlow, etc.) requires an
API key or charges for usage, switch to a free local embedding provider:

### Quick Fallback: Local Sentence-Transformers

Edit `~/.hindsight/profiles/hermes.env`:

```bash
# Replace OPENAI/SiliconFlow configs with:
HINDSIGHT_API_EMBEDDINGS_PROVIDER=sentence-transformers
HINDSIGHT_API_EMBEDDINGS_SENTENCE_TRANSFORMERS_MODEL=all-MiniLM-L6-v2
```

**No API keys or downloads required** — `all-MiniLM-L6-v2` (~23MB) is cached
in the HuggingFace Hub and works immediately.

**Testing recall after config change:**

```bash
# Health check
curl -s http://127.0.0.1:8888/health
# → {"status":"healthy","database":"connected"}

# Recall test (semantic search)
curl -s -X POST "http://127.0.0.1:8888/v1/default/banks/hermes-orchestrator/memories/recall" \
  -H "Content-Type: application/json" \
  -d '{"query":"test"}' | jq '.results | length'
# → Returns count of matching memories (e.g., 83)
```

**Restart via launchd (macOS):**

```bash
launchctl unload ~/Library/LaunchAgents/io.hindsight.api.plist
launchctl load ~/Library/LaunchAgents/io.hindsight.api.plist
sleep 5 && curl -s http://127.0.0.1:8888/health
```

If the API server was started manually (not via launchd), kill and restart:

```bash
pkill -f "hindsight-api-slim"
# Then start via launchd or manual process
```

### Deep Links

- **Sentence-transformers config**: `references/hindsight-embeddings-local.md`
- **Cross-encoder reranker**: for rerankers use `flashrank` (no download) or
  `rrf` (offline, no model)

---

## Installing sentence-transformers for local cross-encoder

The `uv tool install` for hindsight-api-slim does NOT include transformers or
sentence-transformers. Install them separately:

```bash
uv pip install --python ~/.local/share/uv/tools/hindsight-api-slim/bin/python \
  sentence-transformers
```

## Cross-Encoder Model Download (when HTTP fails)

The `cross-encoder/ms-marco-MiniLM-L-6-v2` model used by
`HINDSIGHT_API_RERANKER_PROVIDER=local` is ~90MB. In networks where HuggingFace
HTTP downloads time out, use Git LFS via the mirror:

```bash
git lfs install
git clone --depth 1 https://hf-mirror.com/cross-encoder/ms-marco-MiniLM-L-6-v2 /tmp/model
cd /tmp/model && git lfs pull
cp -r /tmp/model ~/.cache/hindsight-cross-encoder
```

Then configure:
```bash
export HINDSIGHT_API_RERANKER_PROVIDER=local
export HINDSIGHT_API_RERANKER_LOCAL_MODEL=~/.cache/hindsight-cross-encoder
```

### ⚠️ Kimi Code API Key Base URL

**`sk-REDACTED-` prefixed API keys require a specific base URL.** Do NOT use
`https://api.moonshot.cn/v1` or `https://api.moonshot.ai/v1`. These will return
401. The correct endpoint is:

```bash
HINDSIGHT_API_LLM_API_KEY=sk-REDACTED-...
HINDSIGHT_API_LLM_BASE_URL=https://api.kimi.com/coding/v1
```

This is because Hermes' `_resolve_kimi_base_url()` function auto-redirects
`sk-REDACTED-` keys to `api.kimi.com/coding`. The same logic must be applied
manually when configuring external tools that use the same key.

### ⚠️ Environment Variable Masking

When using `***` in environment variable values, know that **`***` is literal
text**, not a placeholder that gets auto-replaced. This causes two common bugs:

1. **Docker .env files**: `DB_PASSWORD=***` in `.env` sets the literal password
   to `***`. Use the actual password or omit the variable to fall back to the
   default (e.g., `hindsight_dev` for the MemPalace docker-compose).

2. **Shell background commands**: Writing `HINDSIGHT_API_LLM_API_KEY=***` in
   a background process sets the variable to the literal string `***`.
   Always read the key from a file or pass it via a start script.

### ⚠️ Database Migration URL

Hindsight needs a separate `HINDSIGHT_API_MIGRATION_DATABASE_URL` for Alembic
migrations (uses `psycopg2` driver, not `asyncpg`). If the password has special
chars, ensure both URLs match:

```bash
export HINDSIGHT_API_DATABASE_URL="postgresql://hindsight:hindsight_dev@localhost:5432/hindsight"
export HINDSIGHT_API_MIGRATION_DATABASE_URL="postgresql+psycopg2://hindsight:hindsight_dev@127.0.0.1:5432/hindsight"
```

### Embeddings via Ollama / LM Studio (OpenAI-compatible API)

**⚠️ Ollama v0.30.8 does NOT support `/v1/embeddings`.** The endpoint returns
`501 - "This server does not support embeddings"` for all models. The
`--embeddings` flag referenced in the error message is also unavailable in
v0.30.8. Only use the `openai` provider for Ollama if you have verified
embeddings work in your Ollama version — otherwise fall back to `local`.

When it DOES work (e.g. LM Studio, newer Ollama), configure:

```bash
# Ollama (verify embeddings endpoint works first!)
export HINDSIGHT_API_EMBEDDINGS_PROVIDER=openai
export HINDSIGHT_API_EMBEDDINGS_OPENAI_BASE_URL=http://localhost:11434/v1
export HINDSIGHT_API_EMBEDDINGS_OPENAI_MODEL=qwen3-embedding-8b:latest
export HINDSIGHT_API_EMBEDDINGS_OPENAI_API_KEY=ollama  # dummy key

# LM Studio (requires API token)
export HINDSIGHT_API_EMBEDDINGS_PROVIDER=openai
export HINDSIGHT_API_EMBEDDINGS_OPENAI_BASE_URL=http://localhost:1234/v1
export HINDSIGHT_API_EMBEDDINGS_OPENAI_MODEL=qwen3-embedding-8b
export HINDSIGHT_API_EMBEDDINGS_OPENAI_API_KEY=<lm-studio-token>
```

**LM Studio token note:** LM Studio generates its own API tokens (Settings →
Developer → API Keys). The `CHERRY_LMSTUDIO_API_KEY` from Cherry Studio is NOT
compatible — different format.

**⚠️ Reranker: Neither Ollama nor LM Studio support rerankers.**
Hindsight API's reranker providers use sentence-transformers (PyTorch), LiteLLM,
or API-based backends — none of which can load GGUF-format models. Both platforms
have NO `/v1/rerank` endpoint. Use `flashrank`, `local` (sentence-transformers
cross-encoder), or `rrf` instead.

### Provider Matrix Reference

For a complete listing of all supported embedding and reranker providers,
their required env vars, format compatibility, and verified Ollama/LM Studio
limitations, see:

➡️ `references/hindsight-embedding-reranker-provider-matrix.md`

### ⚠️ Local ZH+EN Models (Recommended for Chinese+English)

For bilingual (Chinese + English) environments, use **BAAI/bge-large-zh-v1.5**
(Embedding, 1024-dim, 1.2G) and **BAAI/bge-reranker-large** (Reranker, 2.1G).
Both rank #1 on C-MTEB and support Chinese natively.

Download via `sentence-transformers` (uses HF Hub, set `HF_ENDPOINT` for China):

```bash
export HF_ENDPOINT=https://hf-mirror.com
PYBIN=~/.local/share/uv/tools/hindsight-api-slim/bin/python

# Embedding model
$PYBIN -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('BAAI/bge-large-zh-v1.5')"

# Reranker model
$PYBIN -c "from sentence_transformers import CrossEncoder; CrossEncoder('BAAI/bge-reranker-large')"
```

Configure Hindsight to use them **locally** (no API dependency):

```bash
# Embedding: local BAAI/bge-large-zh-v1.5 (1024-dim, ZH+EN, C-MTEB #1)
export HINDSIGHT_API_EMBEDDINGS_PROVIDER=local
export HINDSIGHT_API_EMBEDDINGS_LOCAL_MODEL=BAAI/bge-large-zh-v1.5
export HINDSIGHT_API_EMBEDDINGS_LOCAL_FORCE_CPU=false
export HINDSIGHT_API_EMBEDDINGS_LOCAL_TRUST_REMOTE_CODE=false

# Reranker: local BAAI/bge-reranker-large (ZH+EN, C-MTEB #1)
export HINDSIGHT_API_RERANKER_PROVIDER=local
export HINDSIGHT_API_RERANKER_LOCAL_MODEL=BAAI/bge-reranker-large
export HINDSIGHT_API_RERANKER_LOCAL_FORCE_CPU=false
export HINDSIGHT_API_RERANKER_LOCAL_FP16=true  # faster on MPS/CUDA
```

**For offline deployment**, set `EMBEDDINGS_LOCAL_MODEL` and `RERANKER_LOCAL_MODEL`
to **local directory paths** (not HF model IDs) so no download is attempted:

```bash
export HINDSIGHT_API_EMBEDDINGS_LOCAL_MODEL="/path/to/model/embedding"
export HINDSIGHT_API_RERANKER_LOCAL_MODEL="/path/to/model/reranker"
```

**Model file extraction from HF Hub cache**: HF stores models as `blobs/` +
`snapshots/` symlinks. To copy the actual files (dereferenced) into a flat
directory for packaging, use `cp -RL`:

```bash
SNAPSHOT=~/.cache/huggingface/hub/models--BAAI--bge-large-zh-v1.5/snapshots/*/
cp -RL "$SNAPSHOT"/* /dest/model/embedding/
# Verify: ls -lh /dest/model/embedding/ should show ~1.2G model.safetensors
```

**⚠️ bge-large-zh-v1.5 dual-snapshot pitfall**: This model's HF cache may split
files across two snapshot directories — `model.safetensors` in one, config/tokenizer
in another. After `snapshot_download()`, check BOTH snapshots and merge files
into a single flat directory.

**Verify model loads correctly before packaging**:

```bash
$PYBIN -c "
from sentence_transformers import SentenceTransformer, CrossEncoder
e = SentenceTransformer('BAAI/bge-large-zh-v1.5')
print(f'Embedding dim: {e.get_embedding_dimension()}')  # 1024
r = CrossEncoder('BAAI/bge-reranker-large')
print(f'Reranker score: {r.predict([(\"测试\", \"test\")])}')  # ~1.0
"
```

**pgvector dimension check**: bge-large-zh-v1.5 produces 1024-dim vectors,
well within the pgvector 2000-dim HNSW/IVFFlat limit. No dimension truncation needed.

### HuggingFace Access in Chinese Networks

Set `HF_ENDPOINT=https://hf-mirror.com` when the local embedding provider
needs to download models from HuggingFace. Without this, `sentence-transformers`
downloading will fail with connection errors to `huggingface.co`.

**Quick-start default:** `BAAI/bge-small-en-v1.5` (33MB, English-only) is
reliably cached in the HuggingFace Hub cache and works immediately without
any download. Set:
```bash
export HINDSIGHT_API_EMBEDDINGS_PROVIDER=local
export HINDSIGHT_API_EMBEDDINGS_LOCAL_MODEL=BAAI/bge-small-en-v1.5
```

**⚠️ hf-mirror.com 308 redirect → huggingface_hub failure:** The mirror
returns an HTTP 308 redirect to `huggingface.co` for many model files. The
`huggingface_hub` Python library does NOT properly follow this redirect chain,
raising `LocalEntryNotFoundError` even when the file is accessible.

Workaround: use `curl -L` for direct downloads, or Git LFS via the mirror's
Git protocol. See `references/hindsight-hf-connectivity.md` for the full
diagnosis guide, workarounds, and a list of pre-cached models that work
without any network access.

```bash
export HF_ENDPOINT=https://hf-mirror.com
export HINDSIGHT_API_EMBEDDINGS_PROVIDER=local  # downloads BGE-small-en-v1.5
```

**⚠️ Cross-encoder models may fail via HTTP even with the mirror.**
The `cross-encoder/ms-marco-MiniLM-L-6-v2` model (~90MB safetensors) is not
hosted on `hf-mirror.com` and HTTP requests get redirected to `huggingface.co`,
which times out. Workaround: use Git LFS via the mirror's Git protocol:

```bash
git clone --depth 1 https://hf-mirror.com/cross-encoder/ms-marco-MiniLM-L-6-v2 /tmp/cross-encoder-model
cd /tmp/cross-encoder-model
git lfs pull
cp -r /tmp/cross-encoder-model /path/to/local/cache
```

Then configure Hindsight to use the local path:
```bash
export HINDSIGHT_API_RERANKER_PROVIDER=local
export HINDSIGHT_API_RERANKER_LOCAL_MODEL=/path/to/local/cache
```

### Embeddings via SiliconFlow (OpenAI-compatible API)

SiliconFlow provides an OpenAI-compatible API at `https://api.siliconflow.cn/v1`.
Use the `openai` provider:

```bash
export HINDSIGHT_API_EMBEDDINGS_PROVIDER=openai
export HINDSIGHT_API_EMBEDDINGS_OPENAI_BASE_URL=https://api.siliconflow.cn/v1
export HINDSIGHT_API_EMBEDDINGS_OPENAI_MODEL=BAAI/bge-m3       # 1024-dim, multilingual
export HINDSIGHT_API_EMBEDDINGS_OPENAI_API_KEY="<your-api-key>"
```

**⚠️ pgvector dimension limit:** Most SiliconFlow embedding models produce
≥1024-dim vectors (up to 4096 for Qwen3-Embedding-8B). pgvector v0.8.2's
HNSW/IVFFlat indexes have a **2000-dimension hard limit** — models exceeding
this cannot be used. See the pgvector dimension limits section below.

### Reranker via SiliconFlow (native provider)

SiliconFlow supports a native reranker API via the built-in `siliconflow` provider:

```bash
export HINDSIGHT_API_RERANKER_PROVIDER=siliconflow
export HINDSIGHT_API_RERANKER_SILICONFLOW_API_KEY="<your-api-key>"
export HINDSIGHT_API_RERANKER_SILICONFLOW_MODEL=Qwen/Qwen3-Reranker-8B
export HINDSIGHT_API_RERANKER_SILICONFLOW_BASE_URL=https://api.siliconflow.cn/v1
```

Defaults: model=`BAAI/bge-reranker-v2-m3`, base_url=`https://api.siliconflow.cn/v1`.

### ⚠️ pgvector Dimension Limits

**pgvector v0.8.2 (shipped with `pgvector/pgvector:pg16`) has a 2000-dimension
hard limit for BOTH HNSW and IVFFlat indexes.** Any embedding model producing
>2000-dim vectors will cause startup failure:

| Index Type | Error | Limit |
|-----------|-------|-------|
| HNSW | `exceeds pgvector HNSW index limit of 2000` | 2000 |
| IVFFlat | `column cannot have more than 2000 dimensions for ivfflat index` | 2000 |

**Solutions (in order of preference):**
1. **Use a ≤2000-dim model** (e.g. `BAAI/bge-m3` at 1024-dim) — simplest
2. **Use `HINDSIGHT_API_EMBEDDINGS_OPENAI_DIMENSIONS`** to truncate dimensions — only works if the API provider supports OpenAI's optional `dimensions` parameter (test first; SiliconFlow Qwen3-Embedding-8B returns error code 20015)
3. **Upgrade pgvector** to v1.0+ (raises limit to 4000) — requires rebuilding Docker image
4. **Switch vector extension** to `vchord` or `pgvectorscale` — requires installing the extension in the PostgreSQL instance

**Dimension truncation test:**
```bash
curl -s https://api.siliconflow.cn/v1/embeddings \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <key>" \
  -d '{"model":"Qwen/Qwen3-Embedding-8B","input":"test","dimensions":1024}'
# Returns embedding with 1024 dims if supported; error code 20015 if not
```

**Recommended ≤2000-dim models for SiliconFlow:**
| Model | Dims | Language |
|-------|------|----------|
| `BAAI/bge-m3` | 1024 | Multilingual (CN+EN) |
| `BAAI/bge-large-zh-v1.5` | 1024 | Chinese-optimized |
| `BAAI/bge-small-en-v1.5` | 384 | English only |

**Model dimension verification:**
```bash
curl -s https://api.siliconflow.cn/v1/embeddings \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <key>" \
  -d '{"model":"BAAI/bge-m3","input":"test"}' | python3 -c "import sys,json; d=json.load(sys.stdin); print('dim:', len(d['data'][0]['embedding']))"
```
|----------|---------|-------------|-------|
| `local` (bge-reranker-large) | ★★★★★ Highest | 2.1G model + sentence-transformers | ZH+EN, C-MTEB #1; pre-download via HF mirror |
| `local` (cross-encoder/ms-marco-MiniLM-L-6-v2) | ★★★★ High | ~90MB model + sentence-transformers | English only; use git LFS workaround in restricted networks |
| `flashrank` | ★★★★ High | ~50MB (auto-downloads on first use) | `uv pip install --python ~/.local/share/uv/tools/hindsight-api-slim/bin/python flashrank` |
| `rrf` | ★★ Algorithmic | None | Works offline, no model download |

**GGUF / Ollama reranker models are NOT supported.** Hindsight API does not have
an Ollama reranker provider. GGUF-format reranker models cannot be loaded by
sentence-transformers or flashrank. Ollama itself does not expose an
OpenAI-compatible `/v1/rerank` endpoint (verified: returns 404 on
Ollama v0.5.x). Use one of the providers above.

FlashRank config:
```bash
export HINDSIGHT_API_RERANKER_PROVIDER=flashrank
export HINDSIGHT_API_RERANKER_FLASHRANK_MODEL=ms-marco-MiniLM-L-12-v2
```

Cross-encoder with local model path:
```bash
export HINDSIGHT_API_RERANKER_PROVIDER=local
export HINDSIGHT_API_RERANKER_LOCAL_MODEL=/path/to/local/cross-encoder
```

### Background Process Lifecycle

When starting Hindsight via `terminal(background=true)`, the process is tied to
the Hermes terminal session. Using `process(action="wait", timeout=N)` will
**SIGTERM the process** when the timeout expires, even if the process is running
fine. Use `process(action="log")` and `process(action="poll")` for monitoring.

**Preferred start pattern:**

```bash
# start.sh should use exec to replace the shell process
exec ./start.sh

# In Hermes:
terminal(background=true, command="cd /path && exec ./start.sh", notify_on_complete=true)
# then check health with a separate terminal() call
```

**Direct env-var injection in background commands is fragile.** Variables with
special characters (API keys, URLs with `***` placeholders) can cause silent
startup failures. Always use a start script that reads from `.env`:

```bash
# ✓ Good: start.sh reads from .env
DS_KEY=$(grep ^DEEPSEEK_API_KEY /path/.env | head -1 | cut -d= -f2-)

# ✗ Bad: inline env vars in background command
# HINDSIGHT_API_LLM_API_KEY="***"  ← literal ***, not the real key
```

### Git LFS: Model Directory May Look Complete But Weights Are Missing

A model directory cloned from HuggingFace via Git LFS may appear to have all
files (config.json, tokenizer files, etc.) but the actual weight file
(`pytorch_model.bin` or `model.safetensors`) may be a **LFS pointer file**
(~100 bytes) instead of the actual multi-MB model weights.

Verify:
```bash
# Check if the model file is a real weight file or an LFS pointer
ls -lh /path/to/model/pytorch_model.bin
# If size is ~100 bytes, it's an LFS pointer — not actual weights

# Check Git LFS status
cd /path/to/model && git lfs ls-files
# If objects are listed, LFS is tracking them but files may not be checked out

# Fix: pull LFS objects
cd /path/to/model && git lfs install && git lfs pull
```

**Common scenario:** `git clone --depth 1` from hf-mirror.com followed by
`git lfs pull` may silently fail (LFS objects not mirrored). In that case,
use `curl -L` or direct HuggingFace download instead. See
`references/hindsight-hf-connectivity.md` for full diagnosis guide.

The only reliably pre-cached model files on this machine:
- `BAAI/bge-small-en-v1.5` (33MB, English-only embedding) — fully cached in HF Hub
- `cross-encoder/ms-marco-MiniLM-L-6-v2` (90MB, reranker) — fully cached at
  `~/.cache/hindsight-cross-encoder`

### Port Conflicts

Multiple restarts can leave stale Hindsight API processes on port 8888. Always
kill the old process before starting a new one:

```bash
lsof -ti:8888 | xargs kill -9 2>/dev/null
```

### Hermes Config

```bash
mkdir -p ~/.hermes/profiles/<profile>/hindsight
```

`hindsight/config.json`:
```json
{
  "mode": "local_external",
  "api_url": "http://localhost:8888",
  "bank_id": "hermes",
  "recall_budget": "mid",
  "auto_recall": true,
  "auto_retain": true,
  "retain_async": true,
  "retain_every_n_turns": 1,
  "memory_mode": "hybrid",
  "recall_types": "observation",
  "recall_max_tokens": 4096,
  "bank_id_template": "hermes-{profile}"
}
```

For multi-user environments, change `bank_id_template` to
`hermes-{user}-{profile}` — see "Multi-User Bank Isolation" above.

### Start Server

Create a start script (`~/.hermes/profiles/<profile>/hindsight/start.sh`):

```bash
#!/bin/bash
DS_KEY=$(grep ^DEEPSEEK_API_KEY /path/to/.env | head -1 | cut -d= -f2-)

export HINDSIGHT_API_LLM_PROVIDER=deepseek
export HINDSIGHT_API_LLM_API_KEY="$DS_KEY"
export HINDSIGHT_API_LLM_MODEL=deepseek-v4-flash
export HINDSIGHT_API_DATABASE_URL="postgresql://hindsight:hindsight_dev@localhost:5432/hindsight"
export HINDSIGHT_API_MIGRATION_DATABASE_URL="postgresql+psycopg2://hindsight:hindsight_dev@127.0.0.1:5432/hindsight"
export HINDSIGHT_API_HOST=0.0.0.0
export HINDSIGHT_API_PORT=8888
export HINDSIGHT_API_LOG_LEVEL=info
export HINDSIGHT_API_EMBEDDINGS_PROVIDER=local
export HINDSIGHT_API_RERANKER_PROVIDER=flashrank
export HINDSIGHT_API_RUN_MIGRATIONS=true
export HF_ENDPOINT=https://hf-mirror.com

uv tool run hindsight-api
```

**⚠️ Database password in start.sh**: Never write `hindsight:***@localhost` in the
`DATABASE_URL` — the `***` is literal text, not a placeholder. The Docker PostgreSQL
container sets `POSTGRES_PASSWORD: hindsight_dev`, so the URL must use the real
password `hindsight:hindsight_dev@localhost`. If the password is masked as `***`,
Hindsight will crash on startup with `password authentication failed for user
"hindsight"`. This pitfall also applies to the `MIGRATION_DATABASE_URL`.

**This bug was encountered in production**: the `start.sh` file had
`postgresql://hindsight:***@localhost:5432/hindsight` (copied from a display
where `***` masked the password). Hindsight crashed with
`password authentication failed for user "hindsight"` on every restart. Fix:
change `***` to `hindsight_dev` in both `DATABASE_URL` and
`MIGRATION_DATABASE_URL`, then `launchctl unload/load` the plist.

**When packaging for migration**: Sanitize `start.sh` paths (replace
`/Users/xxx` with `$HOME`/`$HERMES_HOME`), but keep the real DB password
`hindsight_dev` — it's a Docker default, not a secret.

Run with:
```bash
chmod +x start.sh && ./start.sh
```

### Auto-Start: macOS launchd

For boot-time auto-start on macOS, use a `launchd` plist + Python launcher wrapper
that (1) reads secrets from `.env`, (2) resolves shell command substitutions from
`start.sh` (e.g. `$(grep ^DEEPSEEK_API_KEY ...)`→ real key), (3) ensures the
PostgreSQL Docker container is running, and (4) execs the Hindsight API.

**⚠️ Background-process env-var injection pitfall:** Passing env vars inline in
`terminal(background=true)` is fragile — the Hermes terminal tool's `***` display
mask can leak into the child's env as literal `***`. Always use a launcher script
that reads from `.env` at runtime, OR use the Python launcher below which resolves
all `$()` shell substitutions programmatically.

#### Step 1: Python Launcher

Save as `launch.py` in the same directory as `start.sh`:

```python
#!/usr/bin/env python3
"""Launch Hindsight API with env vars from start.sh and .env"""
import os, re, sys, subprocess, time
from pathlib import Path

HERE = Path(__file__).parent.resolve()
PROFILE = HERE.parent
DOT_ENV = PROFILE / ".env"
START_SH = HERE / "start.sh"

def _resolve(val: str, env: dict) -> str:
    def _sub(m): return env.get(m.group(1) or m.group(2), "")
    return re.sub(r'\$\{(\w+)\}|\$(\w+)', _sub, val)

# 1) Load .env
env = dict(os.environ)
if DOT_ENV.exists():
    for line in DOT_ENV.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line: continue
        k, v = line.split("=", 1)
        env.setdefault(k.strip(), v.strip())

# 2) Parse start.sh — handle both KEY=VALUE and export KEY=VALUE
with open(START_SH) as f:
    for line in f:
        line = line.strip()
        if not line or line.startswith("#"): continue
        raw = line.removeprefix("export ")
        if "=" not in raw: continue
        k, _, val = raw.partition("=")
        k, val = k.strip(), val.strip("\"'")
        if val.startswith("$("):
            # Resolve $(grep ^KEY ...) by looking up the key in parsed env
            m = re.search(r'grep\s+\^?(\w+)', val.strip("$()"))
            val = env.get(m.group(1), "") if m else ""
        else:
            val = _resolve(val, env)
        env[k] = val

# 3) Ensure PostgreSQL Docker container is running
def _ensure_db():
    try:
        r = subprocess.run(["docker","ps","--filter","name=hindsight-db-1",
                           "--format","{{.Status}}"], capture_output=True, text=True, timeout=10)
        if "healthy" in r.stdout or "Up" in r.stdout: return True
    except: pass
    for candidate in [HERE / "docker-compose.mempalace.yml",
                      Path.home() / "hindsight-mempalace/docker-compose.mempalace.yml"]:
        if candidate.exists():
            subprocess.run(["docker","compose","-f","docker-compose.mempalace.yml",
                          "up","-d","db"], cwd=candidate.parent, timeout=60)
            for _ in range(30):
                time.sleep(2)
                r = subprocess.run(["docker","ps","--filter","name=hindsight-db-1",
                                   "--format","{{.Status}}"], capture_output=True, text=True, timeout=5)
                if "healthy" in r.stdout: return True
            break
    return False
_ensure_db()

# 4) Find the hindsight-api python tool
for p in [Path.home()/".local/share/uv/tools/hindsight-api-slim/bin/python",
          Path.home()/".local/share/uv/tools/hindsight-api-slim/bin/python3"]:
    if p.exists(): python = str(p); break
else:
    print("hindsight-api tool not found", file=sys.stderr); sys.exit(1)

os.execve(python, [python, "-c", "from hindsight_api.main import main; main()"], env)
```

#### Step 2: Set Docker Desktop to auto-start

```bash
defaults write com.docker.docker AutoStart -bool true
```

#### Step 3: Create launchd plist

Save as `~/Library/LaunchAgents/io.hindsight.api.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>io.hindsight.api</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/bin/python3</string>
        <string>~/.hermes/profiles/orchestrator/hindsight/launch.py</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <dict>
        <key>SuccessfulExit</key>
        <false/>
        <key>CrashedLastExit</key>
        <true/>
    </dict>
    <key>WorkingDirectory</key>
    <string>~/.hermes/profiles/orchestrator/hindsight</string>
    <key>StandardOutPath</key>
    <string>/tmp/hindsight-api.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/hindsight-api.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:~/.local/bin</string>
        <key>HOME</key>
        <string>~</string>
    </dict>
    <key>ThrottleInterval</key>
    <integer>10</integer>
</dict>
</plist>
```

Adjust paths for your username. Key settings:
- `RunAtLoad` + `KeepAlive` — restarts on crash, but NOT on successful exit
- `PATH` includes `/opt/homebrew/bin` (for `uv`), `/Users/<you>/.local/bin` (for `docker`)
- `ThrottleInterval: 10` — wait 10s before restarting on crash (prevents restart loops)

#### Step 4: Load and verify

```bash
# Unload if previously loaded
launchctl bootout gui/$(id -u)/io.hindsight.api 2>/dev/null || true

# Load
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/io.hindsight.api.plist

# Verify state
launchctl print gui/$(id -u)/io.hindsight.api | grep state

# Wait for startup (includes Docker check + migrations)
sleep 45
curl http://localhost:8888/health
# → {"status":"healthy","database":"connected"}
```

#### Boot-time startup chain

```
macOS boot → Docker Desktop (Login Item) → launchd → launch.py
  ├─ reads .env + start.sh → resolves env vars
  ├─ checks hindsight-db-1 → starts if not running (docker compose up -d db)
  └─ exec → uv tool's python → Hindsight API on :8888
```

### Verify

```bash
# Health check
curl -s http://localhost:8888/health
# Expected: {"status":"healthy","database":"connected"}

# Store a memory
curl -s -X POST "http://localhost:8888/v1/default/banks/hermes/memories" \
  -H "Content-Type: application/json" \
  -d '{"items":[{"content":"Test memory"}]}'
# Expected: {"success":true,...} with token usage

# Semantic recall
curl -s -X POST "http://localhost:8888/v1/default/banks/hermes/memories/recall" \
  -H "Content-Type: application/json" \
  -d '{"query":"test","limit":5}'
# Expected: {"results":[...]}

## Provider: MemOS / memtensor

### Install

```bash
git clone --depth 1 https://github.com/MemTensor/MemOS.git
cd MemOS/apps/memos-local-plugin
bash install.sh
```

### Critical: _plugin_root() Path Bug

The memtensor adapter's `daemon_manager.py` contains a bug in `_plugin_root()`
that returns the wrong path when the memtensor dir is separate from
`memos-local-plugin`. **Must patch** this function to search for the
`memos-local-plugin` directory (see `references/memtensor-plugin-root-patch.md`).

## Offline Deployment Package (Docker + Local Models + Scripts)

For deploying Hindsight on a machine without internet access (or restricted
access), build a self-contained package with Docker image + **both local model
weights** (Embedding + Reranker) + start scripts.

➡️ **Full build + deploy guide**: `references/hindsight-offline-deployment.md`
➡️ **Windows PowerShell start script** (local ZH+EN models): `templates/start-hindsight.ps1`
➡️ **Bash/Git Bash start script** (local ZH+EN models): `templates/start-hindsight.sh`

Package contents (2.7GB total):
- `pgvector-pg16.tar` — Docker image, loaded via `docker load` (147MB)
- `model/embedding/` — BAAI/bge-large-zh-v1.5 safetensors + tokenizer (1.2G, 1024-dim, ZH+EN)
- `model/reranker/` — BAAI/bge-reranker-large safetensors + tokenizer (2.1G, ZH+EN)
- `docker-compose.yml` — PostgreSQL container orchestration
- `scripts/` — Platform-specific start scripts that read API keys from `.env`

**Key insight**: Both Embedding and Reranker run **fully local** from disk — no
SiliconFlow/HuggingFace download needed. Only the LLM (DeepSeek) uses an online
API. This is the recommended config for Chinese+English environments, as both
models rank #1 on C-MTEB.

## Reference Files

- `references/hindsight-embeddings-local.md` — local embedding fallback when OpenAI/SiliconFlow balance exhausted
- `references/hindsight-offline-deployment.md` — **offline package: Docker image + model weights + start scripts for no-internet deploy**
- `references/gateway-vs-api-server.md` — Gateway architecture, API Server module, and how to disable HTTP listening for worker profiles (each profile runs its own Gateway but only orchestrator needs API Server port)
- `references/worker-memory-provider-diagnostic.md` — checklist and fix recipe for worker profiles that have `memory.provider: hindsight` configured but silently lack backend config
- `references/hindsight-hf-connectivity.md` — HuggingFace download workarounds for Chinese networks
- `references/bank-migration.md` — FK-safe bank migration procedure
- `references/memtensor-plugin-root-patch.md` — MemOS path fix
- `references/hindsight-local-external-deployment.md` — deployment session detail
- `references/hindsight-cross-encoder-download.md` — cross-encoder model download
- `references/hindsight-deployment-session-20260615.md` — deployment session detail
- `references/hindsight-embedding-reranker-provider-matrix.md` — provider compatibility matrix

### Directory Setup

```bash
mkdir -p ~/.hermes/plugins/memtensor
cp -r memos-local-plugin/adapters/hermes/memos_provider/* ~/.hermes/plugins/memtensor/
cp memos-local-plugin/adapters/hermes/plugin.yaml ~/.hermes/plugins/memtensor/
```

For profile setups, also copy to profile:
```bash
cp -r ~/.hermes/plugins/memtensor ~/.hermes/profiles/<profile>/plugins/
cp -r ~/.hermes/plugins/memos-local-plugin ~/.hermes/profiles/<profile>/plugins/
cp -r ~/.hermes/memos-plugin ~/.hermes/profiles/<profile>/
```

### Bridge Daemon

```bash
export MEMOS_HOME="$HOME/.hermes/profiles/<profile>/memos-plugin"
export HERMES_HOME="$HOME/.hermes/profiles/<profile>"
nohup node "$HERMES_HOME/plugins/memos-local-plugin/dist/bridge.cjs" \
  --agent=hermes --daemon > /tmp/memos-bridge.log 2>&1 &
```

### LLM Config

Edit `memos-plugin/config.yaml`:
```yaml
llm:
  provider: openai_compatible
  apiKey: "YOUR_API_KEY"
  model: "kimi-for-coding"
```

### Hermes Config

```yaml
memory:
  provider: memtensor
  memory_enabled: true
  user_profile_enabled: true

plugins:
  enabled:
    - memtensor
```

## Troubleshooting

### Provider not discovered
- Check plugin.yaml exists in `~/.hermes/plugins/<name>/`
- Check `__init__.py` contains a MemoryProvider subclass
- Restart Hermes session (discovery happens at import time)

### is_available() returns False
- Missing client library (`hindsight-client`, etc.)
- Bridge daemon not running (memtensor)
- API server not responding (hindsight)
- Wrong config file path or format

### Hindsight API crashes on startup
- **`hindsight_client` module not found (`No module named 'hindsight_client'`)** even though hindsight daemon (`hindsight-api`) is running fine on port 8888. This happens when the Hermes Desktop Runtime Python does not have the `hindsight-client` pip package installed. Even if `hindsight_client` exists in another Python environment (e.g. pipx, conda), Hermes uses its own bundled Python:
  ```bash
  ~/.hermes-web-ui/desktop-runtime/hermes/0.16.0/mac-arm64/python/bin/pip3 install hindsight-client
  ```
  The `hindsight_client_api` package (from pipx) is NOT sufficient — Hermes imports `hindsight_client` specifically.
- **Port in use**: `[Errno 48] address already in use` → kill old process:
  `lsof -ti:8888 | xargs kill -9`
- **Migration failed**: `password authentication failed` → check both
  `HINDSIGHT_API_DATABASE_URL` AND `HINDSIGHT_API_MIGRATION_DATABASE_URL`
  use the correct password. They use different drivers (asyncpg vs psycopg2).
- **LLM key not set**: Environment variable contains literal `***` instead of
  the real key. Read the key from a file, don't hardcode it.
- **Embedding model download fails**: Set `HF_ENDPOINT=https://hf-mirror.com`
  for Chinese networks, or use `openai` embeddings provider (including
  pointing to local Ollama via `HINDSIGHT_API_EMBEDDINGS_OPENAI_BASE_URL`).
- **Ollama embedding returns 501 "This server does not support embeddings":**
  Ollama v0.30.8 does NOT support `/v1/embeddings` or `/api/embeddings`. The
  `--embeddings` flag is also unavailable. **Root cause:** The model's GGUF
  metadata has `general.type: "model"` instead of `"embed"` — Ollama only
  enables embeddings for models tagged as embedding type. Diagnose with
  `ollama show <model>` and check `model_info.general.type`.
  Workaround: use `local` provider with sentence-transformers instead of the
  `openai` provider pointing at Ollama. Update and restart Ollama if a newer
  version is available.
- **Ollama embedding requires API key**: Hindsight requires an API key even
  even when using Ollama. Set `HINDSIGHT_API_EMBEDDINGS_OPENAI_API_KEY=ollama`
  (any non-empty value works — Ollama does not check the key).
- **Reranker download fails**: Use `rrf` instead of `local` to skip the
  cross-encoder model download.

### Hindsight retains fail with "AuthenticationError"
Even if startup succeeds with "Connection verified", the retain endpoint may
return authentication errors if the LLM API key has hit its rate limit.
- Kimi Code: returns 429 when free quota exhausted (key `sk-REDACTED-...`)
- Check actual token usage in the retain response's `usage` field
- Switch to a different provider (DeepSeek works reliably)

### Hindsight retains succeed but output_tokens are unexpectedly high
For reasoning models like `deepseek-v4-flash`, output token counts include
`reasoning_tokens`. A short memory retain may show 700+ output tokens when
<100 would be expected for the content alone. This is normal — the reasoning
tokens are counted in the usage but the actual content is small.

### DeepSeek model returns empty content on test calls
`deepseek-v4-flash` is a reasoning model. If max_tokens is too small, all
the token budget may be consumed by reasoning with nothing left for visible
content. Use at least `max_tokens=100` in test calls, or switch to
`deepseek-chat` which doesn't use reasoning tokens.

### Switching providers
- Update `memory.provider` in config.yaml
- Remove old provider from `plugins.enabled` if no longer needed
- Each provider stores config at `~/.hermes/profiles/<profile>/<provider-name>/`
