---
name: tui-source-edit-build-verify
title: Edit Hermes TUI Source (.tsx) — Build dist/entry.js and Verify
description: "Rebuild dist after TUI .tsx source edits."
triggers:
  - "tui source edit"
  - "appLayout.tsx"
  - "appChrome.tsx"
  - "dist entry.js"
  - "status bar 显示信息不全"
  - "widgets 全部内容没有合并"
  - "tui build"
  - "npm run build"
  - "tui 重新编译"
---

# Edit Hermes TUI Source (.tsx) — Build & Verify

When you edit TUI source files (`.tsx` in `~/.hermes/hermes-agent/ui-tui/src/components/`),
you MUST rebuild `dist/entry.js` — the TUI loads from `dist/`, NOT from `src/`.
This is the #1 cause of "status bar 显示信息不全" and "widgets 全部内容没有
合并进去" reports: the source edits are complete but the dist was never rebuilt.

## When to Use

- You edited `appLayout.tsx`, `appChrome.tsx`, or any `.tsx` under
  `ui-tui/src/components/` and the changes don't appear in the running TUI.
- User reports "status bar 显示信息不全" or "widgets 全部内容没有合并" after
  a TUI customization session.
- You need to verify that source edits actually made it into the bundle.
- You are about to declare TUI edits "done" and need the mechanical check.

## Critical Distinction: .mjs vs .tsx

| Edit target | Path | Reload | Build step? |
|-------------|------|--------|-------------|
| `.mjs` widget files | `~/.hermes/tui-widgets/<name>.mjs` | Hot-reload (~1s) or `/widgets-reload` | **No** |
| `.tsx` source files | `ui-tui/src/components/*.tsx` | **Requires TUI restart** | **YES — `npm run build`** |

Widget `.mjs` files are plain ESM loaded at startup — they hot-reload on save.
Source `.tsx` files are compiled into the bundled `dist/entry.js` — the TUI
loads from `dist/`, so editing `.tsx` without rebuilding has zero effect.

## Build + Verify Sequence

```bash
cd ~/.hermes/hermes-agent/ui-tui

# 1. Edit the .tsx file(s) — e.g. appLayout.tsx, appChrome.tsx
# 2. Typecheck (catches TypeScript errors before build)
npx tsc --noEmit -p tsconfig.json

# 3. Rebuild dist
npm run build    # → updates dist/entry.js (~94ms)

# 4. CRITICAL: Verify dist is newer than src (catches forgotten rebuild)
stat -f "%Sm" -t "%H:%M:%S" dist/entry.js src/components/<file>.tsx
# dist timestamp MUST be >= src timestamp

# 5. CRITICAL: Confirm new code is in the bundle (mechanical check)
grep -c '<new-function-or-segment-name>' dist/entry.js   # must be > 0

# 6. Restart TUI to load the new bundle
```

**Step 5 is the mechanical check that catches "I edited the source but forgot
to rebuild."** If the function/segment you added is NOT in `dist/entry.js`,
the TUI will never see it no matter how many times you restart.

## Common Failure: Stale dist

If the previous session edited `.tsx` files but the dist timestamp is OLDER
than the source timestamp, the dist is stale. The fix is simply:

```bash
cd ~/.hermes/hermes-agent/ui-tui && npm run build
```

Then verify with steps 4-5 above.

## Hermes Secret Redaction in .tsx Files

Hermes redacts secrets in `.tsx` files. A template literal like:

```typescript
{ Authorization: `Bearer ${token}` }
```

gets written to disk as:

```typescript
{ Authorization: *** ${token}` }
```

This is **broken TypeScript** — the `***` is not valid syntax and will cause
parse errors. Use string concatenation instead:

```typescript
{ Authorization: 'Bearer ' + token }
```

This pattern is safe from redaction and produces valid TypeScript. All
`fetch()` calls with `Authorization` headers in `.tsx` files must use this
concatenation form, never template literals.

## Pre-existing Test Failures

The TUI test suite has pre-existing flaky failures (e.g.
`appChromeBlockedTimers.test.tsx` timer-sync flake). To confirm your changes
don't introduce new failures:

```bash
# Run the direct tests for your changed files
npx vitest run src/__tests__/appChromeStatusRule.test.tsx src/__tests__/appChromeStatusRuleDevCredits.test.tsx

# For the full suite, compare failure count with git stash
git stash && npx vitest run 2>&1 | grep "Tests " | tail -1
git stash pop && npx vitest run 2>&1 | grep "Tests " | tail -1
# Failure count should be identical — your changes add zero new failures
```

## Related Skills

- **hermes-tui-customization** (default profile) — widget `.mjs` authoring,
  SDK contract, HTTP-backed live data pattern. This skill complements it by
  covering `.tsx` source edits and the build step. Recommend
  `hermes curator adopt` if you need to extend it from the orchestrator.
- **cc-switch-integration** (default profile) — cc-switch data sources,
  provider APIs, Volcengine V4 signing. Recommend `hermes curator adopt` if
  you need to extend it from the orchestrator.
