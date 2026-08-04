---
name: hermes-disk-slimming
description: >-
  Reclaim disk space from a bloated ~/.hermes by removing duplicate directories,
  unused runtime trees, and dev dependencies. Covers the 4-tier priority system
  (P0 caches/snapshots → P1 root-vs-profile duplicates → P2 unreferenced apps
  → P3 venv SDKs + standalone runtimes), the verify-before-delete pattern, and
  state.db pruning. Use when ~/.hermes exceeds 3-4 GB or after major profile
  growth. Complements hermes-redundancy-cleanup (config hygiene).
version: 1.0.0
platforms: [macos, linux]
metadata:
  hermes:
    tags: [cleanup, disk-space, maintenance, slimming]
    related_skills: [hermes-redundancy-cleanup, hermes-offline-migration]
---

# Hermes Disk-Space Slimming

## When to Use

- `~/.hermes` exceeds 3-4 GB (check: `du -sh ~/.hermes`)
- After major profile growth (new teams, enrichment sessions, cloned repos)
- Before migration (reduce package size)
- When `hermes-redundancy-cleanup` (config hygiene) has already been done but
  size is still too large

## Prerequisite

Run `hermes-redundancy-cleanup` first — it handles backup files, old logs,
stale caches, and config divergence. This skill handles the LARGE directories
that config hygiene doesn't touch.

## Analysis: Find the Volume Hogs

```bash
# Top-level sizes
du -sh ~/.hermes
du -sh ~/.hermes/*/ 2>/dev/null | sort -rh | head -15

# Drill into any dir > 500M
du -sh ~/.hermes/hermes-agent/*/ 2>/dev/null | sort -rh | head -10
du -sh ~/.hermes/profiles/*/ 2>/dev/null | sort -rh | head -10
```

## Detect Duplicates (Root vs Profile)

Root-level `~/.hermes/{memos-plugin,bin,plugins}/` often duplicate what already
exists inside `~/.hermes/profiles/orchestrator/`. Before deleting, verify:

```bash
# Size comparison
du -sh memos-plugin/ profiles/orchestrator/memos-plugin/

# Binary identity (md5)
md5 -q bin/uv && md5 -q profiles/orchestrator/bin/uv

# Contents diff
diff <(ls memos-plugin/) <(ls profiles/orchestrator/memos-plugin/)
```

## Verify Unreferenced Before Deleting

```bash
# Check if referenced in config
grep -r 'hermes-office' config.yaml profiles/*/config.yaml shared/profiles.yaml
grep -r 'node/' config.yaml profiles/*/config.yaml

# Check if the hermes binary uses the venv
head -1 ~/.local/bin/hermes  # → exec .../venv/bin/hermes

# Check which node runtime MCP servers actually use
grep 'command:.*node' config.yaml  # → may use .hermes-web-ui/ not node/
```

## Safe-to-Remove Large Directories (Priority Tiers)

| Tier | What | How to verify safe | Typical saving |
|---|---|---|---|
| P0 | Profile state-snapshots (old state.db) | `du -sh profiles/*/state-snapshots/` | 89M each |
| P0 | Profile caches (`home/.npm/`, `home/Library/Caches/`) | Auto-regenerated | 50-130M |
| P0 | `research/` (cloned repos) | Re-cloneable | 40M+ |
| P0 | Profile cache JSONs | Auto-regenerated on demand | 3M each |
| P1 | Root `memos-plugin/` when orchestrator has copy | Diff contents | 441M |
| P1 | Root `bin/` when orchestrator has md5-identical copies | `md5 -q` both sides | 56M |
| P1 | Root `plugins/memos-local-plugin/` when orchestrator has it | Check orchestrator plugins/ | 438M |
| P2 | `hermes-agent/apps/desktop/release/` | Not in config; SwarmStudio.app has its own | 305M |
| P2 | `hermes-office/` entire dir | `grep -r 'hermes-office'` → no hits | 860M |
| P2 | `hermes-agent/node_modules/` | Dev deps only; hermes runs from venv | 367M |
| P3 | Unused venv SDKs (lark_oapi, alibabacloud_dingtalk) | `grep -ri 'feishu\|dingtalk\|lark'` → no hits | 139M |
| P3 | Standalone `node/` runtime | Config MCP uses `.hermes-web-ui/...node` | 2.0G |

## Execute and Verify

```bash
# Delete in tier order, checking hermes binary after each tier
rm -rf profiles/orchestrator/state-snapshots/20260*  # P0
rm -rf profiles/worker-coder/home/Library/Caches profiles/worker-coder/home/.npm  # P0
rm -rf research/  # P0
find profiles/ -name 'models_dev_cache.json' -delete  # P0

rm -rf memos-plugin/ bin/ plugins/memos-local-plugin  # P1

rm -rf hermes-agent/apps/desktop/release/ hermes-office/  # P2
rm -rf hermes-agent/venv/lib/python3.11/site-packages/lark_oapi/  # P3
rm -rf hermes-agent/venv/lib/python3.11/site-packages/alibabacloud_dingtalk/  # P3
rm -rf hermes-agent/node_modules/  # P3 (dev deps)
rm -rf node/  # P3 (standalone runtime, config uses .hermes-web-ui/)

# Health check after each tier
hermes --version  # must still work
du -sh ~/.hermes  # track progress
```

## state.db Pruning

```bash
# Check table sizes and row counts
sqlite3 profiles/orchestrator/state.db ".tables"
sqlite3 profiles/orchestrator/state.db "SELECT COUNT(*) FROM sessions; SELECT COUNT(*) FROM messages;"

# Sessions table uses `started_at` (REAL epoch), not `created_at`
CUTOFF=$(python3 -c "import time; print(time.time()-30*86400)")
sqlite3 profiles/orchestrator/state.db \
  "DELETE FROM messages WHERE session_id IN (SELECT id FROM sessions WHERE started_at < $CUTOFF); \
   DELETE FROM sessions WHERE started_at < $CUTOFF; \
   VACUUM;"

# If all sessions are recent (within 30 days), VACUUM alone reclaims FTS overhead
sqlite3 profiles/orchestrator/state.db "VACUUM;"
```

## Expected Results

A full P0–P3 pass on a mature ~23-profile deployment:
- Before: 8.0 GB → After: ~3.1 GB (61% reduction)
- Remaining: profiles/ (orchestrator memos-plugin+plugins+bin), venv 609M,
  source code ~400M

## Pitfalls

- **`hermes-agent/node_modules/` is safe to delete** — hermes binary runs from
  `venv/bin/hermes` (Python), not node_modules. Need `npm install` only for
  Hermes development contribution.
- **`node/` standalone runtime is safe when config uses `.hermes-web-ui/`** —
  MCP servers point to `.hermes-web-ui/desktop-runtime/hermes/.../node/bin/node`,
  not `~/.hermes/node/bin/node`. Always grep config to confirm.
- **`hermes-office/` is safe when unreferenced** — `grep -r 'hermes-office'`
  across all configs and shared/profiles.yaml must return nothing.
- **venv SDK removal requires config verification** — before removing
  `lark_oapi` (Feishu) or `alibabacloud_dingtalk` (DingTalk), grep all configs
  for `feishu`, `dingtalk`, `lark` to confirm platforms are disabled.
- **state.db `started_at` is epoch REAL, not `created_at`** — the sessions
  table has no `created_at` column.
- **`hermes --version` is the post-deletion health check** — run after each
  tier to catch a broken venv immediately.
- **Orchestrator's memos-plugin/plugins/bin must be KEPT** — these are the
  active copies. Only delete the ROOT-level duplicates, not the profile copies.

## Related Skills

- **hermes-redundancy-cleanup** — (default profile) Config hygiene: backup
  files, old logs, stale caches, provider name drift, hardcoded API keys.
  Run this FIRST before disk-slimming.
- **hermes-offline-migration** — (default profile) Packaging for cross-machine
  migration; disk-slimming is a prerequisite.
