---
name: hindsight-fleet-operations
description: Audit Hindsight across all profiles and clean fleet banks.
version: 1.0.0
author: Hermes Agent (orchestrator)
platforms: [macos, linux]
metadata:
  hermes:
    tags: [hindsight, fleet, audit, bank, multi-profile, daemon, cc-switch]
    related_skills: [hindsight-backend-model-config, cc-switch-provider-troubleshooting, hindsight-bank-strategy]
---

# Hindsight Fleet Operations

Fleet-wide ops for Hindsight across many Hermes profiles. This deployment: 27 active
profiles across 7 teams served by ONE local hindsight-api daemon (:8888). Covers
availability audits, the team-shared bank scheme, bank cleanup, and daemon lifecycle
pitfalls. Single-profile LLM/embedding backend config lives in
`hindsight-backend-model-config`; WHICH bank lives in `hindsight-bank-strategy`; this
skill is the multi-profile ops layer.

## Architecture (this deployment)

- One hindsight-api daemon on :8888 serves ALL profiles. Only the orchestrator has a
  `hindsight/start.sh`; every other profile needs only `hindsight/config.json` pointing
  at `http://localhost:8888` with `mode=local_external`.
- Team-shared banks: `hermes-XXXXXXXXXXXX-{team}` — `b24d7ac5d9c4` is the machine id,
  NOT the MAC address. Teams: swarm(4), hack(4), ops(4), product(2), [已移除](4), [已移除](6),
  [已移除](1), platform(2).
- Do NOT run `~/.hermes/shared/setup-hindsight-banks.py` — it reverts config to
  per-profile MAC format (`hermes-{MAC}-{profile}`), undoing the team-shared scheme
  (user decision 2026-07-24; hard warning in memory).

## Fleet availability audit — the config.json gate

The availability gate is the config.json file, NOT the config.yaml declaration:

- `mode=local_external` + `api_url=http://localhost:8888` → `is_available()=True`,
  hindsight tools load.
- MISSING config.json → `_load_config()` falls back to legacy `~/.hindsight/config.json`
  then env defaults: `mode=cloud`, no apiKey, no api_url → `is_available()=False` →
  hindsight tools NOT loaded for that agent, even though config.yaml says
  `provider: hindsight` + plugin enabled.

Audit recipe:
1. List profiles: `ls -d ~/.hermes/profiles/*/ | xargs -I{} basename {}` (skip `_shared`, `*.archived`).
2. Per profile: check `hindsight/config.json` exists; parse `mode`, `api_url`, `bank_id`.
3. Cross-check server: `curl -sS http://127.0.0.1:8888/v1/default/banks` (fact counts,
   `last_document_at`).
4. Referenced-but-absent server banks are FINE — they lazy-create on first retain. A
   `GET /v1/default/banks/{bank_id}` returning 405 (not 404) means the resource exists.

## Bank cleanup

- DELETE exists: `curl -X DELETE http://127.0.0.1:8888/v1/default/banks/{bank_id}` →
  `{"success":true,"deleted_count":N}`.
- KEEP: active team banks still referenced by config.json. DELETE: old per-profile banks
  from a superseded scheme (e.g. `hermes-XXXXXXXXXXXX-orchestrator`), the empty default
  `hermes` bank, and any bank belonging to archived profiles.
- Archive profile dirs before deleting: `tar czf ~/hermes-archived-backup-<date>/archived-profiles.tar.gz *.archived/`.
- Check kanban/gateway/launchd references to archived profiles before `rm -rf` (this
  fleet had none — safe to delete).

## Daemon lifecycle pitfalls

- Killing the launch wrapper kills the whole group: the `uv tool run hindsight-api`
  parent + python server share one process group. `process(action=kill)` on the start.sh
  background session takes down the daemon too (log shows "Shutting down"). Restart with
  a fresh `bash start.sh`; after a cache clear deps re-resolve ~2-3 min, then local
  models load ~30-90s. Verify with a /health poll loop, not a sleep.
- Do NOT attach watch_patterns like "Traceback" to the daemon session — retain retry logs
  trip it every 1-2 min while an upstream is down, flooding the session with stale
  notifications (including after kill, via delayed delivery). Run the daemon with plain
  `background=true` (silent) and poll /health yourself.
- Retain vs recall canary: /health healthy + recall works + retain fails = LLM upstream
  broken (cc-switch trip), NOT the service. Retain failures queue and retry automatically
  (~1/min) — no data loss; they backfill once upstream recovers.

## User hard rule: never bypass cc-switch

User's explicit rule (verbatim reaction when a direct DeepSeek fallback was proposed
during a full circuit trip: "别特么瞎改，就继续用ccswitch"). Do NOT repoint
`HINDSIGHT_API_LLM_BASE_URL` at a direct upstream (DeepSeek/BigModel/...) to route
around a tripped queue. Keep cc-switch config untouched; retain tasks retry; surface the
quota action (recharge / move queue head) to the human. Trip diagnosis lives in
`cc-switch-provider-troubleshooting`.

## Verification

- After edits: python3 loop over all profiles asserting mode/api_url/bank_id, then
  confirm every referenced bank is present server-side or expected-lazy.
- Sanity: `curl -sS http://127.0.0.1:8888/health` + a recall on the swarm bank (recall
  does not need the LLM).

## References

- `references/fleet-audit-2026-08.md` — session detail: 27-profile audit table,
  team→bank mapping, quota failures observed (HKimi 403, bgm 429 1310 reset 08-08),
  provider_health table shape, cleanup transcript.
