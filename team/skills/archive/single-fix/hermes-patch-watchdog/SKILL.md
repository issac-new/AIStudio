---
name: hermes-patch-watchdog
description: "Self-heal TUI patches after hermes update wipes them."
version: 1.0.0
author: Hermes Agent
license: MIT
platforms: [macos]
tags: [tui, hermes-update, patch, launchd, watchdog, status-bar, self-healing]
---

# Hermes Patch Watchdog (launchd self-healing)

Deploy and operate a launchd watchdog that detects when `hermes update`'s
`git reset` has wiped the working-tree source patches (TUI cc-switch status
bar, bigmodel 401, weixin local, kanban worktree, ACP codex) and re-applies
them automatically — including rebuilding `dist/entry.js`.

## When to Use

- User reports "status bar 不显示了" / ccExtra segment missing after an update.
- A patched behavior is gone even though the apply log said "✓ Patch applied"
  (the reset-after-post-merge race).
- Setting up durable protection so TUI customizations survive future updates
  without manual recovery.

## The Failure (why post-merge hook alone is NOT enough)

`hermes update` flow: autostash local changes → merge → post-merge hook runs
`~/.hermes/patches/apply-source-patches.sh` (re-applies patches + rebuilds
dist). **BUT a later `git reset: moving to HEAD`** (second update tick,
dashboard update check, manual reset) wipes the working tree AFTER the hook
ran. Real case 08-06: 14:55 hook applied ✓, 15:08 + 15:17 two resets wiped,
15:18 TUI started from clean source. Evidence: `git reflog --date=iso`.

## Deployed Pieces

- Script: `~/.hermes/bin/tui-patch-watchdog.sh` (full copy in
  `scripts/tui-patch-watchdog.sh`)
- Plist: `~/Library/LaunchAgents/com.hermes.tui-patch-watchdog.plist`
- Log: `~/.hermes/logs/tui-patch-watchdog.log` — healthy tick
  `ok: patches intact`; self-heal `→ FIXED: source-patch (watchdog)`

Plist (StartInterval 300 + RunAtLoad):
```xml
<dict>
  <key>Label</key><string>com.hermes.tui-patch-watchdog</string>
  <key>ProgramArguments</key>
  <array><string>/bin/bash</string><string>/Users/YOURNAME/.hermes/bin/tui-patch-watchdog.sh</string></array>
  <key>StartInterval</key><integer>300</integer>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><false/>
  <key>StandardOutPath</key><string>/Users/YOURNAME/.hermes/logs/tui-patch-watchdog.log</string>
  <key>StandardErrorPath</key><string>/Users/YOURNAME/.hermes/logs/tui-patch-watchdog.log</string>
</dict>
```

## Watchdog Logic

1. Source check: grep `ccExtraTruncated` in appChrome.tsx + `current_provider_id`
   in appLayout.tsx; if either < 1 → run apply-source-patches.sh.
2. Dist check: grep `ccExtraTruncated` in dist/entry.js; if < 1 (and source
   patched) → `npm run build` from ui-tui/.
3. Log result; exit.

## macOS Script Pitfalls (learned by fault-injection testing)

- **No `flock`** on macOS — use `mkdir "$LOCKDIR"` atomic lock +
  `trap 'rmdir "$LOCKDIR" ...' EXIT`.
- **`grep -c` prints `0` AND exits non-zero** on no match; `|| echo 0`
  appends a second `0` line that breaks `[[ ]]` arithmetic (syntax error).
  Use `2>/dev/null || true` — grep -c already outputs the `0`.
- **launchd PATH is minimal** — export npm/node dirs explicitly:
  `~/.local/bin`, `/usr/local/bin`, `/opt/homebrew/bin`,
  `~/.hermes/profiles/orchestrator/node/bin`.
- **`npm run build` works from `ui-tui/`** even though its own node_modules is
  nearly empty — esbuild resolves from the repo-root `node_modules`.

## Fault-Injection Test (verify self-heal BEFORE trusting it)

```bash
git -C ~/.hermes/hermes-agent stash push -- ui-tui/src/components/appChrome.tsx ui-tui/src/components/appLayout.tsx
bash ~/.hermes/bin/tui-patch-watchdog.sh   # expect: source patch re-applied (ccExtra:0->3 ...)
git -C ~/.hermes/hermes-agent stash drop stash@{0}   # DROP, never pop — stash holds pre-test PATCHED versions; popping re-wipes
launchctl load ~/Library/LaunchAgents/com.hermes.tui-patch-watchdog.plist   # verify RunAtLoad logs "ok: patches intact"
```

## Deploy Steps

```bash
# 1. Copy script from skills dir
cp ~/.hermes/profiles/orchestrator/skills/devops/hermes-patch-watchdog/scripts/tui-patch-watchdog.sh ~/.hermes/bin/
chmod +x ~/.hermes/bin/tui-patch-watchdog.sh
# 2. Write plist (above) to ~/Library/LaunchAgents/com.hermes.tui-patch-watchdog.plist
plutil -lint ~/Library/LaunchAgents/com.hermes.tui-patch-watchdog.plist
# 3. Load
launchctl load ~/Library/LaunchAgents/com.hermes.tui-patch-watchdog.plist
launchctl list | grep tui-patch-watchdog
# 4. Verify healthy tick in log after ~5s (RunAtLoad)
```

## Verification

- `launchctl list | grep tui-patch-watchdog` — exit code 0
- Log shows `ok: patches intact` on a healthy tick
- Fault-injection test above shows `source patch re-applied (ccExtra:0->3 ...)`

## Related Skills

- `hermes-source-patch-recovery` (shared layer) — triage + manual recovery
  when patches are wiped; this skill is the automated prevention layer.
- `tui-status-bar-merge` / `tui-patch-persistence` (shared layer) — the
  patch content + merge mechanics the watchdog protects.
- Note: shared-layer skills under `~/.hermes/skills/` cannot be patched from
  this profile via skill_manage (reports "not found"); new knowledge belongs
  in this profile-owned umbrella.
