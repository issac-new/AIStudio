---
name: macos-disk-cleanup
description: "Use when disk >90% full. Reclaim space across macOS."
version: 1.2.0
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
du -sh /private/var/folders/*/*/* 2>/dev/null | sort -hr | head -10   # per-user temp (top "System Data" driver)
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

Number every finding so the user can reply with a short verdict list ("A; 1 执行; 6 删") — present the final 执行清单 with the same numbers so replies map 1:1.

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

- **Docker.raw sparse-file trap has a second layer: `docker system df` undercounts when containerd image store is on.** With `UseContainerdSnapshotter=true` (Docker Desktop ≥4.30 default-on for new installs), pulled images live in the in-VM `desktop-containerd` store, invisible to `docker system df` (2026-10-14: df said 18G "content", VM-internal truth was 35G across /var/lib/docker 26G + desktop-containerd 16G minus shared blobs). Measure the real hole with: `docker run --rm --privileged --pid=host justincormack/nsenter1 df -h /var/lib` vs host `du -hd 0` on Docker.raw. Reclaimable-by-compaction = host_du − VM_df_used (was ~4G, not 20G).

### Dev tool caches (tier 🟢, safe)

| Cache | Command | Alt (faster) |
|---|---|---|
| npm | `rm -rf ~/.npm/_npx ~/.npm/_cacache` | — |
| pip | `pip cache purge` | `rm -rf ~/Library/Caches/pip` |
| uv | `uv cache clean` (SLOW, can timeout) | `rm -rf ~/.cache/uv/archive-v0 ~/.cache/uv/sdists-v9` |
| Homebrew | `brew cleanup --prune=all` (SLOW) | `rm -rf ~/Library/Caches/Homebrew/downloads/*` |
| go | `go clean -cache` | `rm -rf ~/Library/Caches/go-build` |
| cargo | — | `rm -rf ~/.cargo/registry/cache`; for a project's `target/`: `cargo clean` |
| electron/node-gyp | — | `rm -rf ~/Library/Caches/electron ~/Library/Caches/electron-builder ~/Library/Caches/node-gyp` |
| App updaters | — | `rm -rf ~/Library/Caches/*ShipIt* ~/Library/Caches/*updater*` |

**Pitfall:** `uv cache clean` and `brew cleanup --prune=all` both rebuild a dep
graph and can exceed a 60-120s terminal timeout. Prefer the direct `rm` of the
specific cache subdirs — instant.

**Pitfall: confirm a project build is FINISHED before cleaning its `target/`.**
Run `pgrep -fl 'rustc|cargo'` twice a few seconds apart and check the artifact
mtime (`ls -lt target/release/`). A live build inflates `du` (files still being
written — `cargo clean` can then report freeing MORE than `du` showed), and
cleaning mid-flight forces a full rebuild of the slow native crates
(aws-lc-sys).

### Project directories (~/lab/*, workspaces — audit BEFORE tiering)

A project dir's size says nothing about deletability — its subdirs are
independent units with different tiers. Four checks, in order; any one can
veto deletion:

1. **Liveness**: `ps aux | grep <project>` + `grep -l <name> ~/Library/LaunchAgents/*.plist` + `find <dir> -maxdepth 2 -newermt "2 days ago"`. A dormant-looking project can be a running service (gateway + board watchers under a launchd plist, still writing evidence/config). Live → whole tree 🔴.
2. **Nested repos**: the project root often has NO `.git` while subdirs are independent repos (`git -C root rev-parse` exits 128 — don't stop there). Enumerate: `for d in */ .[!.]*/; do test -d "$d/.git" && echo "$d"; done`. Per repo: `git -C <repo> remote get-url origin` + `git -C <repo> status -s`. Clean clone with public remote → 🟢 re-cloneable. Dirty repo → export `git -C <repo> diff > <repo>.patch` to external disk FIRST, then 🟢.
3. **Open-file dependency**: `lsof +D <subdir>` (slow on huge trees — scope to the suspect subdir). An env/install dir held open by running processes is load-bearing (🔴); an identically-shaped sibling with zero lsof hits is a stale copy (🟢).
4. **References & duplicate backups**: `grep -rn <install-id> <project>/{config,bin,central}` for wiring; check `.archive/` siblings for the same install id — a local archive duplicating an already-archived generation is deletable.

WIP detector: `grep -rl <dirname> <project>/docs --include="*.md"` — a fresh spec/upgrade doc naming the dir means work in progress → 🔴 regardless of git state.

Present a per-subdir table (size / what it is / tier) and an execution order: delete clean re-cloneables now; patch-export-then-delete dirty repos; verify external-disk backup exists before deleting local archives.

### Archive-then-delete (standing rule: anything with archival value)

A 🟡 item with archival value goes to the cold-archive volume BEFORE the source
is touched, and verification is byte-level, never size-only:

```bash
DEST=/Volumes/nvme2230/lab/archive/<YYYYMMDD>-<topic>   # cold-archive naming convention
mkdir -p $DEST && rsync -a <src> $DEST/
diff -rq <src> $DEST/<name>            # directories: byte-level compare
shasum -a 256 <src> $DEST/<file>       # single files: SHA256 must match
# write the OK/DIFF results INTO the archive dir (manifest.sha256 / manifest.txt)
# delete the source ONLY on an all-OK pass
```

- **Quarantine items that look like files may be directories** (state-db
  `corrupt-*` snapshot dirs): `shasum` fails with "Is a directory" — verify
  those with `diff -rq`, reserve SHA256 for plain files.
- **Prefer explicit rsync → verify → rm over cross-volume `mv`.** `mv` across
  volumes deletes the source as soon as the copy lands, before any
  verification; explicit steps keep the source intact until the archive is
  proven.
- **The manifest lives inside the archive dir**, so the archive is
  self-describing once the source is gone.

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
- **Chrome `code_sign_clone` clones are APFS clonefiles: du-logical >> physical freed.** Deleting 36G du-logical freed only ~4G physical (2026-10-14). The real win is fixing the inflated "System Data" category + inode pressure. Always compare `df` before/after and report physical, not du.
- **JetBrains `Application Support/<IDE>` config dirs survive app uninstall.** No .app in /Applications but 1-3G configs remain. Archive (`cp -Rp` + `diff -rq` verify) before `rm -rf`; keep the shared `Daemon` dir.
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
- **Launchd background shells have a broken PATH.** `terminal(background=true)`
  scripts failed on `basename`/`stat` (`command not found`). Use absolute paths
  (`/usr/bin/basename`) or wrap the extraction loop in Python `subprocess`.
- **git gc --aggressive can exceed 20 min on a 10G repo** (hit the 600s cap as
  foreground). Plain `git gc --prune=now` finished the same rewrite in ~3 min.
- **Big git blobs hide in branch fans, not main.** tupang workspace: .enc archives
  pinned by `archive/t_*`, `backup/*`, `wt/*` branches, unreachable from main.
  Before `gc --prune=now`: find ALL refs holding the blobs, extract via
  `git cat-file blob`, verify SHA256+size (**not** `git hash-object` — mismatched
  due to filters/eol), `git bundle create` the doomed branches to external disk,
  then delete branches → `reflog expire --expire=now` → gc. Verified 10.4G→723M.
- **Check `git log main..$b` BEFORE bundling a doomed branch.** A branch whose
  tip is an ancestor of main has 0 unique commits — bundling it writes the full
  history again (4 branches → 4×3.8G redundant bundles). Delete the branch ref
  directly; `git prune --expire` then reclaims nothing only if OTHER refs (e.g.
  `archive/t_*`, running-card `wt/*`) still reach the objects — that's live
  data, not garbage (`git fsck --unreachable` = 0 proves it). Worktree removal
  order: kanban card status → preserve untracked evidence (cmp byte-verify) →
  `git worktree remove --force` → branch audit → prune. Kanban `.worktrees/` is
  a dot-dir: plain `du -sh dir/*` hides it (17G lesson, 2026-10-14).
- **`git gc --prune=now` does NOT shrink `.git` when big blobs sit in main history.** `git count-objects -vH` shows `count: 0` (loose objects gone) yet `du -sh .git` stays huge — the blobs are packed and reachable, so pruning correctly reclaims nothing. Only history rewrite removes them (`git-filter-repo --path X --invert-paths`). Before rewriting: (1) prove the data exists OUTSIDE git (`find / -name <file>` — a `du` of the working dir proves nothing, the working tree may already be cleaned), (2) confirm origin/main lacks the path (`git cat-file -e origin/main:<path>`) so no force push is needed, (3) `git bundle create --all` + `git bundle verify` to an external disk. Verify by diffing path lists old-vs-new (`diff <(ls-tree -r old) <(ls-tree -r new)`), not by commit count alone.
- **`git-filter-repo` in a non-TTY agent shell dies on its sanity prompt** with `EOFError: EOF when reading a line`. Pipe the answers: `printf 'y\ny\ny\n' | git-filter-repo --force --path X --invert-paths`. Side effects to expect afterwards: it **deletes the `origin` remote** (re-add it) and **wipes `refs/remotes/*`** (re-`git fetch`), so a post-rewrite `git rev-list --count origin/main...main` looks wildly diverged (behind=59/ahead=86 on tupang, 2026-10-14) even though content matches — that is rewritten SHAs, not lost work. Registered worktrees on other volumes survive intact (their base commits are rewritten but `git status` still works); check each one rather than assuming breakage.
- **Pause auto-commit launchd jobs during history rewrite.** Move the plist to
  `~/Library/LaunchAgents/disabled-archive/` + `launchctl bootout`; `bootout`
  alone can fail with `Bad request` — moving the plist is the reliable pause.

## Related Skills

- **hermes-disk-slimming** — `~/.hermes`-internal slimming (profiles, venv,
  node runtimes, state.db). Run this for the Hermes data directory specifically.
- **hermes-redundancy-cleanup** — `~/.hermes` config hygiene (backup files,
  logs, provider drift). Run before disk-slimming.
