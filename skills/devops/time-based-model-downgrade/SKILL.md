---
name: time-based-model-downgrade
title: Time-Based Model Downgrade via Cron + Bulk Profile Switch
description: Schedule recurring model+provider switches across profiles.
triggers:
  - "工作日降级模型"
  - "peak hour model switch"
  - "scheduled model failover"
  - "定时切换模型"
  - "高峰期换模型"
  - "cron model rotation"
  - "add kimi key"
  - "rotate api key pool"
---

# Time-Based Model Downgrade via Cron + Bulk Profile Switch

## When to Use

- User wants profiles to run model A during off-hours and model B during a
  daily/weekly window (e.g. "工作日 14:00-18:00 降级为 kimi-k3").
- User wants to add a second API key to a provider's rotation pool
  (rate-limit / 401 failover).
- A scheduled provider failover is needed (provider A degraded during peak,
  auto-switch to provider B every weekday afternoon).

This is DISTINCT from `team-model-routing` (which pins a profile permanently
via `profiles.yaml` + `generate-configs.py`). Time-based switching edits each
profile's `config.yaml` directly on a schedule, so the change is temporary
and reversible without touching the generator pipeline.

## Core Workflow (5 steps)

### 1. Add the new API key to the credential pool

```bash
hermes auth add custom:kimicode \
  --type api-key \
  --api-key 'sk-kimi-...' \
  --label 'kimi-new-20260803'
```

Multiple keys per provider rotate automatically — on 429/401, Hermes tries
the next pooled credential. Verify with `hermes auth list`. The pool is
stored in `~/.hermes/auth.json` and shared across all profiles that reference
that provider.

### 2. Pin the timezone before scheduling cron

```bash
hermes config set timezone 'Asia/Shanghai'
```

If `timezone` is empty (default), cron schedules resolve against system
local time — usually fine on a single-host macOS box, but fragile after a
TZ change or in Docker. Always set it explicitly for time-window jobs.

### 3. Write the bulk switch script

A single script handles BOTH directions (downgrade + restore) plus a
`status` subcommand. Key design rules:

- **Read/write via the Hermes venv python** (`~/.hermes/hermes-agent/venv/bin/python`),
  NOT system `python3` — system Python has no `yaml` module.
- **Edit `model.default` + `model.provider` together** — changing only the
  model leaves the provider pointing at the wrong endpoint.
- **Use `yaml.safe_dump(..., default_flow_style=False, sort_keys=False,
  allow_unicode=True)`** to preserve key order and CJK content.
- **Protect profiles already on the target model** — hack team profiles
  permanently on k3 must be skipped by BOTH directions (a restore would
  wrongly move them back to glm-5.2).
- **Include the root `~/.hermes/config.yaml`** — it drives TUI sessions and
  any profile without an explicit override.
- **Make it idempotent** — running the same direction twice is a no-op;
  only profiles currently matching the source state get switched.

See `scripts/model-shift.sh` for a validated, copy-paste-ready implementation
(24 profiles switched in <2s, tested both directions).

### 4. Create two no_agent cron jobs

Use `no_agent=True` — the script's stdout IS the message body, no LLM call
needed, zero token cost. The `1-5` day-of-week field restricts to weekdays.
Cron resolves the schedule against the `timezone` config set in step 2.

The wrapper scripts live at
`~/.hermes/profiles/orchestrator/scripts/model-shift-{downgrade,restore}.sh`
and just `exec` the main script with the right subcommand. This indirection
lets you edit the main script without touching the cron job definition.

Example cron schedule (downgrade 14:00, restore 18:00, weekdays only):

```
schedule: "0 14 * * 1-5"   # downgrade
schedule: "0 18 * * 1-5"   # restore
no_agent: true
script: model-shift-downgrade.sh   # or model-shift-restore.sh
```

### 5. Verify before walking away

```bash
# Dry-run both directions manually before relying on cron
~/.hermes/scripts/model-shift.sh status        # baseline
~/.hermes/scripts/model-shift.sh glm5_to_k3    # test downgrade
~/.hermes/scripts/model-shift.sh status        # confirm 24 switched
~/.hermes/scripts/model-shift.sh k3_to_glm5    # test restore
~/.hermes/scripts/model-shift.sh status        # confirm 24 restored

# Confirm cron registered
hermes cron list | grep -A6 'model-'

# Confirm pool has both keys
hermes auth list | grep -A3 'custom:kimicode'
```

## Pitfalls

### `hermes config set` writes to the wrong config under multiplex

Under `gateway.multiplex_profiles: true`, `hermes config set KEY VAL` may
resolve the "active profile" unpredictably and write to
`~/.hermes/profiles/<resolved>/config.yaml` instead of the intended target.
For bulk operations touching 20+ profiles, bypass `hermes config set`
entirely and edit each `config.yaml` directly with the venv python +
PyYAML. This is deterministic and profile-resolution-independent.

### System python3 has no yaml module

macOS Homebrew Python (`/opt/homebrew/bin/python3`) does not ship PyYAML.
The Hermes venv at `~/.hermes/hermes-agent/venv/bin/python` does. Always
use the venv python for any script that reads/writes config.yaml. The
switch script hardcodes `HPY` to this path for exactly this reason.

### `damoxing` vs `custom:damoxing` — both resolve

A provider declared under `providers:` (not `custom_providers:`) resolves
under both the bare slug (`damoxing`) and the prefixed form
(`custom:damoxing`). They are functionally identical. The orchestrator
profile historically used `custom:damoxing`; a restore that writes
`damoxing` works correctly. Do not "fix" this drift — it's cosmetic.

### Cron deliver='local' = no TUI notification

`no_agent=True` cron jobs with `deliver='local'` save their output to the
job's run history (viewable via `cronjob action='list'` or `hermes cron list`)
but do NOT push into the TUI session. If the user wants to be notified
when the switch fires, set `deliver` to a gateway-connected platform
(weixin / matrix / telegram). Most users prefer silent operation for
routine model switches.

### Protected profiles must be excluded explicitly

Profiles permanently pinned to the target model (e.g. hack team on k3)
must be in a `NEVER_TOUCH` list that BOTH directions check. A restore that
catches them would move them back to glm-5.2, breaking the team's
permanent pin. The script's `NEVER_TOUCH` regex enforces this.

## Related Skills

- **team-model-routing** — permanent per-profile model pinning via
  `profiles.yaml` + `generate-configs.py`. Use when the change should
  survive config regeneration (this skill is for temporary/time-boxed switches).
- **model-allocation-strategy** / **multi-model-role-allocation** —
  deciding WHICH model each role should run (cost/intelligence tradeoffs).
  Use those first to pick the target model, then this skill to schedule it.
- **hermes-profile-config** (default profile) — the broader config-editing
  playbook.
