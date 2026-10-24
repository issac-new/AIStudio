---
name: tui-patch-persistence
description: "Protect TUI .tsx edits from hermes update via patch files."
version: 1.0.0
author: Hermes Agent
license: MIT
platforms: [macos, linux]
tags: [tui, hermes-update, patch, persistence, git, dist-rebuild]
---

# TUI Source Patch Persistence

Protect TUI `.tsx` source edits (`appChrome.tsx`, `appLayout.tsx`) from being
overwritten by `hermes update`. The update command runs `git stash` +
`git reset --hard` + `git pull` inside the hermes-agent repo, wiping all
uncommitted source modifications. Config files under `~/.hermes/` (NOT in
the git repo) survive untouched.

## When to Use

- After editing TUI `.tsx` source files and wanting to protect them before
  running `hermes update`.
- User asks "how to avoid hermes update 覆盖当前改动" or "will update
  overwrite my TUI changes".
- Post-update recovery: TUI customizations are missing after `hermes update`.

## What `hermes update` Does to Source Files

1. **Detects local changes** → `git stash push --include-untracked` (saves to
   stash with name `hermes-update-autostash-<timestamp>`)
2. **`git reset --hard HEAD`** (wipes working tree clean)
3. **`git pull`** (pulls upstream code)
4. **`git stash apply`** (attempts to restore local changes)
5. If stash apply conflicts → `git reset --hard HEAD` (discards restore,
   changes remain in stash for manual recovery)

**Files NOT affected** (outside the git repo):
- `~/.hermes/config.yaml`
- `~/.hermes/profiles/*/config.yaml`
- `~/.hermes/.env`
- `~/.hermes/tui-widgets/*.mjs` (hot-reload widgets)

## Protection Pattern: Patch File + Apply Script

### Step 1: Generate the patch

```bash
mkdir -p ~/.hermes/patches
cd ~/.hermes/hermes-agent
git diff ui-tui/src/components/appChrome.tsx \
        ui-tui/src/components/appLayout.tsx \
  > ~/.hermes/patches/tui-ccswitch-statusbar.patch
```

### Step 2: Create the apply script

See `scripts/apply-tui-patches.sh` — a self-contained script that:
1. Checks if the patch is already applied (grep for custom function names)
2. If not, `git apply` the patch (falls back to `--3way` for conflicts)
3. Rebuilds `dist/entry.js` via `npm run build`
4. Verifies custom code is in the bundle (grep dist for function names)

### Step 3: Run after `hermes update`

```bash
hermes update
bash ~/.hermes/patches/apply-tui-patches.sh
```

## Key Design Decisions

- **Patch file, not git branch**: A patch file is independent of the
  hermes-agent git history. Branches can conflict with upstream merges;
  patches always apply on top of whatever code the update pulled.
- **`git apply`, not `git stash apply`**: The autostash path is unreliable —
  if upstream touched the same lines, `stash apply` fails and `hermes update`
  silently discards the restore (changes stuck in stash). `git apply --3way`
  handles conflicts explicitly.
- **Idempotent**: The apply script detects if customizations are already
  present (grep for `ccExtraTruncated` / `fetchIpWeather`) and skips cleanly.
- **Rebuild + verify**: Applying the patch is not enough — `dist/entry.js`
  must be rebuilt (TUI loads from dist, not src). The script runs
  `npm run build` and verifies the new code is in the bundle.

## Pitfalls

- **Stale autostash entries**: `git stash list` may show multiple
  `hermes-update-autostash-*` entries from previous updates. These can be
  cleaned with `git stash drop stash@{N}` after confirming the patch applied
  successfully.
- **Upstream code changes**: If the upstream code changes significantly
  around the patched regions, `git apply` will fail. The script falls back
  to `--3way` merge, but manual conflict resolution may be needed.
- **`dist/entry.js` must be rebuilt**: Even after a successful patch apply,
  the TUI won't show changes until `npm run build` regenerates the bundle.
  The apply script handles this automatically.
- **Hermes secret redaction**: `.tsx` files with `Bearer ${token}` template
  literals get redacted to `*** ${token}` (broken syntax). Use
  `'Bearer ' + token` string concatenation instead. See
  `tui-source-edit-build-verify` skill for details.

## Compact Display Format Preferences

When building TUI status bar segments, the user prefers compact number
formats. Apply these to all ccExtra segments:

| Field | Before | After | Rule |
|-------|--------|-------|------|
| latency | `43549ms` | `44s` | ≥1000ms → seconds |
| TTFT | `ttft 3803ms` | `ttft4s` | same, drop space |
| status | `200✓` | `✓` or `200✓` | bare glyph for 200 |
| time | `16:35:41` | `16:35` | drop seconds |
| rate-limit usage | `1h 4% (20/500)` | `4%` | drop prefix + suffix |
| last request model | `glm-5.2` | dropped | already in pinned segment |

### Deduplication

The status bar has a **pinned model segment** (`modelText`) that shows
`provider/model effort`. Do NOT duplicate these in the ccExtra tail. Final
compact line: `prov │ usage │ lastTok lat ttft status time │ ip+weather`

### Color coding for numbers

User requested semantic colors. `useCcSwitchExtra()` returns structured
`{ text, segs: Array<{t, k}> }` instead of plain string. Color map:

| Key | Color |
|-----|-------|
| `usageBad` (≥80%) | `t.color.error` |
| `usageWarn` (50-79%) | `t.color.warn` |
| `usageOk` (<50%) | `t.color.statusGood` |
| `latencyBad` (≥30s) | `t.color.error` |
| `latencyWarn` (10-30s) | `t.color.warn` |
| `latencyOk` (<10s) | `t.color.statusGood` |
| `tokens` | `t.color.accent` |
| `statusOk` | `t.color.statusGood` |
| `statusErr` | `t.color.error` |

## Related Skills

- **tui-source-edit-build-verify** (default profile) — the build/verify
  sequence for `.tsx` edits. This skill extends it with the persistence
  (patch protection) layer.
- **tui-status-bar-merge** (default profile) — the ccExtra merge logic
  that the patch protects.
- **cc-switch-integration** (default profile) — cc-switch data sources
  used by the patched TUI code.
