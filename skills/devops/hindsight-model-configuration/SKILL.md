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

Controlled by `HINDSIGHT_API_EMBEDDINGS_*` and `HINDSIGHT_API_RERANKER_*` env vars. Current production setup (verified 2026-08-04):

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

### 🔴 Pitfall: do NOT enable MPS to "speed up" local models

MPS is disabled by default. This is **correct and intentional**, not a bug to fix.

The reason is a **PyTorch upstream bug** (per-shape MPSGraph compilation cache leaks without eviction under variable-length inference). A Hindsight instance was observed idling at ~20 GB RSS from stale MPS cache alone. CPU inference holds flat at a few hundred MB of transient buffers (actively trimmed via `malloc_zone_pressure_relief` after each batch).

This is tracked upstream (still open as of torch 2.13.0):
- pytorch/pytorch#181213 — unbounded RSS with varying-shape inference
- pytorch/pytorch#164299 — graphCache identified as leak culprit
- pytorch/pytorch#182815 — proposes `torch.mps.invalidate_graph_cache()` / `PYTORCH_MPS_DISABLE_GRAPH_CACHE`, **not yet shipped**

Do not set `*_ALLOW_MPS=true` to work around slow CPU inference — you will recreate the 20 GB leak. Wait for the PyTorch fix.

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

# 6. End-to-end verify (triggers a real LLM call through the new route)
curl -sS http://127.0.0.1:8888/version   # check api_version
```

**Timing**: startup is ~100-110s (embedding + reranker load sequentially on CPU). The service is NOT available until both report `initialized`. Don't declare success on port-listen alone — wait for `/health`.

### 🔴 Pitfall: the wrapper exits, the server stays

`start.sh` runs `uv tool run hindsight-api`, which forks a python child. If you kill the bash/uv wrapper PID, the python server keeps running on :8888 and your "restart" silently did nothing. Always `kill` the **python** PID from `lsof -iTCP:8888`.

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
