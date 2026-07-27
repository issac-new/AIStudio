---
name: kanban-board-profile-scoping
description: >-
  Restrict which Hermes agent profiles the Kanban auto-decomposer can assign
  tasks to, on a per-board basis. Covers the _build_roster() patch in
  kanban_decompose.py, the board.json profile_scope field, the
  read_board_metadata vs get_current_board pitfall, and verification.
  Use when setting up multi-board deployments with isolated team rosters
  (e.g. collaboration team vs. hack team), or when decomposer assigns tasks
  to the wrong team's profiles.
version: 1.0.0
platforms: [macos, linux]
metadata:
  hermes:
    tags: [kanban, decomposer, multi-board, profile-scope, dispatch]
    related_skills: [hermes-gateway-operations, hermes-worker-lifecycle, kanban-orchestrator]
---

# Kanban Board Profile Scoping

Restrict the auto-decomposer's profile roster per board, so a hack-team
task is never assigned to `worker-coder` and vice versa.

## When to Use

- Multi-board deployment with isolated teams (e.g. collaboration board +
  hack board)
- Decomposer assigns tasks to profiles from the wrong team
- Setting up a new specialized board with a dedicated agent roster

## Problem

The Kanban auto-decomposer (`hermes_cli/kanban_decompose.py`) calls
`_build_roster()` which lists ALL installed profiles via
`profiles_mod.list_profiles()`. The LLM sees every profile and may assign
a hack-team task to `worker-coder` — there is no built-in board-level
filter.

## Solution

### 1. Patch `_build_roster()` in `kanban_decompose.py`

Add profile_scope reading after `all_profiles = profiles_mod.list_profiles()`:

```python
# --- Per-board profile scoping ---
scope: list[str] | None = None
try:
    board_slug = kb.get_current_board()
    board_meta = kb.read_board_metadata(board_slug)
    raw_scope = board_meta.get("profile_scope")
    if isinstance(raw_scope, list) and raw_scope:
        scope = [str(s).strip() for s in raw_scope if str(s).strip()]
except Exception:
    pass  # fall back to all profiles

for p in all_profiles:
    if scope is not None and p.name not in scope:
        continue
    # ... existing roster building code ...
```

### 2. Set `profile_scope` on each board's `board.json`

```python
import json, pathlib

# Hack board — only hack team profiles
p = pathlib.Path.home() / '.hermes/kanban/boards/hack/board.json'
data = json.loads(p.read_text())
data['profile_scope'] = ['hack-recon', 'hack-exploit', 'hack-forensics', 'hack-auditor', 'hack-c2']
p.write_text(json.dumps(data, ensure_ascii=False, indent=2))

# Collaboration board — exclude hack team
p = pathlib.Path.home() / '.hermes/kanban/boards/kanban001/board.json'
data = json.loads(p.read_text())
data['profile_scope'] = ['orchestrator', 'architect', 'worker-coder', ...]
p.write_text(json.dumps(data, ensure_ascii=False, indent=2))
```

An empty/missing `profile_scope` means "all profiles" (default behavior,
backward compatible).

## Critical Pitfall: read_board_metadata() vs get_current_board()

`read_board_metadata()` with **no arguments** calls
`_normalize_board_slug(None)` → returns `None` → falls back to
`DEFAULT_BOARD`. It does **NOT** respect the `HERMES_KANBAN_BOARD` env var.

```python
# WRONG — always reads 'default' board regardless of env var
board_meta = kb.read_board_metadata()

# CORRECT — explicitly resolve current board from env chain
board_slug = kb.get_current_board()
board_meta = kb.read_board_metadata(board_slug)
```

The auto-decompose loop in `kanban_watchers.py` sets
`HERMES_KANBAN_BOARD` before calling `decompose_task()`, so
`get_current_board()` resolves correctly (it checks env var first,
then on-disk `current` symlink, then DEFAULT_BOARD).

## How the Dispatcher Passes Board Context

The auto-decompose loop (`kanban_watchers.py:1160-1208`) sets
`HERMES_KANBAN_BOARD` env var before calling `decompose_task()`:

```python
prev_env = os.environ.get("HERMES_KANBAN_BOARD")
try:
    os.environ["HERMES_KANBAN_BOARD"] = slug
    triage_ids = _decomp.list_triage_ids()
    for tid in triage_ids:
        outcome = _decomp.decompose_task(tid, author="auto-decomposer")
finally:
    os.environ["HERMES_KANBAN_BOARD"] = prev_env  # restore
```

This means inside `decompose_task()` → `_build_roster()`, calling
`kb.get_current_board()` returns the correct board slug.

## Verification

```bash
# Verify hack board only shows hack- profiles
~/.hermes/hermes-agent/venv/bin/python3 -c "
import sys, os; sys.path.insert(0, '$HOME/.hermes/hermes-agent')
os.environ['HERMES_KANBAN_BOARD'] = 'hack'
from hermes_cli import kanban_decompose as _d
roster, valid = _d._build_roster()
print(f'{len(roster)} profiles:', [r['name'] for r in roster])
"

# Verify collaboration board excludes hack- profiles
~/.hermes/hermes-agent/venv/bin/python3 -c "
import sys, os; sys.path.insert(0, '$HOME/.hermes/hermes-agent')
os.environ['HERMES_KANBAN_BOARD'] = 'kanban001'
from hermes_cli import kanban_decompose as _d
roster, valid = _d._build_roster()
print(f'{len(roster)} profiles:', [r['name'] for r in roster])
"
```

## Test Impact

The patch is additive (wrapped in try/except, falls back to all profiles
on any error). Existing tests pass unchanged because test fixtures don't
set `profile_scope` in their board.json, so `scope=None` → all profiles
shown (original behavior).

```
test_kanban_decompose.py — 9/9 passed
test_kanban_specify.py + test_kanban_db.py — 241/241 passed
```

## Related Skills

- **hermes-gateway-operations** — multi-board Kanban architecture, board
  management commands, dispatcher multi-board enumeration
- **hermes-worker-lifecycle** — adding/removing worker profiles, batch
  team creation
- **kanban-orchestrator** — decomposition playbook and dispatch rules
