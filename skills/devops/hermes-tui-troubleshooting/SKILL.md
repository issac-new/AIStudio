---
name: hermes-tui-troubleshooting
description: "Use when hermes --tui fails to start (npm install failed)."
version: 1.0.0
author: Hermes curator
license: MIT
platforms: [macos, linux]
metadata:
  hermes:
    tags: [hermes, tui, troubleshooting, npm, node, ebadengine, engine-strict, workspace, ink]
    related_skills: [hermes-agent, gateway-crash-loop-troubleshooting, config-yaml-corruption-diagnosis]
---

# Hermes TUI Troubleshooting

Use when `hermes --tui` (or the dashboard Chat tab) fails to start, especially with
`Installing TUI dependencies…` followed by a bare `npm install failed.` with no
detail, or when debugging node/npm errors inside a Hermes git checkout
(`~/.hermes/hermes-agent`).

## Symptom → root cause chain

`hermes --tui` prints `Installing TUI dependencies…` then bare `npm install failed.`:

1. Repo root `.npmrc` sets `engine-strict=true` and root `package.json` pins an
   `engines.npm` range (e.g. `"<11.10.0 || >=12.0.0"`).
2. The npm on PATH is in the excluded gap (e.g. brew node 26.4.0 ships npm 11.17.0)
   → npm aborts with EBADENGINE before doing any work.
3. The TUI launcher (`_make_tui_argv` in `hermes_cli/main.py`) runs npm install with
   `--silent`, which swallows the EBADENGINE output ENTIRELY → `maybe_repair_npm_engine`
   sees empty output, cannot detect the engine mismatch → user gets the bare
   `npm install failed.` with an empty preview. This is why the failure looks
   undiagnosable.
4. `maybe_repair_npm_engine` (`hermes_cli/npm_engine.py`) only auto-upgrades an npm
   living under `$HERMES_HOME/node` (Hermes-managed Node tree). A brew/nvm/user npm
   gets a manual-fix message — but only if the error text survived step 3.

## Diagnostics (copy-paste)

```bash
# versions & which npm
npm --version; node --version; readlink -f "$(which npm)"
# repo constraints
python3 -c "import json; print(json.load(open('package.json')).get('engines'))"
grep engine-strict .npmrc
# reproduce WITHOUT --silent so errors are visible (CI=1 matches the launcher env)
cd <hermes checkout> && CI=1 npm install --workspace ui-tui --include=dev --no-fund --no-audit --progress=false
# EBADENGINE then shows: Required: {"node":">=20.0.0","npm":"<11.10.0 || >=12.0.0"}
#                       Actual:   {"node":"v26.4.0","npm":"11.17.0"}
```

## Fixes

- Satisfy the pinned range: for `>=12.0.0` run `npm install -g npm@^12`; for
  `<11.10.0` run `npm install -g npm@10.9.9`. Re-run the diagnostic install to confirm.
- Code-level improvement (keeps future failures diagnosable): in `hermes_cli/main.py`
  `_make_tui_argv`, replace `--silent` with `--loglevel=error` — quiet on success,
  preserves error output for `maybe_repair_npm_engine` and the failure preview.
- Prebuilt installs (Docker/Nix) ship `hermes_cli/tui_dist/entry.js` and skip npm
  entirely — no fix needed there; the source path requires a git checkout.

## Pitfalls

- `--silent` (npm loglevel silent) suppresses ALL output including errors. When you
  see "npm install failed." with no preview, the error is being hidden — re-run
  without `--silent` before assuming the registry/network is at fault.
- Repo `.npmrc` also sets `min-release-age=14`; brand-new deps can fail the age gate.
  Check `.npmrc` gates before blaming the registry.
- User `~/.npmrc` may point at a mirror (e.g. `registry.npmmirror.com`,
  `strict-ssl=false`) — affects reproducibility; note it when diagnosing.
- `_tui_need_npm_install` compares the FULL root `package-lock.json` (all workspaces:
  `apps/*`, `web`, `tests-js`) against `node_modules/.package-lock.json`, but the
  launcher installs only `--workspace ui-tui` → the check legitimately returns True
  nearly every launch and runs an idempotent npm install (~4s, "up to date").
  Upstream-intentional (avoids Electron/node-pty deps, #38772). Do NOT "fix" it.
- Missing `@hermes/ink` in `node_modules/@hermes/` is the primary trigger for
  reinstall; `ink` is hoisted to the workspace root, not `ui-tui/node_modules`.

## Testing a fix in a hermes source checkout

System `pytest` may be broken (shebang pointing at a deleted desktop-runtime
python). Install pytest into the hermes venv (match `pyproject.toml [dev]` pins)
and run there:

```bash
cd <hermes checkout>
venv/bin/python -m pip install pytest==9.1.1 pytest-asyncio==1.3.0
venv/bin/python -m pytest tests/hermes_cli/test_tui_npm_install.py \
  tests/hermes_cli/test_tui_resume_flow.py tests/hermes_cli/test_npm_engine.py -q
# also relevant: test_tui_bundled.py test_tui_heap_sizing.py
#   test_tui_mouse_residue_suppression.py test_dashboard_tui_backcompat.py
```

Full `tests/hermes_cli/` may exceed 600s (heavy web_server tests need network);
run the TUI subset instead. For a direct assertion of the generated install cmd,
mock `subprocess.run` and inspect `calls[0][0][0]` (see
`references/tui-npm-ebadengine.md` for the working snippet).

See `references/tui-npm-ebadengine.md` for the full 2026-08 reproduction
transcript: exact error text, code locations, workspace-root discovery, and the
verification commands.
