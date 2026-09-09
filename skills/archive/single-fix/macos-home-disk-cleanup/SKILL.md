---
name: macos-home-disk-cleanup
description: Reclaim macOS disk space from caches when the disk is full.
version: 1.0.0
platforms: [macos]
metadata:
  hermes:
    tags: [cleanup, disk-space, maintenance, macos]
    related_skills: [hermes-disk-slimming, hermes-redundancy-cleanup]
---

# macOS Home-Directory Disk Cleanup

System-wide home-directory (`~/`, `~/.cache`, `~/Library`, Docker, Homebrew)
disk reclamation. This is NOT `~/.hermes`-specific — for that use
**hermes-disk-slimming**.

## When to Use

- `df` shows the disk >85% full (red zone)
- "System Data" or "Other" appears as the largest consumer in About This Mac
- After heavy Docker / model-download / AI-tool usage
- Routine quarterly maintenance
- Before a migration or backup (reduce payload)

## Phase 1: Get the True Disk Picture (APFS Trap)

`df -h /` shows the **read-only system snapshot volume** (often ~12 GB) — this is
NOT where user data lives. The real data volume is separate:

```bash
# WRONG — misleading: shows root snapshot, not user data
df -h /

# RIGHT — the actual data volume where everything lives
df -h /System/Volumes/Data

# Authoritative — APFS container allocation across all volumes
diskutil apfs list | grep -E "Capacity In Use|Capacity Not Allocated"
```

The APFS "Capacity In Use By Volumes" is the real number. If it says 97% and
"Capacity Not Allocated" is <15 GB, the disk is genuinely critical.

Also check external volumes — a mounted NVMe (`/Volumes/YOURVOLUME` etc.) may
offer an escape hatch for offloading large files.

## Phase 2: Parallel Size Sweeps (Batch Independently)

Run these concurrently — they're independent reads:

```bash
# Top-level visible directories
du -sh ~/* 2>/dev/null | sort -hr

# Hidden directories (often the real hogs: .cache, .local, AI tool dirs)
du -sh ~/.[!.]* 2>/dev/null | sort -hr | head -25

# ~/Library breakdown (Containers, Application Support, Caches)
du -sh ~/Library/* 2>/dev/null | sort -hr | head -20

# Common dev-tool caches (quick targeted check)
for d in ~/.npm ~/Library/Caches/{pip,Homebrew,Yarn} \
         ~/.cargo ~/go ~/Library/pnpm ~/.hermes \
         ~/Library/Containers/com.docker.docker \
         ~/Library/Developer/Xcode/DerivedData \
         ~/Library/Developer/CoreSimulator; do
  du -sh "$d" 2>/dev/null
done
```

## Phase 3: Drill Into Hogs

Any directory >3 GB gets drilled. See `references/known-hogs.md` for the full
catalog of where space hides and how to verify each is safe to remove.

Key patterns to check:

```bash
# Docker.raw sparse file — ls shows VIRTUAL size, du shows ACTUAL
ls -lh ~/Library/Containers/com.docker.docker/Data/vms/0/data/Docker.raw  # 256G (virtual!)
du -hd 0 ~/Library/Containers/com.docker.docker/Data/vms/0/data/Docker.raw  # 31G (actual)

# Docker internal stats (what's reclaimable)
docker system df

# pipx misinstall detection (pip shouldn't be in pipx — a multi-GB bloat red flag)
du -sh ~/.local/pipx/venvs/* | sort -hr | head
# If "pip" shows multi-GB, it's a misinstall — pipx uninstall pip

# Single oversized log files (scan, don't just look at dirs)
find ~/.cache ~ -maxdepth 2 -name '*.log' -size +100M -exec ls -lh {} \; 2>/dev/null

# AI IDE caches — users accumulate many, each multi-GB
du -sh ~/.zcode ~/.gemini ~/.claude ~/.omlx ~/.qwenpaw ~/.qoder ~/.antigravity* 2>/dev/null
```

## Phase 4: Tiered Cleanup

Present findings as three tiers. Let the user choose scope per tier.

### Tier 1 — Safe (pure caches, auto-regenerated, zero risk)

| Item | Typical size | Command |
|------|-------------|---------|
| npm cache (`_npx` + `_cacache`) | 5–15 GB | `rm -rf ~/.npm/_npx ~/.npm/_cacache` |
| uv cache | 3–8 GB | `uv cache clean` |
| pip cache | 0.5–1 GB | `pip cache purge` |
| Homebrew cache | 0.5–1 GB | `rm -rf ~/Library/Caches/Homebrew/downloads/*` (NOT `brew cleanup` — times out, see pitfalls) |
| electron/node-gyp caches | 0.5–1 GB | `rm -rf ~/Library/Caches/{electron,electron-builder,node-gyp}` |
| App updater caches (*ShipIt*, *updater*) | 1–3 GB | `rm -rf ~/Library/Caches/*ShipIt ~/Library/Caches/*updater*` |
| go-build cache | 0.3 GB | `go clean -cache` |
| Docker build cache + stopped containers | 1–5 GB | `docker builder prune -af && docker container prune -f` |
| Whisper/HF models no longer used | 1–8 GB | verify replacement exists, then delete from `~/.cache/huggingface/hub/` |
| Oversized single log files | varies | `> "$logfile"` (truncate) or `rm` if app recreates |

### Tier 2 — Confirm first (user data or app state)

| Item | Action | Risk |
|------|--------|------|
| `~/Downloads` | Manual triage | User files |
| WeChat data (17 GB+) | Clean INSIDE the app, never `rm` | Chat history |
| JetBrains caches (`*/caches`) | `rm -rf ~/Library/Application Support/JetBrains/*/caches` | Low — IDE rebuilds; keep configs |
| CoreSimulator | `xcrun simctl delete unavailable && xcrun simctl delete all` | None if not doing iOS dev |
| AI IDE caches (unused tools) | Delete `.zcode`, `.qwenpaw`, etc. for tools the user no longer uses | Check usage first |
| wallpaper.agent (if >3 GB, abnormal) | `rm -rf ~/Library/Containers/com.apple.wallpaper.agent/Data/Library/Caches/*` | Low |

### Tier 3 — Aggressive (verify with user)

| Item | Action |
|------|--------|
| Docker ALL unused (`prune -a --volumes`) | `docker system prune -a --volumes -f` — deletes ALL images not used by running containers |
| VS Code WebStorage | `rm -rf ~/Library/Application Support/Code/WebStorage` — clears some extension state |
| HuggingFace model hub | Delete model dirs under `~/.cache/huggingface/hub/` the user confirms aren't loaded |

### Never delete (without explicit ask)

- `~/.hermes/{hermes-agent/venv, hermes-agent/node_modules, profiles}` — Hermes runtime + configs
- App `Application Support/<App>/` config files (non-cache portions)
- `~/.ssh`, `~/.gnupg`, credential files
- `/private/var/vm/sleepimage` (system-managed, regenerates)

## Phase 5: Root-Directory Tidying

Home root often accumulates stray files from one-off AI CLI installs:

```bash
# Stray package manifests that shouldn't be at ~/
ls ~/package.json ~/package-lock.json ~/bun.lock ~/yarn.lock ~/node_modules 2>/dev/null
# → these belong to global CLI tools; safe to remove if no real project uses them

# Stray sensitive files
ls ~/key.pem ~/*.env 2>/dev/null  # move to ~/.ssh/ or delete

# Old test/burp files
ls ~/*.burp ~/2023-* 2>/dev/null  # archive or delete

# Empty directories from abandoned project scaffolds
find ~ -maxdepth 1 -type d -empty -delete
```

## Phase 6: Verify Results

```bash
df -h /System/Volumes/Data | tail -1
diskutil apfs list | grep -E "Capacity In Use|Capacity Not Allocated"
```

Report before/after for "Available" and "Capacity In Use".

## Pitfalls

- **`df -h /` is misleading on APFS** — it shows the read-only system snapshot
  (~12 GB), not user data. Always check `/System/Volumes/Data` or
  `diskutil apfs list`.
- **Docker.raw `ls -lh` shows VIRTUAL size** — the sparse file may show 256 GB
  but only consume 31 GB on disk. Use `du -hd 0` for actual size. Don't panic
  at the `ls` number.
- **`brew cleanup --prune=all` times out** (rebuilds dependency tree, slow on
  large installs). Directly `rm -rf ~/Library/Caches/Homebrew/downloads/*`
  achieves the same cache clearing in <1s.
- **`pipx install pip` is a misinstall** — pipx is for standalone apps, not pip
  itself. It creates a multi-GB venv full of heavy deps (torch, paddle, google
  libs). Detect with `du -sh ~/.local/pipx/venvs/pip`; fix with
  `pipx uninstall pip`.
- **`rm -f` silently fails on directories** — backup dirs like
  `~/.hermes/backup-pre-*` are directories; `rm -f` leaves them. Use `rm -rf`
  for anything that might be a directory.
- **Don't `rm` WeChat data directly** — 17 GB+ lives in
  `~/Library/Containers/com.tencent.xinWeChat`. Use WeChat's in-app storage
  manager; direct `rm` corrupts chat history.
- **CoreSimulator `simctl delete all` removes user-created devices** — fine if
  not doing iOS dev; runtimes stay system-level.
- **AI IDEs create duplicate cache trees** — `.gemini` may contain
  `antigravity`, `antigravity-ide`, AND `antigravity-backup` (3x copies).
  Diff and delete the redundant ones.
- **Always report before/after** — a cleanup session without quantified results
  is incomplete. The user wants "+29 GB reclaimed, 97% → 90%".

## Related Skills

- **hermes-disk-slimming** — (orchestrator) `~/.hermes`-specific slimming:
  profile duplicates, venv SDK pruning, node runtime dedup. Use AFTER or
  ALONGSIDE this skill when `~/.hermes` is also large.
- **hermes-redundancy-cleanup** — (orchestrator) `~/.hermes` config hygiene.
- **hermes-offline-migration** — (orchestrator) Run disk cleanup before
  packaging for migration.
