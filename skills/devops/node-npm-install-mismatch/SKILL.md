---
name: node-npm-install-mismatch
description: "Use when npm EBADENGINE from split node/npm installs."
version: 1.0.0
author: Hermes curator
license: MIT
platforms: [macos, linux]
metadata:
  hermes:
    tags: [node, npm, ebadengine, symlink, split-install, dashboard, tui, webui, brew]
    related_skills: [hermes-tui-troubleshooting, hermes-gateway-operations]
---

# Node/npm install mismatch (split install)

## Trigger

`npm install` fails with EBADENGINE even though each tool "looks recent" on its
own. Classic surface: `hermes dashboard --tui` prints
`→ Building web UI...  ✗ Web UI npm install failed` then a manual re-run hint
(`npm install --workspace web && npm run build -w web`). Also any repo whose
`package.json` pins an `engines` range.

## Root cause pattern

`node` and `npm` on PATH come from DIFFERENT installs:

1. `~/.local/bin/node` is a DANGLING symlink → `/opt/homebrew/bin/node`
   (Homebrew node was uninstalled) → `which node` falls through to
   `/usr/local/bin/node` (old Intel build, e.g. v22.14.0).
2. `which npm` however resolves to Homebrew npm (e.g. 12.0.2, requires
   node>=22.22.2) — a different install than node.
3. Repo engines e.g. `{'node': '>=22.22.0', 'npm': '<11.10.0 || >=11.17.0'}` →
   npm aborts EBADENGINE with
   `Required: {...} Actual: {node: v22.14.0, npm: 12.0.2}`.

Each tool alone seems fine; only the PAIR fails the engine gate. The npm warning
`npm v12.0.2 does not support Node.js v22.14.0` is the tell-tale split-install
signature.

## Diagnostics

```bash
which node npm npx
readlink -f "$(which node)" "$(which npm)"   # DIFFERENT roots ⇒ split install
ls -la ~/.local/bin/node ~/.local/bin/npm    # dangling -> /opt/homebrew/bin/node
node --version; npm --version                # npm "does not support Node.js vX" warning
python3 -c "import json; print(json.load(open('package.json')).get('engines'))"
# reproduce the failure WITHOUT the launcher so the error text shows:
cd <repo> && CI=1 npm install --workspace web --include=dev --no-fund --no-audit --progress=false
```

## Fix — one node/npm pair from the SAME install satisfying engines

```bash
# Option A (matches npm<11.10.0 branch): keg-only node@22 ships npm 10.x
brew install node@22
# Option B (matches >=11.17.0 branch): latest `brew install node` ships npm 11.17.x

# Rebuild user-bin symlinks so node+npm+npx come from the SAME keg install
ln -sfn /opt/homebrew/opt/node@22/bin/node ~/.local/bin/node
ln -sfn /opt/homebrew/opt/node@22/bin/npm  ~/.local/bin/npm
ln -sfn /opt/homebrew/opt/node@22/bin/npx  ~/.local/bin/npx
hash -r; node --version; npm --version      # confirm the pair now agrees
```

## Verify

```bash
cd <repo> && npm install --workspace web && npm run build -w web
timeout 25 hermes dashboard --tui | grep -i 'HERMES_DASHBOARD_READY'
```

- The dashboard web UI re-runs the full build on launch; first run after an env
  fix shows `tsc -b && vite build` output and regenerates
  `hermes_cli/web_dist/index.html`.
- The `timeout` wrapper kills the long-running server — its exit 120/124 is
  EXPECTED, not a failure. Judge by the `HERMES_DASHBOARD_READY port=NNNN` line
  and the built web_dist artifacts. (A live dashboard serves health on its own
  port; don't mistake wrapper-exit for build failure.)

## Pitfalls

- First `brew install` can exceed a 600s foreground timeout (dependency
  downloads) while still succeeding — check `brew list --versions node@22` and
  /opt/homebrew/var/homebrew/locks before assuming it failed.
- Lingering keg dirs in PATH (`node@24/bin`, `node@16/bin`) are harmless as long
  as the PATH-first user bin (`~/.local/bin`) points at a consistent pair; they
  only matter if they come BEFORE the user bin.
- Do NOT "fix" by editing package.json engines — fix the environment.
- node@22 is keg-only: `brew install node@22` does NOT symlink into
  /opt/homebrew/bin; you must use the explicit
  `/opt/homebrew/opt/node@22/bin` path (or a user-bin symlink).
- macOS Intel/ARM split: `/usr/local/bin` (Intel homebrew, often stale) vs
  `/opt/homebrew` (ARM homebrew). A stale Intel node binary in /usr/local/bin is
  the usual fall-through target when the ARM symlink dies.

## Session transcript (2026-08-06, macOS)

`hermes dashboard --tui` → `✗ Web UI npm install failed`. Root cause:
`~/.local/bin/node` dangling → `/usr/local/bin/node` v22.14.0 (Intel, 2025-02)
vs Homebrew npm 12.0.2 (requires node>=22.22.2); repo engines
node>=22.22.0/npm<11.10.0||>=11.17.0 → EBADENGINE on the web workspace.
Fixed: `brew install node@22` (22.23.2 + npm 10.9.8), rebuilt
`~/.local/bin/{node,npm,npx}` symlinks to `/opt/homebrew/opt/node@22/bin`,
`hash -r`. Verification: `npm install --workspace web` up to date,
`npm run build -w web` ✓ built, `hermes dashboard --tui` →
`HERMES_DASHBOARD_READY port=9119`. No repo files changed.
