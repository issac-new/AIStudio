---
name: hindsight-fleet-audit
description: Audit Hindsight config across all Hermes profiles.
version: 1.0.0
author: orchestrator
license: MIT
platforms: [macos, linux]
metadata:
  hermes:
    tags: [hindsight, memory, audit, cc-switch, multi-profile, fleet]
---

# Hindsight Fleet Audit

Audit whether EVERY agent profile in a multi-profile Hermes deployment actually has working Hindsight memory — configuration presence, bank wiring, and live functional behavior. Complements **hindsight-model-configuration** (backend models), **hindsight-bank-strategy** (bank topology), **hindsight-backend-model-config** (start.sh LLM routing).

## When to use

- "所有agent都是正确配置了hindsight的么 都可以正常使用么" / "check all agents have hindsight configured and working"
- Fleet-wide memory write failures (retain broken for every agent)
- After adding a new team or profile batch, verifying each got hindsight config
- Before claiming "all agents use Hindsight" — prior blanket claims proved wrong (see references/fleet-audit-2026-08.md)

## Core insight: config presence ≠ availability ≠ function

Three independent layers; each can silently fail:

1. **Presence** — `config.yaml` declares `memory.provider: hindsight` + plugin enabled. ALL profiles typically do this; it proves nothing.
2. **Availability** — the plugin's `is_available()` gates whether hindsight tools (retain/recall/reflect) LOAD. Depends on `hindsight/config.json` (or env), not on config.yaml.
3. **Function** — retain (LLM extraction) needs the external LLM chain; recall needs only local models.

## Audit steps (ordered)

### 1. Config presence per profile

```bash
cd ~/.hermes/profiles && for p in */; do p="${p%/}"; case "$p" in _shared|*.archived) continue;; esac; \
  [ -f "$p/hindsight/config.json" ] && echo "$p: OK" || echo "$p: NO CONFIG"; done
```

A profile with `provider: hindsight` but no config.json: plugin `_load_config()` falls through legacy `~/.hindsight/config.json` (usually absent) → env defaults `mode=cloud`, no apiKey, no api_url → `is_available()=False` → **hindsight tools silently never load**, zero startup error. Verified by simulating `_load_config()` with `HERMES_HOME` pointed at the profile's dir.

### 2. Bank resolution

```bash
# team bank_id（2026-09-02 定稿：bank 按 team 隔离，hermes-<MAC>-<team>）:
python3 -c "import json; print(json.load(open('<profile>/hindsight/config.json')).get('bank_id',''))"
# server-side inventory + fact counts:
curl -sS http://127.0.0.1:8888/v1/default/banks
```

- `mode: local_external` WITHOUT `api_url` → `is_available()=True` but client points at the default cloud URL `https://api.hindsight.vectorize.io` — silent wrong backend. A local_external config must carry `api_url: http://localhost:8888`.
- config.json without `bank_id` → falls back to the empty `hermes` bank (fact_count=0). Team profiles must pin their team bank_id explicitly.
- Banks auto-create on first write (verified: `-ops` bank appeared after a probe POST).

### 3. Server health + banks

```bash
curl -sS http://127.0.0.1:8888/health
```

Health is NOT proof of writes. Check each bank's `last_document_at` — stale = writes broken.

### 4. Functional split — recall vs retain

- **recall** = embeddings + reranker (LOCAL, CPU) — keeps working even when the LLM is dead.
- **retain** = LLM extraction (EXTERNAL via cc-switch) — the fragile path.
- Probe retain directly (body shape is strict — see pitfall):

```bash
curl -sS -X POST http://127.0.0.1:8888/v1/default/banks/<bank_id>/memories \
  -H 'Content-Type: application/json' \
  -d '{"items":[{"content":"connectivity probe","source":"audit","metadata":{"probe":"true"}}]}'
```

- 403/500 here → cc-switch LLM layer down (see pitfall below).

### 5. cc-switch cross-check when retain fails

```bash
curl -sS http://127.0.0.1:15721/status    # failover_count, current_provider, last_error
curl -sS -m 20 http://127.0.0.1:15721/v1/chat/completions -H 'Content-Type: application/json' \
  -d '{"model":"k3","messages":[{"role":"user","content":"ping"}],"max_tokens":5}'
```

`所有供应商已熔断，无可用渠道` = all upstreams circuit-broken. Not a Hindsight bug.

## 🔴 Pitfalls

- **Upstream quota exhaustion → retain 500 + full circuit break.** `PermissionDeniedError: Error code: 403 ... You've reached your usage limit for this billing cycle` naming an upstream (e.g. HKimi), plus direct probes of ANY model name returning `所有供应商已熔断`. Recall still works (local models); only retain/reflect break. Fix is provider-side: recharge the dead upstream, reorder/remove it from the cc-switch queue — failover resumes automatically. Recurring risk: cc-switch queue rotation + per-upstream quota makes the LLM layer the single point of failure for memory writes.
- **config.json missing = silent absence.** No error, no log line — the hindsight tools just never load for that agent.
- **`/health` OK + recall OK ≠ retain OK.** Always probe retain for write-path proof; recall exercises only local models.
- **POST /memories body shape**: `{"items":[{"content":"...","source":"...","metadata":{"k":"STRING"}}]}` — metadata values must be strings (bool/int → 422 `Input should be a valid string`). Top-level `items` array required.

## Repair pattern

For profiles missing config.json: copy a same-team sibling's config.json and fix `bank_id` to the team bank, then re-verify with a retain probe. Editing shared-layer skills/configs from a non-owning profile requires file tools with `cross_profile=True` (skill_manage registry refuses; see hindsight-model-configuration for backend details).

## References

- `references/fleet-audit-2026-08.md` — full transcript of the 27-profile audit: exact commands, is_available simulation, bank inventory, failure signatures.
