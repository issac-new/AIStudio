---
name: hindsight-model-configuration
description: "Change Hindsight LLM, embedding, reranker models."
version: 1.0.0
author: orchestrator
license: MIT
platforms: [macos, linux]
metadata:
  hermes:
    tags: [hindsight, memory, model-routing, local-models, cc-switch]
---

# Hindsight Model Configuration & Operations

Hindsight (the `hindsight-api` service backing Hermes memory) has **three independent model roles**, each configurable separately. This skill covers how to route, select, start, and debug them. For *bank topology* (shared vs per-profile, bank_id templates) see the sibling skill `hindsight-bank-strategy`.

## When to use

- User asks to change which LLM / embedding / reranker model Hindsight uses.
- User reports Hindsight memory errors, 400s from the LLM, or memory bloat.
- User asks whether Hindsight models are resident, or why startup is slow.
- User asks about MPS / GPU acceleration for Hindsight.
- After a cc-switch / provider change that should also flow through to Hindsight.

## The three roles

| Role | What it does | Typical config | Cost model |
|------|-------------|----------------|------------|
| **LLM** | Fact extraction on retain; synthesis on reflect; consolidation deltas | Remote API (cc-switch / DAMOXING / OpenAI-compatible) | Per-token |
| **Embedding** | Vector encoding for semantic recall | Local SentenceTransformer (BAAI/bge-large-zh-v1.5, 1024-dim) | ~2.4 GB resident |
| **Reranker** | Cross-encoder re-scoring of recall candidates | Local CrossEncoder (BAAI/bge-reranker-large) | ~2.1 GB resident |

Config files:
- `~/.hermes/profiles/<profile>/hindsight/config.json` — bank_id, recall budget, mode.
- `~/.hermes/profiles/<profile>/hindsight/start.sh` — **all model env vars live here**. This is what you edit to change models.

## Changing the LLM backend

The LLM is controlled by `HINDSIGHT_API_LLM_*` env vars in `start.sh`. Pattern for routing through a proxy/queue:

```bash
export HINDSIGHT_API_LLM_PROVIDER=openai
export HINDSIGHT_API_LLM_API_KEY="PROXY_MANAGED"   # or real key; cc-switch ignores it
export HINDSIGHT_API_LLM_MODEL=glm-5.2
export HINDSIGHT_API_LLM_BASE_URL="http://127.0.0.1:15721/v1"
```

### 🔴 Pitfall: cc-switch + temperature rejection

When routing through **cc-switch**, the queue may land `glm-5.2` on an upstream that rejects explicit temperature values other than `1` (observed: HKimi / Kimi K3 returns `400 invalid temperature: only 1 is allowed`). Hindsight's defaults are retain=0.1, reflect=0.9 — both get rejected.

**Fix**: set `HINDSIGHT_API_LLM_TEMPERATURE=none`. The `none` sentinel makes Hindsight omit the temperature parameter entirely so the upstream uses its own default. This is robust across queue rotation (any upstream accepts an omitted temperature).

```bash
export HINDSIGHT_API_LLM_TEMPERATURE=none
```

Source: `hindsight_api/config.py` `_TEMPERATURE_OMIT_VALUES = {"", "none", "default", "off", "unset"}`. Per-operation overrides also exist (`HINDSIGHT_API_LLM_TEMPERATURE_RETAIN`, `_REFLECT`, `_VERIFICATION`, `_CONSOLIDATION`).

This is NOT needed for direct DAMOXING/OpenAI connections — only for queues that proxy to strict upstreams.

## Local embedding / reranker

Controlled by `HINDSIGHT_API_EMBEDDINGS_*` and `HINDSIGHT_API_RERANKER_*` env vars. Current production setup (verified in production):

```bash
export HINDSIGHT_API_EMBEDDINGS_PROVIDER=local
export HINDSIGHT_API_EMBEDDINGS_LOCAL_MODEL="BAAI/bge-large-zh-v1.5"
export HINDSIGHT_API_RERANKER_PROVIDER=local
export HINDSIGHT_API_RERANKER_LOCAL_MODEL="BAAI/bge-reranker-large"
export HINDSIGHT_API_RERANKER_LOCAL_FP16=true
```

### Key behavior: models are resident, not lazy

- Both models load **eagerly at startup** (source: `low_cpu_mem_usage=False to prevent lazy loading`). They stay in process memory for the lifetime of the service — no per-request load, no idle unload.
- Total RSS footprint ≈ **3.7 GB** (model weights + Python/torch runtime), held constantly.
- Benefit: low recall latency (no model reload). Cost: fixed memory + slow restart.
- FP16 flag exists for reranker but the embedding path does not expose a quantization toggle; if memory is tight the only lever is a smaller model (bge-base ≈ 0.5G, bge-small ≈ 0.1G) at a quality cost.

### MPS state (updated 2026-09-27): ENABLED with source-level inference lock

MPS is now **enabled in production** (`FORCE_CPU=false` for both models), after a source patch fixed the real crash root cause. History and current state:

1. **Crash root cause (found 2026-09-27, NOT dual-model)**: torch 2.14 MPS backend is not thread-safe for concurrent command-buffer submission. Isolation experiments proved a SINGLE model + 4 inference threads aborts with Metal assertions (`AGXG13XFamilyCommandBuffer tryCoalescing` / `IOGPUMetalCommandBuffer setCurrentCommandEncoder`) in <90s. The reranker ThreadPool(max_workers=4) + concurrent embeds was the trigger. 95 crashes / 248 launchd restarts observed.
2. **Fix**: process-wide MPS inference lock — `engine/__init__.py::get_mps_inference_lock()` (single `threading.Lock`), held around `LocalSTEmbeddings.encode` and `LocalSTCrossEncoder._predict_sync` when model device is `mps`. CPU path untouched. Patch + pre-patch backups + apply script: `workspace/patches/hindsight-mps-lock-20260927/` (README has full data). Re-apply after any `uv tool install --force hindsight-api-slim` upgrade.
3. **Verified**: 10-min stress (3 embed + 4 rerank concurrent loops, production call paths) — zero assertions, zero crashes. Throughput MPS vs CPU: embed 2.3x (1718ms vs 4029ms p50 b16), rerank 2.5x (1905ms vs 4777ms p24). Production recall 2.63s vs 14.2s before (5.4x).
4. **Known residual risk — MPSGraph RSS leak**: per-shape MPSGraph compilation cache leaks without eviction under variable-length inference (pytorch#181213 / #164299 / #182815 proposing `torch.mps.invalidate_graph_cache()`, not shipped as of torch 2.14). Watch RSS: `ps -o rss= -p $(lsof -tiTCP:8888 -sTCP:LISTEN)`. If RSS creeps toward ~20 GB again, the lock does NOT fix that — mitigation is periodic scheduled restart or falling back to CPU until upstream ships the cache-invalidation API.
5. Third-party local models in other processes (e.g. laya) are process-isolated at the Metal level — coexistence is safe; the lock only concerns threads INSIDE the hindsight process.

**⚠️ Retired guidance (superseded)**: the earlier blanket rule "do NOT enable MPS" conflated the thread-unsafety crash (fixed by the lock) with the RSS leak (still real, monitored). MPS is now the default for performance; the leak is the only open item.

## Consolidation 批量调优（2026-10-02 token 审计落地）

`HINDSIGHT_API_CONSOLIDATION_LLM_BATCH_SIZE`（默认 8）是 Hindsight token 消耗的最大杠杆：每条 LLM call 只装 8 条 fact，固定模板 overhead 被摊在天量调用上（实测 [已移除] 多 bank 场景 3,081 calls/天 × 7.4k input = 22.9M tokens/日，占 Hindsight 总消耗 90%）。调到 32 后调用数 -75%，事实覆盖不变（单批 32×256tok 源事实 + 模板 ≈ 10k input，仍在 flash 队列舒适区）。配套 `HINDSIGHT_API_CONSOLIDATION_MAX_MEMORIES_PER_ROUND=128` 对齐批大小倍数减少尾批。**消耗驱动链**：documents（整段 Matrix 会话 retain）→ memory_units 日增 ~4k → consolidation 连锁；评估消耗先查 `llm_requests` 按 scope 分布（consolidation vs retain_extract_facts），别只看总量。改后必须重启 launchd（env 单次读取），验证口径 = 次日同表 consolidation 调用数降到 ~1/4。

## Startup / restart procedure

Restart is required after any `start.sh` change (Hindsight reads env vars once at launch).

```bash
# 1. Find and kill the running SERVER (python child), not the bash/uv wrapper
lsof -nP -iTCP:8888 -sTCP:LISTEN   # get the python PID
kill <python_pid>

# 2. Confirm port is free
lsof -nP -iTCP:8888 -sTCP:LISTEN   # should print nothing

# 3. Relaunch (background, log to the hindsight log)
bash ~/.hermes/profiles/orchestrator/hindsight/start.sh >> ~/.hermes/profiles/orchestrator/hindsight/hindsight.log 2>&1 &

# 4. Wait for health (takes ~100s due to eager model loading)
# Poll until: curl -s http://127.0.0.1:8888/health  →  {"status":"healthy",...}

# 5. Verify the running process actually has the new env vars
ps eww <pid> | tr ' ' '\n' | grep '^HINDSIGHT_API_LLM_'

# 6. End-to-end functional verify — POST a tiny async retain, then confirm a
#    status-200 extraction row for the NEW model in Postgres `llm_requests`
#    (or grep the service log for `Extract facts:`). `/version` does NOT
#    exercise the LLM route; only a real retain proves the new model works.
```

**Timing**: startup is ~100-110s (embedding + reranker load sequentially on CPU). The service is NOT available until both report `initialized`. Don't declare success on port-listen alone — wait for `/health`.

### 🔴 Pitfall: the wrapper exits, the server stays

`start.sh` runs `uv tool run hindsight-api`, which forks a python child. If you kill the bash/uv wrapper PID, the python server keeps running on :8888 and your "restart" silently did nothing. Always `kill` the **python** PID from `lsof -iTCP:8888`.

## Version pinning & launchd restarts

When Hindsight runs under launchd (`io.hindsight.api` → `launch.py`), the launchd path **execs the installed uv tool** (`~/.local/share/uv/tools/hindsight-api-slim`) — the `uv tool run hindsight-api==<ver>` line at the end of `start.sh` does NOT control what launchd runs. To pin the version:

```bash
uv tool install --force 'hindsight-api-slim[all]==0.8.2'   # [all] extra required — the slim package alone lacks sentence-transformers/torch and startup fails on local models
launchctl kickstart -k gui/$(id -u)/io.hindsight.api
```

- 🔴 **Never leave `uv tool run hindsight-api` unpinned anywhere.** Each run resolves the latest release; a silent upgrade can break startup (new version may not accept the existing HF model cache and re-verifies against the mirror). Symptom: crash-looping PIDs (`launchctl list` PID keeps changing, uptime seconds), log shows startup failure shortly after model load.
- 🔴 **Default `HINDSIGHT_API_LLM_MAX_CONCURRENT=32` will storm a rate-limited/queued upstream at startup**: pending retain tasks replay at full concurrency, every call gets 429, the startup LLM-verification call gets swallowed too, and the process kills itself on `MODEL_INIT_TIMEOUT` (default 300s) — then KeepAlive restarts into the same storm. Set `HINDSIGHT_API_LLM_MAX_CONCURRENT=4` and `HINDSIGHT_API_MODEL_INIT_TIMEOUT=600` in `start.sh` for proxy/queue-routed setups.
- 🔴 **After a model/config change under launchd, bootout (not just kickstart) if the process was crash-looping** — `launchctl bootout gui/$(id -u)/io.hindsight.api` then `bootstrap gui/$(id -u) <plist>` guarantees one clean start with the new env. Verify with `ps eww <pid> | tr ' ' '\n' | grep HINDSIGHT_API_LLM_MODEL=`.
- 🔴 **Drain before restart when recovering a crash-loop or quota outage.** A KeepAlive restart replays every pending retain task into the upstream at full concurrency; a backlog accumulated while the quota was dead recreates the 429 storm on boot. bootout first, check the daemon's task-queue backlog in Postgres, and drain/archive before re-bootstrap (a few dozen pending is fine; thousands is not).
- **Startup stalls at `Model/connection initialization did not complete within 300s`**: probe the LLM route manually with a minimal non-streaming completion through the proxy. A 200 means the route is fine and the init call was drowned by the backlog replay — fix `LLM_MAX_CONCURRENT` + drain, don't chase the route.
- **Writes queued during downtime are not lost** — retains that timed out during an outage land once the queue drains. Check `llm_requests`/`documents` for the content before re-firing, or you pay double extraction for the same memory.
- First launch after a restart may die once on the DB-migration race (known pitfall) — launchd relaunches it automatically; a second `/health` success is expected, not a new bug.
- cc-switch queues route **per model name**, not per provider entry: switching `HINDSIGHT_API_LLM_MODEL` from `glm-5.3` to `glm-5.3-flash` moves Hindsight traffic to a different provider queue entirely — check which queue the new model actually lands on before assuming quota impact.

## Debugging source code

### 🔴 Pitfall: two package paths, only one is live

`uv tool run` installs into a **cache archive**, not the tools dir. The *running* Hindsight source is at:

```
~/.cache/uv/archive-v0/<hash>/lib/python3.12/site-packages/hindsight_api/
```

NOT at `~/.local/share/uv/tools/hindsight-api-slim/...` (that may exist but is stale/unused). Find the live one from the running process:

```bash
ps -p <pid> -o command=   # shows the archive path
```

Key source files for model behavior:
- `engine/local_device.py` — device selection (MPS logic), memory release after inference.
- `engine/providers/openai_compatible_llm.py` — LLM client, temperature handling.
- `engine/embeddings.py` / `engine/cross_encoder.py` — local model init.
- `config.py` — env-var schema, temperature defaults, omit sentinels.

## References

- `references/env-var-catalog.md` — full catalog of `HINDSIGHT_API_*` model env vars with defaults and effects.
- `references/upstream-mps-bug-tracker.md` — PyTorch MPS leak issue status, verification commands, revisit triggers.
