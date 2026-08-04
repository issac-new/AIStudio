---
name: tui-status-bar-merge
description: "Merge widget data into TUI status bar. Fix fits() drop."
version: 1.0.0
author: Hermes Agent
license: MIT
platforms: [macos, linux]
tags: [tui, status-bar, ccswitch, appLayout, appChrome, fits, truncate]
---

# TUI Status Bar Widget Merge

Merge data from a `.mjs` widget file into the status bar's `useCcSwitchExtra()`
tail segment in `appLayout.tsx`, and fix the `fits()` whole-segment-drop that
causes "一闪而过" (flash-then-disappear) when the merged line is too long.

## When to Use

- User says "widgets的全部内容没有合并进去" or "status bar显示信息不全".
- User says "status bar 信息一闪而过没有了" (ccExtra too long, gets dropped).
- You need to add/remove display fields from the status bar ccExtra line.
- You need to align widget (.mjs) and status bar (.tsx) output formats.

## Two Rendering Paths

| Path | File | Renders |
|------|------|---------|
| `/ccswitch` docked panel | `~/.hermes/tui-widgets/ccswitch.mjs` | Full card (toggle on demand) |
| Status bar tail segment | `ui-tui/src/components/appLayout.tsx` -> `useCcSwitchExtra()` | Compact one-line (always visible) |

Both paths query the same data sources (cc-switch proxy `/status` + SQLite DB +
provider APIs), but are **independent code**. The widget `.mjs` hot-reloads;
the `.tsx` requires `npm run build` + TUI restart.

## Full ccExtra Output Line

```
provider │ model │ effort │ usage │ lastReq(model tokens latency status time) │ ip+weather
```

### Usage format per provider

| Provider | Format |
|----------|--------|
| kimi-mid/max | `5h X% │ 7d Y%` |
| bigmodel | `5h X% │ 7d Y%` |
| deepseek | `X CNY` |
| huoshan (Volcengine) | `5h X% │ 7d Y% │ mo Z%` |
| weekly-z.ai / opus5 | `1h X% (N/500)` |

### Last request fields

From `proxy_request_logs` table in `~/.cc-switch/cc-switch.db`:

| Field | Display | Example |
|-------|---------|---------|
| model | `split('/').pop()` | `glm-5.2` |
| input_tokens + output_tokens | `fmtK(in)->fmtK(out)` | `89k->1k` |
| latency_ms | `${latency}ms` | `43549ms` |
| first_token_ms | `ttft ${ft}ms` (optional) | `ttft 3803ms` |
| status_code | `200✓` or `${code}✗` | `200✓` |
| error_message | first 15 chars (if non-200) | |
| created_at | `HH:MM:SS` (localtime) | `16:35:41` |

`fmtK` is imported from `../lib/text.js` - formats numbers compactly (89k, 1.2M).

## User Display Preferences

These were explicitly requested during merge sessions:

- **No cost**: do not show `total_cost_usd` in the last-request segment.
- **No city name**: IP+weather shows `ipAddr weather` only, drop the `来自于：`
  location string from `myip.ipip.net`.
- **Status explicit**: `200✓` / `503✗` format (not bare `✓`/`✗`).

## `fits()` Whole-Segment-Drop Fix (一闪而过)

The status bar (`appChrome.tsx` `StatusRule`) uses a tail-budget system: each
segment calls `fits(SEP + stringWidth(text))` - if the remaining budget can't
fit the WHOLE segment, it returns false and the segment is **entirely dropped**
(not truncated). When ccExtra grows to ~130 chars after merging all segments,
`showCcExtra` fails and the line disappears.

### Fix: truncation fallback in appChrome.tsx

```typescript
// Before (whole-segment drop):
const showCcExtra = !!ccExtra && fits(SEP + stringWidth(ccExtra))

// After (truncation fallback):
const ccExtraFitsFully = !!ccExtra && fits(SEP + stringWidth(ccExtra))
const ccExtraTruncated = !ccExtraFitsFully && !!ccExtra && tailBudget > SEP + 8
if (ccExtraTruncated) {
  tailBudget = 0 // consume all remaining budget
}
// Render:
// {ccExtraFitsFully || ccExtraTruncated ? (
//   <Text color={t.color.muted} wrap="truncate-end">{' │ '}{ccExtra}</Text>
// ) : null}
```

`wrap="truncate-end"` handles visual truncation; `tailBudget > SEP + 8` guards
against showing a uselessly tiny fragment (minimum ~8 chars visible).

## Build & Verify

```bash
cd ~/.hermes/hermes-agent/ui-tui

# 1. Typecheck
npx tsc --noEmit -p tsconfig.json

# 2. Build dist
npm run build    # -> updates dist/entry.js

# 3. Verify new code is in the bundle
grep -c '<new-segment-name>' dist/entry.js   # must be > 0

# 4. Run status bar tests
npx vitest run src/__tests__/appChromeStatusRule.test.tsx src/__tests__/appChromeStatusRuleDevCredits.test.tsx

# 5. Restart TUI to load new bundle
```

## Hermes Secret Redaction in .tsx Files

Hermes redacts `Bearer ${token}` template literals to `*** ${token}\`` which is
broken TypeScript. Use string concatenation instead:

```typescript
// BROKEN (gets redacted to invalid syntax):
{ Authorization: `Bearer ${token}` }

// SAFE:
{ Authorization: 'Bearer ' + token }
```

## Key Files

| File | Role |
|------|------|
| `ui-tui/src/components/appLayout.tsx` | `useCcSwitchExtra()` + `useCcSwitchModel()` hooks |
| `ui-tui/src/components/appChrome.tsx` | `StatusRule` component + `fits()` tail budget + `showCcExtra` |
| `~/.hermes/tui-widgets/ccswitch.mjs` | Widget `.mjs` (hot-reload, no build) |
| `~/.cc-switch/cc-switch.db` | SQLite DB: `providers`, `proxy_request_logs` |

## Related Skills

- **cc-switch-integration** (default profile) - provider API endpoints,
  Volcengine V4 signing, DB schema. Recommend `hermes curator adopt` if you
  need to extend it from the orchestrator.
- **hermes-tui-customization** (default profile) - widget `.mjs` SDK contract,
  zones, modes. Recommend `hermes curator adopt`.
- **tui-source-edit-build-verify** (default profile) - build/verify sequence
  for `.tsx` edits. Recommend `hermes curator adopt`.
