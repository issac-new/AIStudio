---
name: hermes-env-perspective-diagnostics
description: "Use when cron fails but CLI works. HERMES_HOME mismatch."
triggers:
  - "blocked_config platform not configured"
  - "works interactively but fails in cron"
  - "cron weixin delivery failed"
  - "Script not found HERMES_HOME/scripts"
  - "context_length regression check"
  - "profile .env empty keys"
version: 1.0.0
platforms: [macos, linux]
---

# Hermes Env-Perspective Diagnostics

Multi-profile Hermes deployments run the same logical config through
several processes with **different HERMES_HOME values**: the gateway,
cron preflight/runner, TUI session, and `hermes send` CLI each resolve
`.env`, `scripts/`, and `skills/` relative to their own home. A feature
that "works interactively but fails in cron" is almost always a
perspective mismatch, not a real outage.

## When to Use

- Cron job fails `[blocked_config] delivery platform 'X' not configured` while `hermes send -t X` works from the shell.
- Cron `Script not found: <profile>/scripts/foo.py` though the script runs fine in the workspace.
- Post-`hermes update` config regression suspicion (context_length, clearances) needing authoritative verification.
- Skill library audit where referenced files seem missing across many profiles.

## Core principle: verify with the engine's real call chain

Never regex-parse config to decide what the engine will do — invoke the
same functions the failing path invokes:

```python
import os, sys, yaml
os.environ["HERMES_HOME"] = os.path.expanduser("~/.hermes/profiles/<profile>")
sys.path.insert(0, "/Users/YOURNAME/.hermes/hermes-agent")

# ① cron delivery preflight (scheduler.py's own import)
from hermes_cli.env_loader import load_hermes_dotenv
load_hermes_dotenv(hermes_home=os.environ["HERMES_HOME"])
from cron.scheduler import _preflight_check_delivery
_preflight_check_delivery({"deliver": "weixin"})   # None == PASS

# ② context_length the way agent_init resolves it
from hermes_cli.config import get_custom_provider_context_length, get_compatible_custom_providers
cps = get_compatible_custom_providers(yaml.safe_load(open(cfg_path)))
get_custom_provider_context_length("glm-5.3", "http://127.0.0.1:15721", custom_providers=cps)
```

⚠️ YAML shape traps: `custom_providers` and its inner `models` each come
in dict OR list form (list entries carry `name`); the top-level `model`
field may itself be a dict `{"default": ..., "provider": ...}` — write
shape-tolerant parsers or you get phantom 100% failure scans.

## The dual-.env masking trap (most common)

`load_hermes_dotenv(hermes_home=<profile>)` loads ONLY
`<profile>/.env` (override=True); the global `~/.hermes/.env` is
invisible to cron. EMPTY keys (`WEIXIN_TOKEN=`, `WEIXIN_ACCOUNT_ID=`)
in the profile .env therefore mask the real global credentials →
`get_connected_platforms()` reports the platform unconnected →
cron refuses delivery before the agent even runs.

Fix + pitfalls + full detail: `references/dual-env-delivery-fix.md`.

Key judgment before batch-fixing: **empty keys are often the CORRECT
state**. Scan every profile's `cron/jobs.json` for enabled
`deliver: weixin` jobs first — inject real values ONLY into profiles
that actually need delivery (credential minimization; multi-account
isolation is by design, e.g. distinct bot tokens per orchestrator).
Back up the .env (`.bak-cronfix`) and never print the token.

## Workspace scripts: symlink, don't copy

The scheduler hard-constrains `script` to `HERMES_HOME/scripts/`. For
scripts whose source of truth is a project workspace, symlink:

```bash
ln -s <workspace>/scripts/foo.py ~/.hermes/profiles/<profile>/scripts/foo.py
test -s ~/.hermes/profiles/<profile>/scripts/foo.py && echo OK
```

For scripts with ARGUMENTS, use wrapper scripts instead (see
default-profile skill `cron-script-wrapper-pattern`).

## Skill-library scans must resolve symlinks by realpath

Profile `skills/<group>` dirs are typically symlinks into
`~/.hermes/skills/<group>`. Consequences:

- Dedup scan hits by `os.path.realpath(SKILL.md)` or 1 defect
  misreports as N-profiles-wide (one audit saw "115 hits" that were 5 files).
- Fixing ONE file in the pool repairs every profile at once.
- Only "functional" dead links count: text instructing the worker to
  `read_file references/...` for a file that doesn't exist. Bare
  mentions of missing files are upstream hub distribution artifacts —
  leave them.

Recipe: `references/functional-deadlink-scan.md`.

## Engine patches die on `hermes update`

Direct edits under `/Users/YOURNAME/.hermes/hermes-agent/` (e.g. the
2026-08-17 `vars(response)` __slots__ guard in
`agent/conversation_loop.py` ~L3230) are overwritten by updates. Track
them like TUI patches: keep the diff, re-apply after update, consider
upstreaming.

## References

- `references/dual-env-delivery-fix.md` — weixin `[blocked_config]` case: root cause chain, injection procedure, engine verification snippet, 17-profile empty-key triage.
- `references/upstream-429-storm.md` — cc-switch `proxy_request_logs` forensics (unix-ts `created_at`), escalating-error-rate query, and how an upstream 429 storm masquerades as `RuntimeError: vars() argument must have __dict__ attribute`.
- `references/functional-deadlink-scan.md` — three-tier reference resolution (skill-local / profile-global / full skills/ prefix), realpath dedup, and the 115→0 fix pattern.

## Related Skills

- `weixin-send-troubleshooting` (default profile) — iLink errcode -14/-2, home channel, stale gateway state.
- `cron-script-wrapper-pattern` (default profile) — wrapper scripts for argument-taking cron scripts.
- `cc-switch-provider-troubleshooting` (default profile) — 503 circuit-breaker diagnosis.
- `hermes-profile-config-regression-recovery` — restoring washed-out custom config fields after updates.
