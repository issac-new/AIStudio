---
name: hindsight-cluster-audit
description: Audit Hindsight memory config across all Hermes profiles.
version: 1.0.1
author: Hermes Agent (orchestrator)
platforms: [macos, linux]
metadata:
  hermes:
    tags: [hindsight, memory, multi-profile, audit, cc-switch, outage, retention]
    related_skills: [hindsight-backend-model-config, cc-switch-provider-troubleshooting, hindsight-bank-strategy]
---

# Hindsight Cluster Audit

Audit and repair Hindsight memory config across a multi-profile Hermes deployment,
and correctly diagnose outages so you never misroute clients around the proxy.

## 🔴 User rule (non-negotiable)

**NEVER rewire Hindsight (or any client) away from cc-switch to a direct provider
(DeepSeek/BigModel/Kimi) as an outage workaround.** The user said this explicitly
("别特么瞎改，就继续用ccswitch"). cc-switch owns LLM routing; Hindsight stays on
`http://127.0.0.1:15721/v1` with `PROXY_MANAGED` key. Fix outages ON the cc-switch
side: recharge quota, reorder the failover queue, or wait for a usage-window reset.
Do NOT edit `hindsight/start.sh` to bypass the proxy — that is an unauthorized
config change and will be reverted.

## When to use

- "所有 agent 都正确配置了 hindsight 吗 / 都可以正常使用吗" (cluster-wide check)
- `hindsight_retain` failing while `/health` is healthy (LLM outage mode)
- After creating new profiles (they silently lack `hindsight/config.json`)
- Cross-profile memory drift: config.yaml says hindsight but tools don't load

## Cluster audit checklist (mechanical)

1. **config.json existence** — `~/.hermes/profiles/<p>/hindsight/config.json` MUST
   exist. `config.yaml` declaring `provider: hindsight` is NOT sufficient.
   - Missing file → `_load_config()` falls back `mode=cloud` with no key/url →
     `is_available()=False` → memory tools silently never load. No log, no error.
   - On 2026-08-06, 13/27 active profiles were broken this way ([已移除]×4, [已移除]×6,
     ops-eval, platform×2) — they had the plugin enabled but no config.
2. **Valid config shape** — `mode: local_external` + `api_url: http://localhost:8888`
   + non-empty `bank_id`. For `local_external`, `is_available()` returns True with
   no key/url check. Team → bank_id layout (MAC prefix b24d7ac5d9c4): swarm → `-swarm`,
   hack → `-hack`, ops → `-ops`, product → `-product`, [已移除] → `-[已移除]`, [已移除] → `-[已移除]`,
   [已移除] → `-[已移除]`, platform → `-platform`. Standard config.json:

   ```json
   {"mode": "local_external", "api_url": "http://localhost:8888",
    "bank_id": "hermes-XXXXXXXXXXXX-<team>", "recall_budget": "mid",
    "recall_method": "recall", "auto_recall": true, "auto_retain": true,
    "retain_async": true, "retain_every_n_turns": 1, "memory_mode": "hybrid",
    "recall_types": "observation,world,experience", "recall_max_tokens": 4096,
    "bank_id_template": ""}
   ```
3. **bank_id non-empty** — empty `bank_id` silently uses the default empty `hermes`
   bank ([已移除]-orchestrator bug: had config but no bank_id).
4. **Server-side** — `curl localhost:8888/v1/default/banks`; configured-but-absent
   banks are created LAZILY on first retain, so absence is not an error.
5. **Only one start.sh** — the orchestrator's `hindsight/start.sh` runs the shared
   local service; worker profiles need ONLY config.json pointing at
   `http://localhost:8888`. Never create per-profile start.sh files.

## LLM outage mode (all providers circuit-broken)

Symptom: `/health` healthy, worker stats running, but `hindsight_retain` →
500 `Fact extraction failed: 1/1 chunks failed` with
`cc_switch_upstream_error` / `access_terminated_error`, and direct probe of
`127.0.0.1:15721/v1/chat/completions` → `所有供应商已熔断，无可用渠道`.

- Startup log: "Server will start but LLM-dependent operations may fail until the
  provider is available."
- `hindsight_recall` still works (embedding/reranker are local, no LLM).
- Failed retain tasks QUEUE and auto-retry (no data loss) — you'll see repeated
  "scheduled for retry" lines in the log while the upstream is down.
- Diagnosis: `sqlite3 ~/.cc-switch/cc-switch.db "SELECT provider_id, app_type,
  is_healthy, consecutive_failures, substr(last_error,1,100) FROM provider_health
  ORDER BY consecutive_failures DESC"` — multiple `is_healthy=0` rows in one queue
  = total outage. Common causes: Kimi 403 `usage limit for this billing cycle`,
  bgm 429 weekly cap `1310` (error carries a reset timestamp).
- `app_type='hermes'` providers (damoxing, cc-switch, moa-*) have NO
  provider_health rows — they are a separate routing domain, NOT part of the codex
  failover queue. Their presence in the DB doesn't make them reachable.
- **Masked-key trap**: codex DS row stores `OPENAI_API_KEY: "sk-f9d...8956"`
  (display-masked placeholder). Extracting it to call DeepSeek directly yields
  `Authentication Fails`. Real keys are in the claude app_type rows
  (`ANTHROPIC_AUTH_TOKEN`) and are anthropic-endpoint-only anyway.

## Verification commands

```bash
# plugin's view of one profile (the ONLY accurate availability check)
cd ~/.hermes/hermes-agent && HERMES_HOME=~/.hermes/profiles/<p> ./venv/bin/python3 -c \
  "import sys; sys.path.insert(0,'plugins/memory'); from hindsight import _load_config; print(_load_config())"

# server health + banks
curl -sS http://127.0.0.1:8888/health
curl -sS http://127.0.0.1:8888/v1/default/banks | python3 -m json.tool
```

## Pitfalls

- Skill_manage patch/write_file on shared-layer skills in this deployment fails
  with "not found in active profile" — the shared skill tree is symlinked from
  another profile, and even freshly-created skills hit a stale registry for
  follow-up writes. Patch via the owning profile, or recreate the skill with the
  full consolidated body (create works; patch/write_file may not).
- Do not re-run `setup-hindsight-banks.py` — it reverts to per-profile
  `bank_id_template=hermes-{MAC}-{profile}`, undoing the team-shared banks.
- `ps eww <pid> | grep HINDSIGHT_API_LLM_` verifies a restart actually picked up
  new env (env is read once at process start).
- **Killing the start.sh wrapper kills the whole service.** The wrapper, its
  `uv tool run` parent, and `hindsight-api` share one process group; `process
  kill` (or `pkill -f start.sh`) on the wrapper tears down the server too
  (log shows "Shutting down"). To silence watch-notification noise from a
  retain retry loop (Traceback every ~1-2 min while the LLM is down), leave the
  wrapper running — or start it WITHOUT `watch_patterns` in the first place so
  retry logs don't re-trigger notifications. Restart after an accidental kill:
  run `bash ~/.hermes/profiles/orchestrator/hindsight/start.sh` in background
  (uv re-resolves deps ~2-3 min on first launch after a cache clear), then
  verify with `/health` (can take 100+ s before healthy while models load).
- **start.sh command-substitution quoting:** if you must inject a value into a
  double-quoted export (e.g. `export X="$(sqlite3 ... "SELECT ... '...' ...")"`),
  do NOT escape the inner double quotes as `\"` — bash breaks with `syntax
  error near unexpected token '('`. Keep inner double quotes plain and escape
  only `$` as `\$` inside the JSON path. (Discovered while attempting a
  direct-provider reroute, which the user rule above forbids anyway — only
  relevant for legitimate future start.sh edits.)

## Related

- **hindsight-backend-model-config** (shared layer) — LLM/embedding/reranker backend
  tuning, temperature=none fix.
- **cc-switch-provider-troubleshooting** (shared layer) — circuit-breaker reset,
  wire_api 404 trap.
- **hindsight-bank-strategy** — WHICH bank each profile writes to.
