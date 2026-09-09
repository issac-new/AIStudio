---
name: hermes-profile-fleet-operations
description: Use for fleet profile config edits + approval stalls.
version: 1.0.0
platforms: [macos, linux]
metadata:
  hermes:
    tags: [fleet, approvals, batch-config, kanban-worker, yolo, smart]
    related_skills: [agent-profile-lifecycle, hermes-gateway-operations, hermes-profile-config-regression-recovery]
---

# Hermes Profile Fleet Operations (batch config changes)

Class-level playbook for changing one config field across ALL profiles at
once (direct batch edits, not generate-configs.py regeneration), with
mechanism verification and fleet-wide verification sweeps.

## Approval modes: the four-channel model

Approval behavior is per-session-type. All four keys live in the
`approvals:` block of each profile's config.yaml. Mechanics verified against
`tools/approval.py` + `hermes_cli/config_defaults.py` (2026-09-04), then
applied to all 41 profiles:

| Config key | Governs | Fleet setting (2026-09-04) |
|---|---|---|
| `mode` | Interactive sessions (TUI / gateway) | `smart` — auxiliary LLM auto-approves low-risk |
| `single_query_mode` | `hermes chat -q` — **includes every kanban worker** | `approve` |
| `cron_mode` | cron jobs | `approve` |
| `unattended_mode` | webhook / msgraph_webhook / api_server sessions | `approve` |

Valid values: `mode` ∈ {manual, smart, off}; the three channel keys accept
deny/approve (`off`/`allow`/`yes` normalize to approve). YAML 1.1 trap:
bare `off` parses as boolean False — quote it (`mode: 'off'`) or PyYAML's
`False` normalizes to `manual`.

### 🔴 Key mechanism: kanban workers ride the single-query channel

Kanban workers are spawned by the dispatcher as
`hermes -p <profile> --cli ... chat -q "work kanban task <id>"`
(`hermes_cli/kanban_db.py:_default_spawn`), and the `-q` path sets
`HERMES_SINGLE_QUERY_SESSION=1` in the child env (cli.py). The approval gate
routes a worker's dangerous-command decisions to
`approvals.single_query_mode`, NOT to `approvals.mode`. With the default
`deny`, a flagged command in a worker has NO human to approve it: the
command waits out the approval timeout (300s), fails closed, and the worker
burns turns working around the block — a recurring hidden cause of kanban
worker stalls and timeouts that looks like worker laziness or "protocol
violations" on the board.

"yolo & smart fleet-wide" therefore means: interactive = `smart`
(auxiliary-LLM risk triage), non-interactive channels = `approve` (they have
no human; deny just deadlocks them).

### Safety floors unaffected by approve mode

These fire BEFORE any yolo / mode=off / approve bypass (approval.py order):
1. Hardline blocklist — `rm -rf /`, sudo stdin-password guessing, oversized
   inline command payloads. Cannot be bypassed by config at all.
2. User `approvals.deny` glob rules — "never, even under yolo".
3. Tirith content scan (pipe-to-interpreter, homograph URLs, injection).
4. `security.redact_secrets` and hardline repo guards.

Setting `approve` never weakens these; it only removes the human-wait
deadlock for flagged-but-not-forbidden commands in unattended sessions.

## Batch edit pattern (YAML round-trip safe)

Direct `yaml.safe_load` → mutate → `yaml.safe_dump` per file. Skip
`_shared`, `_trash*`, and any non-profile dirs:

```bash
python3 - <<'EOF'
import yaml, glob, os
for p in glob.glob(os.path.expanduser("~/.hermes/profiles/*/config.yaml")):
    name = os.path.basename(os.path.dirname(p))
    if name == "_shared" or name.startswith("_trash"):
        continue
    cfg = yaml.safe_load(open(p)) or {}
    a = cfg.setdefault("approvals", {})
    a["mode"] = "smart"
    a["single_query_mode"] = "approve"
    a["cron_mode"] = "approve"
    a["unattended_mode"] = "approve"
    yaml.safe_dump(cfg, open(p, "w"), sort_keys=False, allow_unicode=True)
print("done")
EOF
```

Caveats:
- `yaml.safe_dump` rewrites formatting (quotes, ordering with
  sort_keys=False). Acceptable for config.yaml; if a file has hand-tuned
  comments, they are lost — prefer `patch` for comment-bearing files.
- This bypasses `generate-configs.py`. If profiles are later regenerated from
  `profiles.yaml`, the batch edit is overwritten — either add the field to
  the shared generator template too, or re-run the batch after regen.

## Fleet verification sweep (after any batch change)

```bash
# Distribution check — expect one line: "N smart approve approve approve"
for f in ~/.hermes/profiles/*/config.yaml; do
  python3 -c "import yaml;a=(yaml.safe_load(open('$f')) or {}).get('approvals',{});print(a.get('mode'),a.get('single_query_mode'),a.get('cron_mode'),a.get('unattended_mode'))"
done | sort | uniq -c

# Syntax + integrity spot check: every file still parses and key sibling
# sections survived the round-trip
python3 - <<'EOF'
import yaml, glob, os
bad = []
for p in sorted(glob.glob(os.path.expanduser("~/.hermes/profiles/*/config.yaml"))):
    name = os.path.basename(os.path.dirname(p))
    if name == "_shared" or name.startswith("_trash"):
        continue
    try:
        cfg = yaml.safe_load(open(p)) or {}
        assert cfg.get("security", {}).get("redact_secrets") is not None
    except Exception as e:
        bad.append((name, str(e)))
print("BAD:", bad if bad else "none")
EOF
```

## Effective timing

- **New spawns** (kanban workers, `hermes chat -q`, new sessions) read
  config at process start → batch edits apply immediately.
- **Running gateways / long-lived sessions** keep the in-memory old config →
  need gateway restart or `/reset`. See `hermes-gateway-operations` for the
  safe-restart window procedure (check running workers first).

## Pitfalls

- **Hardline parser-limit blocks on long inline commands**: heredocs and
  giant one-liners with nested substitutions can trip the unconditional
  parser guard ("BLOCKED (hardline): command parser limit or malformed
  executable payload"). The block message saves the exact command to
  `~/.hermes/profiles/<active>/cache/blocked-scripts/blocked-*.sh` — review
  it, then run `bash <saved-path>`; do NOT retry inline. For multi-step
  fleet ops, prefer `write_file` a script + `python3 script` over inline
  heredocs.
- **Confirm worker launch channel from its log**: the head of
  `~/.hermes/kanban/logs/<task-id>.log` shows the `-q` single-turn banner,
  confirming which approval channel governed that worker; or read
  `_default_spawn` in `hermes_cli/kanban_db.py` for the exact argv.
- **strings on minified bundles floods output**: grepping app bundles (e.g.
  ZCode's zcode.cjs) for CLI flags returns MBs — use `-o` + narrow regex +
  `| head`, or search the saved `cache/terminal-output/*.log` afterward
  instead of re-running.

## Related skills

- `agent-profile-lifecycle` — create/delete/optimize single profiles via
  profiles.yaml + generate-configs.py (the regen path this skill's batch
  edits must be reconciled with).
- `hermes-gateway-operations` — gateway restart windows and safety gating
  when fleet changes must reach running processes.
- `hermes-profile-config-regression-recovery` — when a batch operation
  silently wipes custom fields (the verification sweep above is the
  early-warning for that class of regression).