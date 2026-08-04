---
name: macos-disk-cleanup
description: "Use when disk >90% full. Reclaim space across macOS."
version: 1.0.0
platforms: [macos]
metadata:
  hermes:
    tags: [cleanup, disk-space, maintenance, macos, docker]
    related_skills: [hermes-disk-slimming, hermes-redundancy-cleanup]
---

# macOS Whole-Disk Cleanup

## When to Use

- Disk >90% full, or user says "清理磁盘 / 释放空间 / 分析存储 / disk full"
- After heavy Docker / model-download / IDE-install usage
- Quarterly maintenance
- NOT for `~/.hermes` internals → use `hermes-disk-slimming` + `hermes-redundancy-cleanup` first

## Step 1 — Measure (don't trust `df /`)

APFS shares one container across volumes; `df -h /` is misleading. Use:

```bash
# Real picture: the Data volume is where user data lives
df -h /System/Volumes/Data

# APFS container allocation (the source of truth for "full disk")
diskutil apfs list | grep -E "Capacity In Use|Capacity Not Allocated"
```

Record BEFORE numbers so you can report actual reclaim at the end.

## Step 2 — Find Volume Hogs (parallel `du` sweeps)

Run these concurrently (they're independent reads):

```bash
du -sh ~/* 2>/dev/null | sort -hr | head -25          # home top-level
du -sh ~/.[!.]* 2>/dev/null | sort -hr | head -25     # home hidden dirs
du -sh ~/Library/* 2>/dev/null | sort -hr | head -20  # Library
du -sh ~/Library/Containers/* 2>/dev/null | sort -hr  # sandboxed apps
du -sh ~/Library/Caches/* 2>/dev/null | sort -hr      # caches
du -sh /Applications/* 2>/dev/null | sort -hr         # installed apps
du -sh ~/.cache/* 2>/dev/null | sort -hr              # XDG cache (often huge)
du -sh ~/.local/* 2>/dev/null | sort -hr              # pipx, share, etc.
```

Drill into any dir >2G with the same pattern. See `references/known-hogs.md`
for the catalog of usual suspects on a dev machine.

## Step 3 — Present Three Tiers, Let User Pick

**This framework worked well — always use it.** Categorize every finding into:

| Tier | Marker | Rule | Examples |
|---|---|---|---|
| 🟢 Safe | auto-executable | pure cache, regenerable, no user data | npm/pip/uv cache, Docker build cache, updater caches, electron caches |
| 🟡 Confirm | ask user | user data, configs, "which IDEs do you still use" | Downloads, WeChat data, AI IDE dirs, JetBrains caches |
| 🔴 Never | don't propose | runtime essentials, profile/memory data | .hermes/hermes-agent/venv, .claude, .codex (if ACP in use) |

Let the user reply per-tier (e.g. "1 全删; 2 只留 Chrome; 3 不动"). Never auto-delete tier 🟡.

## Step 4 — Execute by Category

### Docker (often the single biggest win)

**Decision tree — always ask user which mode:**

```bash
# BEFORE: show what's reclaimable
docker system df

# AGGRESSIVE (user said "激进"): removes ALL unused images, stopped containers,
# unreferenced volumes, build cache, networks. Keeps only running containers' deps.
docker system prune -a --volumes -f

# CONSERVATIVE: keeps images, only clears cruft
docker builder prune -af          # build cache only
docker container prune -f         # stopped containers
docker image prune -f             # dangling only (NOT -a)

# AFTER
docker system df
```

**Sparse-file trap:** `Docker.raw` (or `Docker.disk`) shows a huge *virtual* size
(e.g. 256G) in `ls -lh` but the *actual* footprint is far smaller (e.g. 31G).
Always measure with `du -hd 0`, never `ls -lh`, for sparse disk images.

### Dev tool caches (tier 🟢, safe)

| Cache | Command | Alt (faster) |
|---|---|---|
| npm | `rm -rf ~/.npm/_npx ~/.npm/_cacache` | — |
| pip | `pip cache purge` | `rm -rf ~/Library/Caches/pip` |
| uv | `uv cache clean` (SLOW, can timeout) | `rm -rf ~/.cache/uv/archive-v0 ~/.cache/uv/sdists-v9` |
| Homebrew | `brew cleanup --prune=all` (SLOW) | `rm -rf ~/Library/Caches/Homebrew/downloads/*` |
| go | `go clean -cache` | `rm -rf ~/Library/Caches/go-build` |
| cargo | — | `rm -rf ~/.cargo/registry/cache` |
| electron/node-gyp | — | `rm -rf ~/Library/Caches/electron ~/Library/Caches/electron-builder ~/Library/Caches/node-gyp` |
| App updaters | — | `rm -rf ~/Library/Caches/*ShipIt* ~/Library/Caches/*updater*` |

**Pitfall:** `uv cache clean` and `brew cleanup --prune=all` both rebuild a dep
graph and can exceed a 60-120s terminal timeout. Prefer the direct `rm` of the
specific cache subdirs — instant.

### Home-directory Hygiene (tier 🟢/🟡)

Common traps on a heavily-used dev machine (all seen in the wild):

| Pattern | Why it's huge | Fix |
|---|---|---|
| `pipx install pip` | Pulls torch/paddle/google/pandas into one 7G venv — pip should NEVER be pipx-installed | `pipx uninstall pip` |
| Orphan AI IDE dirs (`.omlx` `.gemini` `.qoder` `.qwenpaw` `.antigravity*` `.lingma` `.cherrystudio`) | Each leaves 1-5G after you switch tools | Ask which IDE is still in use, `rm -rf` the rest |
| Single giant log file | `~/.qwenpaw/desktop.log` reached 2.7G | `rm` the file (app recreates) |
| Root-dir `node_modules` + `package.json` + 3 lock files at `~/` | AI CLI residue (claude-code, qwen-code installed into CWD by mistake) | `rm -rf ~/node_modules ~/package*.json ~/bun.lock ~/yarn.lock` |
| `~/.cache/whisper/large-v3.pt` after switching STT | 2G leftover model | Confirm replacement, then `rm` |
| `~/.cache/codex-runtimes/codex-runtime-install-*` | Multiple stale install dirs, only `codex-primary-runtime` needed | `rm -rf ~/.cache/codex-runtimes/codex-runtime-install-*` |
| HuggingFace hub `~/.cache/huggingface/hub` | Model cache, check which are active | Per-model `rm -rf` after confirming nothing loads it |

### Home-directory Organization (tier 🟡 — ask before moving)

Root-dir clutter cleanup pattern:

```bash
# Count stray files and empty dirs first
find ~ -maxdepth 1 -type f -not -name ".*" | wc -l
find ~ -maxdepth 1 -type d -empty

# Archive structure (don't delete user files, move them)
mkdir -p ~/Documents/scratch ~/Documents/projects-archive ~/tools
# Move stray .html/.md/.py → scratch; stray project dirs → projects-archive;
# stray tool jars/scripts → tools
# Sensitive files (key.pem, *.env) → ~/.ssh/ or ask user
# Empty dirs → rmdir (use rm -rf if they contain only .DS_Store)
```

### /Applications cleanup

```bash
du -sh /Applications/* 2>/dev/null | sort -hr
```

Categorize: duplicates (`.backup.*`, `.localized` shadow), unused AI IDEs (ask
which the user keeps), entertainment apps, outdated Python versions.

**CRITICAL — Mac App Store apps need sudo.** Apps containing
`Contents/_MASReceipt/receipt` are owned by root and `rm -rf` will fail with
`Permission denied` for every file. In an agent (non-interactive) terminal:

- `sudo rm -rf ...` → fails: "a terminal is required to read the password"
- `osascript -e '... with administrator privileges'` → triggers a user-consent
  prompt that may be **denied by the safety guard** (observed: BLOCKED)

**Correct path for MAS apps:** tell the user to delete via Finder
(right-click → Move to Trash → empty Trash, entering their password), OR have
them add `SUDO_PASSWORD` to the profile `.env` ahead of time. Do NOT loop on
sudo retries — they will not succeed non-interactively.

Non-MAS apps (most DMG-installed ones) delete fine with plain `rm -rf`.

## Step 5 — Verify and Report

```bash
df -h /System/Volumes/Data
diskutil apfs list | grep -E "Capacity In Use|Capacity Not Allocated"
```

Report BEFORE → AFTER table per category. A typical full pass on a 460G disk
that was at 97% reclaims 40-65G and lands at 80-85%.

## Pitfalls

- **`df -h /` lies on APFS.** Always check `/System/Volumes/Data` and
  `diskutil apfs list`. The root `/` volume is a read-only sealant.
- **Docker.raw sparse size.** `ls -lh` shows virtual (up to 256G); `du -hd 0`
  shows actual. Don't panic at the big number.
- **`uv cache clean` and `brew cleanup --prune=all` are slow.** They rebuild
  dependency graphs. Use direct `rm` of cache subdirs for instant reclaim.
- **MAS apps can't be deleted non-interactively.** `_MASReceipt` = root-owned.
  Use Finder (user types password) or pre-configured `SUDO_PASSWORD`.
- **Don't propose tier 🔴 items.** `.hermes/hermes-agent/venv`, `.claude`,
  `.codex`, active profile dirs — these are runtime-load-bearing. If the user
  asks about them, explain why they're large but don't suggest deletion.
- **Confirm model replacements before deleting.** E.g. only delete
  `whisper/large-v3.pt` after confirming STT has moved to Qwen3-ASR (check
  config / memory).
- **Don't `rm` WeChat data.** `~/Library/Containers/com.tencent.xinWeChat` is
  user chat history. Tell the user to clean it from within WeChat.
- **Orphan AI IDE dirs are the new normal.** Users try many AI coding tools;
  each leaves 1-5G. Always ASK which are still in use before bulk-deleting.

## Related Skills

- **hermes-disk-slimming** — `~/.hermes`-internal slimming (profiles, venv,
  node runtimes, state.db). Run this for the Hermes data directory specifically.
- **hermes-redundancy-cleanup** — `~/.hermes` config hygiene (backup files,
  logs, provider drift). Run before disk-slimming.
