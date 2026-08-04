---
name: tauri-blocked-fetch-mirror-bypass
description: "Fix a desktop app's blocked internal fetch via a mirror."
version: 1.0.0
author: Hermes Agent (orchestrator)
platforms: [macos, linux]
metadata:
  hermes:
    tags: [tauri, electron, mirror, bypass, gfw, blocked-fetch, dns-poisoning, jsdelivr, desktop-app]
    related_skills: [cc-switch-monitoring, cc-switch-provider-troubleshooting]
---

# Tauri/Electron Blocked-Fetch Mirror Bypass

A desktop app (Tauri or Electron) does an internal `fetch()` to a remote data
endpoint that is **blocked by network censorship** (GFW DNS poisoning, TLS
reset, etc.). The app reports a fetch/abort error in its UI and can never
complete the operation. The app's frontend JS is **compiled into the binary**
(Tauri v2 embeds `dist/`; Electron may pack an asar) and cannot be patched in
place without rebuilding. **Fix it by feeding the app's local data store
directly from a reachable mirror**, so the app's UI reads success state without
its fetch ever needing to succeed.

## When to Use

- A desktop app shows a persistent fetch/timeout/abort error for a data sync
  feature (pricing, catalog, updates, telemetry).
- The remote endpoint is blocked in the user's network (confirmed: DNS resolves
  to a poisoned IP, TLS handshake cut within ~0.3s with `SSL_ERROR_SYSCALL`).
- The app binary is unpatchable (frontend embedded in the binary, no external
  resource files, code-signed bundle).
- The app stores the synced data + sync-status locally (SQLite DB and/or a JSON
  state file).

Do NOT use this pattern when the app has a proxy/mirror config setting, an
env-var override, or loadable external resources — fix the config there first.
This is the fallback for apps with **hardcoded direct fetch and no escape hatch**.

## Diagnosis — confirm all four before bypassing

1. **The endpoint is blocked, not merely slow.** Confirm with curl:
   ```bash
   curl -sS -o /dev/null -w "HTTP %{http_code} dns=%{time_namelookup}s ssl=%{time_appconnect}s total=%{time_total}s\n" \
     --max-time 15 https://<blocked-host>/api.json
   # SSL_ERROR_SYSCALL at ~0.3s, HTTP 000 = blocked (not a timeout)
   # DNS resolves to a known-poisoned IP (e.g. 103.228.130.61) confirms GFW
   ```
   Retry 3× — a blocked endpoint fails identically and fast every time; a slow
   endpoint fails variably or eventually succeeds.

2. **The app's own proxy doesn't cover this host.** Many AI tools ship a local
   proxy (e.g. cc-switch `:15721`) but it only CONNECT-tunnels specific upstreams.
   ```bash
   curl -sS -o /dev/null -x http://127.0.0.1:<port> https://<blocked-host>/api.json
   # 404/502 from the local proxy = it doesn't route this host; can't help
   ```

3. **No config/env escape hatch exists.** Grep the app source (clone the repo):
   ```bash
   grep -rIn 'MODELS_DEV_API_URL\|fetchTimeout\|API_URL' src/ src-tauri/src/
   ```
   If the URL is a `const` with no env override, there's no config path.

4. **The data is locally-stored and locally-read.** Find where the app persists
   the synced payload and the sync status:
   ```bash
   # SQLite tables
   sqlite3 ~/.<app>/<app>.db ".tables"
   # JSON state files
   ls ~/.<app>/*.json
   ```
   The UI must read sync-status (lastSyncAt / lastSyncError) from this local
   store — if it only reads from memory after a successful fetch, this bypass
   cannot clear the error display.

## The bypass recipe

```
Reachable mirror (jsDelivr/GitHub raw/fastly)
        │  (1) fetch data
        ▼
  Convert script  ── (2) transform to app's expected schema + units
        │  (3) write app's SQLite table (UPSERT)
        │  (4) clear lastSyncError / set lastSyncAt in JSON state file
        ▼
   App UI reads "sync succeeded" from local store on next launch
```

### Choosing a reachable mirror

For data sourced from a GitHub repo (most "models.dev"-style catalogs are),
prefer in this order:

| Mirror | URL pattern | Notes |
|--------|-------------|-------|
| jsDelivr | `https://cdn.jsdelivr.net/gh/<owner>/<repo>/<file>` | Primary; fast in CN |
| fastly jsDelivr | `https://fastly.jsdelivr.net/gh/<owner>/<repo>/<file>` | Fallback |
| GitHub raw | `https://raw.githubusercontent.com/<owner>/<repo>/<default-branch>/<file>` | Often blocked too in CN — test first |

**Pitfall — default branch name.** jsDelivr resolves `@main`/`@master` literally.
If the repo's default branch is `dev` (common), `@main` returns 404. Omit the
branch ref to use the default branch, or use `@latest`:
```bash
# WRONG (404 if default branch != main):
https://cdn.jsdelivr.net/gh/<owner>/<repo>@main/<file>
# RIGHT (uses default branch):
https://cdn.jsdelivr.net/gh/<owner>/<repo>/<file>
# Check default branch:
curl -s https://api.github.com/repos/<owner>/<repo> | jq .default_branch
```

### Schema + unit conversion

The mirror's data shape almost never matches the app's expected schema exactly.
Two conversions are usually needed:

1. **Structural**: e.g. `{data:[{id:"provider/model", pricing:{...}}]}` →
   `Record<providerId, {models: Record<modelId, {cost:{...}}}>}`.
2. **Units**: e.g. price in USD/token → USD/million-tokens (×1e6).

**Validate conversions against existing data** before writing — find a model
that already exists in the app's DB and confirm the mirror's value transforms to
the DB's stored value exactly:
```python
# mirror: prompt="0.000005" (USD/token)
# DB existing: input_cost_per_million = "5" (USD/1M)
assert float("0.000005") * 1e6 == 5.0  # ✅ confirmed
```

### Writing to the app's local store

Mirror the app's own filter/normalize logic (read its source for the exact
rules — e.g. exclude deprecated/non-text models, normalize IDs) so injected rows
pass the app's internal validation. Then:

```python
# 1. Backup the DB before touching it
shutil.copy2(db_path, db_path.with_suffix(f".db.before-mirror.{ts}"))

# 2. UPSERT with conflict-guarded WHERE so changed==real changes (not blind overwrites)
INSERT INTO model_pricing (...) VALUES (...)
ON CONFLICT(model_id) DO UPDATE SET ...
WHERE <each column> IS NOT excluded.<col>  # only counts actual diffs

# 3. Clear the error in the JSON state file the UI reads
state["modelsDevSync"]["lastSyncAt"] = int(time.time() * 1000)
state["modelsDevSync"]["lastSyncError"] = None
```

**File-locking**: some apps hold an `fs2` advisory lock on the JSON state file
during operations. The lock is per-operation, not held for the app's lifetime —
so writing while the app is running *can* succeed but risks a race. Safest:
write when the app process is not running, or retry on lock error.

### Scheduling

Run the mirror sync on the same cadence the app's own sync would have used
(typically visible as a const in source, e.g. `6 * 60 * 60 * 1000`). Use
launchd (macOS) or systemd timer (Linux):

```bash
# macOS: ~/Library/LaunchAgents/<label>.plist with StartInterval=21600
# Verify it loads and runs (it should SKIP on the 6h throttle after first sync):
launchctl list <label>            # LastExitStatus = 0
launchctl start <label>           # manual trigger
tail -f ~/.<app>/logs/<mirror>.log
```

## Worked example: cc-switch models.dev pricing sync

The canonical implementation is `scripts/ccswitch-models-dev-mirror-sync.py`,
written for cc-switch v3.19.1's "models.dev 自动定价同步" feature. Mapping:

| App element | cc-switch concrete value |
|-------------|--------------------------|
| Blocked endpoint | `https://models.dev/api.json` (DNS→103.228.130.61, TLS cut) |
| Error string in UI | `Fetch is aborted` (15s AbortController timeout) |
| Mirror source | jsDelivr `anomalyco/models.dev/models.json` (default branch `dev`) |
| Local data store | `~/.cc-switch/cc-switch.db` table `model_pricing`; `~/.cc-switch/model-pricing.json` field `modelsDevSync` |
| Unit conversion | `pricing.prompt` (USD/token) × 1e6 → `input_cost_per_million` |
| Filter rules | exclude `status=deprecated`, non-text output modalities, name markers (audio/embedding/image/...) |
| Cadence | 6h (matches `MODELS_DEV_STARTUP_SYNC_INTERVAL_MS`) |
| Schedule | `~/Library/LaunchAgents/com.ccswitch.models-dev-mirror.plist` |

Result: DB grew 188→456 rows, `lastSyncError` cleared, UI shows sync success.

## Pitfalls

- **Don't flip the app's `autoSyncEnabled` to fix this.** That switch controls
  the app's own direct fetch; the mirror bypass runs *outside* it. Leave the
  switch as-is — the bypass doesn't depend on it, and turning it on would just
  make the app keep re-failing its own fetch in the background.
- **ID normalization divergence.** The mirror may use dots (`claude-opus-4.7`)
  while the app's historical data uses hyphens (`claude-opus-4-7`). Both rows
  coexist in the DB after bypass. This is harmless — cost lookup matches on the
  exact model_id the request used. Don't try to deduplicate; you'd risk
  orphaning the app's tombstones/overrides.
- **Signed bundles.** Never modify the `.app`/`Contents/` tree of a code-signed
  Tauri/Electron app — signature verification will break and macOS Gatekeeper
  will quarantine it. This bypass only writes to the app's user-data dir, which
  is unsigned and safe.
- **App updates don't break this.** Because the bypass lives outside the app
  bundle (in `~/.hermes/scripts/` + `~/Library/LaunchAgents/`), app auto-updates
  replace only the binary and leave the bypass intact. But if an update changes
  the DB schema or the JSON state-file shape, re-derive the writes from the new
  source.
- **jsDelivr 404 ≠ blocked.** A 404 from jsDelivr usually means a wrong
  branch-ref or path, not network blocking. Distinguish from TLS-cut (which is
  blocking) before chasing the wrong problem.

## Related skills

- **cc-switch-monitoring** / **cc-switch-provider-troubleshooting** — these
  cover the cc-switch *proxy/provider* layer; this skill covers the *app-internal
  data sync* layer that those don't touch.
