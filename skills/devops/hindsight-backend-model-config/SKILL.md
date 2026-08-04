---
name: hindsight-backend-model-config
description: Configure Hindsight LLM/embedding/reranker via start.sh.
version: 1.0.0
author: Hermes Agent
license: MIT
metadata:
  hermes:
    tags: [hindsight, memory, llm-config, cc-switch, embeddings, reranker, model-routing]
    related_skills: [hindsight-bank-strategy, cc-switch-integration, model-allocation-strategy]
---

# Hindsight Backend Model Configuration

Configure which models the Hindsight memory service uses for its three
internal roles (LLM extraction, embedding, reranking), via the launcher
script `~/.hermes/profiles/<profile>/hindsight/start.sh`.

Distinct from **hindsight-bank-strategy** (which bank IDs agents write to)
and from the **cc-switch-*** family (which cover the proxy itself). This
skill covers Hindsight *as a client* of whatever LLM/embedding backend you
point it at. Use when changing Hindsight's LLM provider/base_url/model,
switching between direct-proxy and cc-switch routing, diagnosing 400
"invalid temperature" errors on retain, or choosing local
embedding/reranker models.

## The Three-Role Architecture

Hindsight uses three independent model roles, each configured by separate
env vars in `start.sh`. They do NOT need to come from the same provider.

| Role | What it does | Env vars | Default in this deployment |
|------|--------------|----------|----------------------------|
| **LLM** | Fact extraction on retain, reflect synthesis, consolidation | `HINDSIGHT_API_LLM_PROVIDER`, `_API_KEY`, `_MODEL`, `_BASE_URL`, `_TEMPERATURE` | `openai` / `glm-5.2` via cc-switch `127.0.0.1:15721/v1` |
| **Embedding** | Vector encoding for semantic recall | `HINDSIGHT_API_EMBEDDINGS_PROVIDER`, `_LOCAL_MODEL` | `local` / `BAAI/bge-large-zh-v1.5` (1024-dim, zh+en) |
| **Reranker** | Cross-encoder re-ranking of recall candidates | `HINDSIGHT_API_RERANKER_PROVIDER`, `_LOCAL_MODEL`, `_LOCAL_FP16` | `local` / `BAAI/bge-reranker-large` (zh+en) |

Only the LLM role hits an external API in this deployment; embedding and
reranker run locally on CPU (MPS is available but disabled by default due
to per-shape cache memory leaks under variable-length workloads — opt in
with `*_ALLOW_MPS` flags only if memory is tight).

## The cc-switch Temperature Pitfall (critical)

**Symptom**: After pointing Hindsight's LLM at cc-switch
(`HINDSIGHT_API_LLM_BASE_URL=http://127.0.0.1:15721/v1`), every
`hindsight_retain` fails with:

```
Fact extraction failed: 1/1 chunks failed.
BadRequestError: Error code: 400 - {'error': {'message':
'CC Switch local proxy failed... Provider: HKimi; model: glm-5.2;
upstream_status: HTTP 400; cause: invalid temperature:
only 1 is allowed for this model'}}
```

**Root cause**: cc-switch routes the model name `glm-5.2` to whichever
upstream provider currently sits at the head of its queue — in this
deployment that was **HKimi (Kimi K3)**, which only accepts
`temperature=1`. Hindsight's per-operation defaults (from
`hindsight_api/config.py` L191-195) are:

| Operation | Default temperature |
|-----------|-------------------|
| verification (connection check) | 0.0 |
| retain (fact extraction) | 0.1 |
| reflect (thinking) | 0.9 |
| consolidation (dedup/delta) | 0.0 |

So retain sends `temperature=0.1`, HKimi rejects it. The previous direct
DAMOXING proxy did not validate temperature, so the mismatch was latent
until cc-switch routing was introduced.

**This is a moving target**: cc-switch queue reordering silently changes
which upstream serves a model name. A config that works today can break
tomorrow when cc-switch fails over to a stricter provider. The fix must
therefore be robust to any upstream, not pinned to "whatever HKimi accepts".

## The Fix: HINDSIGHT_API_LLM_TEMPERATURE=none

Hindsight supports an omit-sentinel for temperature
(`hindsight_api/config.py` L220-222):

```python
_TEMPERATURE_OMIT_VALUES = frozenset({"", "none", "default", "off", "unset"})
```

Setting `HINDSIGHT_API_LLM_TEMPERATURE=none` makes Hindsight drop the
`temperature` parameter from every LLM call, letting the upstream pick its
own default. This is safe for **any** provider — no provider rejects an
omitted temperature — so it survives cc-switch queue reordering.

Add to `start.sh` after the other `HINDSIGHT_API_LLM_*` exports:

```bash
# cc-switch may route glm-5.2 to providers that reject explicit temperature
# (e.g. HKimi/Kimi K3 only allows temperature=1). Omit it so the upstream
# picks its own default.
export HINDSIGHT_API_LLM_TEMPERATURE=none
```

Per-operation overrides
(`HINDSIGHT_API_LLM_TEMPERATURE_RETAIN`, `_REFLECT`, `_CONSOLIDATION`,
`_VERIFICATION`) also accept the same sentinel if you need finer control.

## Switching the LLM to cc-switch (checklist)

1. Edit `~/.hermes/profiles/<profile>/hindsight/start.sh`:
   - `HINDSIGHT_API_LLM_BASE_URL` → `http://127.0.0.1:15721/v1`
   - `HINDSIGHT_API_LLM_API_KEY` → `PROXY_MANAGED` (cc-switch does not
     validate the key — any non-empty string works)
   - `HINDSIGHT_API_LLM_MODEL` → keep `glm-5.2` (cc-switch maps it)
   - Add `export HINDSIGHT_API_LLM_TEMPERATURE=none` (see above)
2. Kill the running hindsight-api process and its `uv tool run` parent:
   ```bash
   # find: lsof -nP -iTCP:8888 -sTCP:LISTEN
   kill <server_pid>; kill <uv_parent_pid>
   ```
3. Restart: `bash ~/.hermes/profiles/<profile>/hindsight/start.sh`
   (background it — first launch re-resolves deps via `uv tool run` and
   takes ~60-120s to reach `Application startup complete`; subsequent
   starts are faster but still load local embedding/reranker models ~30s)
4. Verify in `hindsight.log`:
   - `OpenAI-compatible client initialized: base_url=http://127.0.0.1:15721/v1`
   - `Connection verified: openai/glm-5.2`
5. Verify the running process carries the new env:
   ```bash
   ps eww <pid> | tr ' ' '\n' | grep '^HINDSIGHT_API_LLM_'
   ```
6. End-to-end test via `hindsight_retain` (this is the only call path that
   exercises the LLM — `recall` and direct `POST /memories` do not invoke
   the LLM). A successful retain means the full chain works.

## Verification: confirming `temperature=none` took effect

```bash
ps eww <hindsight_pid> | tr ' ' '\n' | grep '^HINDSIGHT_API_LLM_TEMPERATURE'
# expect: HINDSIGHT_API_LLM_TEMPERATURE=none
```

If this shows a number (or is unset), the process is running an old
`start.sh` and needs to be killed + restarted. The env is read once at
process start; editing `start.sh` does NOT affect a running process.

## Local Embedding & Reranker (current config)

Both run on CPU by default (MPS opt-in via `*_ALLOW_MPS`). Load adds
~30-60s to startup. Models are cached under `~/.cache/huggingface/` after
first download; `HF_ENDPOINT=https://hf-mirror.com` in start.sh routes
downloads through the China mirror.

```bash
export HINDSIGHT_API_EMBEDDINGS_PROVIDER=local
export HINDSIGHT_API_EMBEDDINGS_LOCAL_MODEL="BAAI/bge-large-zh-v1.5"
export HINDSIGHT_API_RERANKER_PROVIDER=local
export HINDSIGHT_API_RERANKER_LOCAL_MODEL="BAAI/bge-reranker-large"
export HINDSIGHT_API_RERANKER_LOCAL_FP16=true
```

To switch back to an API embedding provider (e.g. OpenAI), set
`HINDSIGHT_API_EMBEDDINGS_PROVIDER=openai` and the corresponding
`_API_KEY` / `_MODEL` / `_BASE_URL`. The vector dimension is determined
by the model and stored per-bank at first write; switching providers
mid-bank with a different dimension will mismatch — create a new bank or
re-index.

## Pitfalls

- **Editing start.sh does not affect the running process.** The env is
  read once at process start. You MUST kill the old process (and its
  `uv tool run` parent, which will re-spawn otherwise) and restart.
  Verify with `ps eww <pid> | grep HINDSIGHT_API_LLM_` on the new PID.
- **cc-switch routing is a moving target.** The model name `glm-5.2` maps
  to whatever upstream currently heads the queue (HKimi, Mkimi, bgm, DS).
  Each upstream has different parameter validation. Use
  `HINDSIGHT_API_LLM_TEMPERATURE=none` (omit) rather than pinning a
  specific value, so the config survives failover.
- **retain is the only call that exercises the LLM.** `recall` and
  `POST /v1/.../memories` (direct write) skip the LLM entirely. A
  successful `/health` check does NOT prove the LLM works — always test
  with `hindsight_retain`.
- **`uv tool run hindsight-api` re-resolves deps on first launch** after
  an upgrade or cache clear, downloading ~200 packages (~2-3 min). Do
  not assume the process crashed during this window — check the log for
  the `Installed N packages` line before the Hindsight banner appears.
- **MPS is disabled by default for local models.** The log warns
  "per-shape cache leaks memory under variable-length workloads". Leave
  CPU-default unless you have verified stability for your workload.
- **One start.sh per profile.** Each profile has its own
  `hindsight/config.json` (bank config) and may have its own `start.sh`.
  Changes to the orchestrator's start.sh do not propagate to worker
  profiles — each must be edited (or symlinked) individually.

## Related Skills

- **hindsight-bank-strategy** — covers bank_id / bank_id_template (WHICH
  bank), this skill covers the model backend (WHAT models serve the bank).
- **cc-switch-integration** / **ccswitch-failover-queue-management** —
  cover the proxy that Hindsight's LLM calls into when base_url points
  at 15721.
- **model-allocation-strategy** — decides which model Hindsight should
  use given cost/intelligence trade-offs; this skill implements that
  decision in start.sh.
