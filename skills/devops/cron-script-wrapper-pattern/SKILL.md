---
name: cron-script-wrapper-pattern
description: "Fix cron 'Script not found' when passing args to scripts."
triggers:
  - "cron script not found"
  - "Script not found"
  - "cron job fails with script path containing space"
  - "no_agent cron job fails"
  - "ccswitch peak toggle"
  - "scheduled script with arguments"
---

# Cron Script Wrapper Pattern

## When to Use

- A `no_agent=True` cron job fails with `Script not found: /path/to/scripts/<name> <arg>`.
- You need to schedule a script that takes command-line arguments (e.g. `ccswitch-peak-toggle.sh disable`).
- You are debugging why a cron job that works manually fails when run by the scheduler.

## Root Cause

Hermes cron's `script` field is resolved as a **single file path** under `HERMES_HOME/scripts/`.
The scheduler does NOT split on spaces or pass arguments. If you write:

```json
"script": "ccswitch-peak-toggle.sh disable"
```

the scheduler looks for a file literally named `ccswitch-peak-toggle.sh disable` in the scripts
directory, which does not exist, and returns `Script not found`.

## Fix: Wrapper Scripts

Create a thin wrapper script for each argument combination, then point the cron job at the wrapper.

### 1. Create wrappers

```bash
# ~/.hermes/profiles/<profile>/scripts/ccswitch-peak-disable.sh
#!/usr/bin/env bash
exec "$(dirname "$0")/ccswitch-peak-toggle.sh" disable

# ~/.hermes/profiles/<profile>/scripts/ccswitch-peak-restore.sh
#!/usr/bin/env bash
exec "$(dirname "$0")/ccswitch-peak-toggle.sh" restore
```

Make them executable:

```bash
chmod +x ~/.hermes/profiles/<profile>/scripts/ccswitch-peak-{disable,restore}.sh
```

### 2. Update the cron job

Edit `~/.hermes/profiles/<profile>/cron/jobs.json` and change the `script` field from
`"ccswitch-peak-toggle.sh disable"` to `"ccswitch-peak-disable.sh"` (and similarly for restore).

Or recreate the job with `hermes cron create` using the wrapper name.

### 3. Verify

```bash
# Manual test
~/.hermes/profiles/<profile>/scripts/ccswitch-peak-disable.sh
~/.hermes/profiles/<profile>/scripts/ccswitch-peak-restore.sh

# Check cron job definition
grep -A 5 '"id": "<job_id>"' ~/.hermes/profiles/<profile>/cron/jobs.json | grep script
```

## Pitfalls

- **Do not try to quote the argument** in the `script` field — the scheduler still treats the
  whole string as one path.
- **Do not rely on `$1` in the main script** when called from cron via a wrapper; the wrapper
  hardcodes the argument.
- **Wrapper scripts must be executable** (`chmod +x`) or the scheduler will fail with a
  permission error (not `Script not found`).
- **The wrapper pattern also protects the cron definition** from future edits to the main
  script's argument list.

## Related Skills

- **time-based-model-downgrade** — for scheduling model/provider switches across profiles.
- **ccswitch-provider-troubleshooting** — for cc-switch specific issues.
