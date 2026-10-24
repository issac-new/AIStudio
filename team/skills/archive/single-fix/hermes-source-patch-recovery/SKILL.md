---
name: hermes-source-patch-recovery
description: "Use when status bar ccExtra missing after hermes update."
version: 1.0.0
author: Hermes Agent
license: MIT
platforms: [macos, linux]
tags: [hermes, update, patch, wipe, status-bar, ccswitch, reflog, recovery]
---

# Hermes Source Patch Recovery

Diagnose and recover customizations to the hermes-agent source tree
(`~/.hermes/hermes-agent`) that vanish after `hermes update`. The classic
symptom is the TUI status bar cc-switch tail segment
(`provider │ usage │ lastReq │ ip+weather`) disappearing while the rest of
the bar still renders. The same class covers ANY patched source file
(bigmodel 401 fix, weixin local, kanban worktree default, ACP codex fix)
being silently reverted.

## When to Use

- "status bar 不显示了" / "status bar 缺了 ccExtra 段" after an update.
- A patched behavior is gone even though the apply log said "✓ Patch applied".
- You need to prove whether a patch is present in source AND in the built
  bundle before blaming display config or the cc-switch proxy.

## Fast Triage — grep source AND dist (0 hits = wiped)

```bash
cd ~/.hermes/hermes-agent/ui-tui
grep -c "ccExtraTruncated" src/components/appChrome.tsx   # 0 = patch wiped from src
grep -c "fetchIpWeather" src/components/appLayout.tsx     # 0 = patch wiped
grep -c "ccExtraTruncated" dist/entry.js                  # 0 = dist built WITHOUT patch
grep -c "current_provider_id" dist/entry.js               # runtime-provider fix
```

Interpretation:
- 0 in src = patch wiped → recover (below).
- >0 in src but 0 in dist = patch applied, stale dist → rebuild + restart.
- >0 in both but still missing on screen = fits()/tail-budget logic issue
  (see shared-layer `tui-status-bar-merge`), NOT a patch-loss problem.

## Root Cause — the reset-after-post-merge race

`hermes update` flow: autostash local changes
(`hermes-update-autostash-<ts>` in `git stash list`) → merge → post-merge
hook runs `~/.hermes/patches/apply-source-patches.sh` which re-applies every
patch and rebuilds dist. **BUT a later `git reset: moving to HEAD` (second
update tick, dashboard update check, or manual reset) wipes the working tree
AFTER the hook already ran** — so the apply log shows success while the tree
is clean again. Evidence lives in the reflog:

```bash
cd ~/.hermes/hermes-agent
git reflog --date=iso | head -20    # reset entries with timestamps
git stash list                        # autostash entries may hold the patch
ls ~/.hermes/patches/stash-backup-*/  # saved patch dumps from prior incidents
```

Patch files themselves persist in `~/.hermes/patches/` — they are never lost.

## Recovery (idempotent)

```bash
bash ~/.hermes/patches/apply-source-patches.sh
```

Re-applies ALL patches (TUI cc-switch statusbar, runtime-provider fix,
bigmodel 401, weixin local, main-local, tui-widgets-doc, kanban worktree,
ACP codex) and rebuilds `dist/entry.js`. Then re-verify: grep src AND dist
for `ccExtraTruncated` — both must be >0.

## CRITICAL — TUI must restart to load the new dist

The TUI node process loads `dist/entry.js` at startup; a rebuild mid-session
does NOT hot-reload the status bar. Gateway/desktop restarts do NOT restart
the TUI either — it is a separate node process (`ui-tui/dist/entry.js`).
Check whether the running process predates the rebuild:

```bash
ps -o pid,lstart,command -p <tui-node-pid>          # process start time
ls -la ~/.hermes/hermes-agent/ui-tui/dist/entry.js  # dist mtime
```

If the process started BEFORE the rebuild, the user must run `/restart`
(or exit + re-enter).

## Recurrence Guard

Post-merge auto-replay is not a guarantee — it only fires on a merge that
brings new commits, and a later reset skips it entirely. If status-bar loss
recurs across updates, set up a launchd watchdog that greps dist for
`ccExtraTruncated` and re-runs `apply-source-patches.sh` on miss. See
`references/2026-08-06-statusbar-incident.md` for a full timeline.

## Pitfalls

- **UU conflict after autostash pop blocks ALL self-heal (2026-09-02)**: when an
  upstream commit and the ccExtra patch touch the same prop destructure,
  `apply-source-patches.sh` (stash pop) leaves `UU ui-tui/src/components/appChrome.tsx`
  with conflict markers. Every later build then fails (`tsc` chokes on `<<<<<<<`),
  so the watchdog logs `npm run build failed — dist still stale` every 5 min but
  cannot fix it. Resolution: keep BOTH sides at the conflict site (upstream adds
  new props like `compacting`, ours adds `ccExtra` — they are not mutually
  exclusive), `git add` the file, `npx tsc --noEmit`, `npm run build`, verify
  grep markers in dist. The watchdog log is the fastest way to spot this state.
- The apply log lies after a post-hook reset: "✓ Patch applied" + clean tree.
  Always verify with greps, never trust the log alone.
- Do not blame display config / `display:` keys in config.yaml — they do not
  control the ccExtra segment. Check the patch greps first.
- Skill write guard: the shared-layer TUI skills (`tui-status-bar-merge`,
  `tui-patch-persistence`, `hermes-tui-troubleshooting`) live under
  `~/.hermes/skills/` (profile 'default'); skill_manage from another profile
  reports "not found". Patch them from the default profile or via
  `hermes curator adopt`. New knowledge goes to the consuming profile's own
  skills dir (this skill).

## Related Skills

- `tui-status-bar-merge` (shared layer) — merge/build mechanics, fits()
  truncation fix.
- `tui-patch-persistence` (shared layer) — how to CREATE patch files +
  apply scripts to protect .tsx edits.
- `tui-source-edit-build-verify` (shared layer) — build/verify sequence.
