---
name: hindsight-fleet-cleanup
description: Clean stale Hindsight banks and archived profiles.
version: 1.0.0
author: Hermes Agent (orchestrator)
platforms: [macos, linux]
metadata:
  hermes:
    tags: [hindsight, fleet, cleanup, bank, archive, multi-profile]
    related_skills: [hindsight-cluster-audit, hindsight-bank-strategy, hindsight-backend-model-config]
---

# Hindsight Fleet Cleanup

Safe cleanup of Hindsight memory banks and archived profiles across a multi-profile
deployment with ONE shared hindsight-api daemon (:8888). Complements
`hindsight-cluster-audit` (audit + outage diagnosis) and `hindsight-bank-strategy`
(bank topology). Use when: removing archived profiles, deleting superseded per-profile
banks, or tidying empty default banks.

## When to use

- User asks to clean up archived (`*.archived`) profiles and their Hindsight residue.
- User asks to delete old per-profile banks after a bank-scheme migration
  (e.g. Plan C team-shared banks superseded per-profile `-orchestrator` banks).
- Routine fleet hygiene: empty `hermes` default bank, stale banks.

## DELETE bank API

```
DELETE http://127.0.0.1:8888/v1/default/banks/{bank_id}
```

Returns `{"success":true,"message":"Bank '<id>' and all associated data deleted successfully","deleted_count":N}`.
The `{bank_id}` path exposes PUT/PATCH/DELETE — DELETE removes the bank AND all its data (durable).

## Keep vs delete

KEEP: banks still referenced by a live profile's `hindsight/config.json` (`bank_id`).
DELETE:
- Banks from a SUPERSEDED scheme (e.g. `hermes-b24d7ac5d9c4-orchestrator` — pre-Plan-C
  per-profile bank, unwritten since 2026-07-24).
- The empty default `hermes` bank (fact_count=0, fallback when config lacks bank_id).
- Any bank owned by archived profiles.

## Archived-profile directory cleanup

Archived dirs may still carry `hindsight/config.json` pointing at ACTIVE team banks
(architect.archived→swarm, hack-c2.archived→hack, ...). If ever spawned they'd write
into the live team bank. Procedure:

1. Backup: `tar czf ~/hermes-archived-backup-<date>/archived-profiles.tar.gz *.archived/`
   (90MB for 13 profiles in 2026-08).
2. Verify no references BEFORE `rm -rf`:
   - Kanban: `sqlite3 ~/.hermes/kanban/boards/<b>/kanban.db "SELECT DISTINCT assignee FROM tasks"` (no archived names)
   - Gateway: `ps aux | grep gateway` (only orchestrator/[已移除]-orchestrator expected)
   - launchd: `ls ~/Library/LaunchAgents/` (no archived plist)
3. `rm -rf *.archived/`
4. Re-verify: 0 archived dirs, active profile count unchanged.

## Post-cleanup verification (mechanical)

- All active profiles: config.json exists, `mode=local_external`,
  `api_url=http://localhost:8888`, non-empty `bank_id`.
- Server banks: every referenced bank present OR expected-lazy (absent is fine —
  lazy-create on first retain). A `GET /v1/default/banks/{id}` returning **405** (not
  404) means the resource exists.
- `curl -sS http://127.0.0.1:8888/health` healthy.

## 2026-08-06 result (reference)

- 13 archived dirs removed (backup 90MB), 0 references.
- Deleted server banks: `-orchestrator` (298 records), `hermes` (0).
- Remaining: swarm (4465 facts), hack (17), ops (0); [已移除]/[已移除]/[已移除]/platform/product
  lazy-create on first retain. 27/27 profiles valid, 0 dangling references.

## Pitfalls

- Deleted bank data is NOT recoverable (no snapshot). Backup profile dirs first; there
  is no server-side bank export shortcut used here.
- Referenced-but-absent banks are expected in a fresh team — do NOT treat absence as
  an error (lazy-create).
- Shared-layer skill writes on this deployment refuse patch/write_file from a
  non-owning profile; create works (see hindsight-cluster-audit pitfalls for the
  mechanism).
