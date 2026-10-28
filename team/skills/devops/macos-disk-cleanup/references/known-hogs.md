# Known Hogs Catalog (dev machine, observed in the wild)

Compiled from actual cleanup passes on a 460G disk at 96% full.

## "System Data" category offenders (df says free, Finder says System Data huge)

- **Chrome `code_sign_clone` leak** — `/private/var/folders/gv/<hash>/X/com.google.Chrome.code_sign_clone/`. 2026-10-14: 54 copies, 36G du-logical. APFS clonefile copies of the Chrome.app bundle made at every launch; leaked on crash/force-quit. KEY: du reports full size per copy but physical blocks are SHARED with the app (clonefile) — deleting frees far less physical space than du implies; the win is fixing the inflated System Data number + inode pressure. Quit Chrome, `rm -rf`, done.
- **`/private/var/vm/sleepimage`** — 2G+, equals RAM size, system-managed, not worth touching.
- **`/private/var/folders` total >10G** — drill into `gv/<hash>/X` (per-user per-app temp) before blaming caches; the `T` subdir is smaller than people assume.

## Docker

- **Docker.raw sparse file** — `ls -lh` shows virtual (256G), `du -hd 0` shows actual. But du-actual is NOT "live data": cross-check INSIDE the VM with `docker run --rm --privileged --pid=host justincormack/nsenter1 df -h /var/lib`. 2026-10-14 trap: Docker Desktop with `UseContainerdSnapshotter=true` stores pulled images in a SEPARATE in-VM store (`/var/lib/desktop-containerd`, seen 16G) that `docker system df` does NOT count — host du 39G ≈ VM df-used 35G, hole only ~4G, NOT 20G. Estimate reclaim = host_du − VM_df_used, never from `docker system df` alone.
- **`hindsight_hindsight_data` volume** — memory bank data, NEVER prune as unreferenced.

## User home

- **`~/hermes-docker-sandbox/workspace`** — kanban workspaces, can reach 30G+; archive completed ones to cold storage, don't bulk-delete (active workers may hold them).
- **`~/recovered-state.db`** — one-off recovery artifact; confirm with user, then archive+delete. Hermes profile `state.db.corrupt-*` quarantine dirs behave the same: archive with `diff -rq` (they are DIRECTORIES, `shasum` fails), write manifest, delete source.
- **App-managed VM bundles** (`~/Library/Application Support/<app>/vm_bundles/<name>.bundle/`) — e.g. a 10G `rootfs.img` (extracted VM disk the app uses) + its 1.1G `rootfs.img.zst` (compressed original, redundant after extraction). Check `lsof` (idle?) + mtimes (app actively refreshes?). Deleting only the `.zst` is the low-risk cut; deleting `rootfs.img` forces a multi-GB re-download next time the feature runs. Ask the user which.
- **`.zcode/cli/db/db.sqlite`** — real billing ledger (model_usage); never delete the file, but old-row cleanup + VACUUM reclaims most of it (seen 3.9G).
- **`~/.cache/huggingface/hub/models--BAAI--bge-*`** — embedding/reranker models ~2G each; check semantica/hindsight config references before deleting.
- **JetBrains `Application Support/<IDE>` config dirs (1-3G each) survive app uninstall** — .app gone from /Applications but configs stay. Archive (`cp -Rp` + `diff -rq` verify) before `rm -rf`; keep shared `Daemon` dir. 2026-10-14: three IDEs, 5.6G, archived to `/Volumes/nvme2230/lab/archive/20261014-jetbrains-config`.
- **APFS logical-vs-physical gap** — when reported freespace moves far less than the deleted du total, suspect clonefiles (Chrome clones) or open-file handles (deleted-but-held); re-check `lsof +L1` and `diskutil apfs list` before promising more reclaim.

## Project-directory shapes (audit liveness/git/lsof per SKILL.md project-dir subsection before deleting)

- **Upstream clone farms** (`<project>/upstream/<repo>/`) — one OSS repo clone per subdir, 0.1-8G each, project root itself not a repo. Dirty clones hide real work: `git status -s` per repo and export patches before deleting; clean public-remote clones are pure re-clone weight. Numbered snapshot dirs (`up####`) are active-upgrade workspaces even without .git — grep project docs for the dirname before touching.
- **Nested agent-runtime dirs** (`<project>/hermes/{profiles,installs,cache}`) — a full cluster install living inside a project. `installs/<hash>` held open by live processes (lsof) is the ACTIVE env; a superseded hash with zero process/config references is stale (2-5G each). An `.archive/hermes-installs-<date>/` sibling can hold the same id as a live install — compare before assuming redundancy. `hermes/cache/uv` is regenerable.

## Caches (always safe, regenerable)

- `~/.cache/uv/archive-v0`, `~/Library/Caches/ms-playwright`, `electron*`, `@*-updater`, `go-build`, `node-gyp`, `Firefox` — rm directly.
- `~/.cache/lm-studio/extensions` — 1.5G runtime extension cache; app re-downloads on demand.
