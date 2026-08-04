---
name: hermes-tui-customization
title: Customize the Hermes TUI — Widgets and Live Panels
description: "Author TUI widgets and docked panels. Use for live panels."
triggers:
  - "TUI widget"
  - "tui panel"
  - "tui 状态"
  - "dock panel"
  - "ambient widget"
  - "live readout tui"
  - "slash command widget"
  - "show in tui"
  - "在 tui 显示"
---

# Customize the Hermes TUI

Author widget apps for the Hermes Ink TUI (`hermes --tui`): glanceable ambient
panels docked above/below the status bar, or modal overlays that own the
keyboard. Widgets are plain ESM files the TUI loads at startup — no build
step, no repo changes, hot-reload on save.

## When to Use

- The user asks to show live data in the TUI (API status, clock, metrics,
  provider info, queue depth).
- The user wants a custom slash command that renders a panel instead of
  just text.
- The user says "在 tui 显示 X" or "show X in the TUI".

## Prerequisites

- TUI must be in use (`hermes --tui` or `display.interface: tui`). Widgets
  do not render in the classic CLI or messaging platforms.
- For network-backed widgets: the endpoint must be reachable from the Node
  process (localhost endpoints work; remote endpoints need CORS or a local
  proxy).

## Widget SDK Contract

A widget file at `~/.hermes/tui-widgets/<name>.mjs` default-exports
`register(sdk)` and calls `defineWidgetApp({...})`:

```js
export default function register(sdk) {
  const { Box, Text, Dialog, React, defineWidgetApp, h } = sdk

  defineWidgetApp({
    id: 'mywidget',              // slash command name
    help: 'one-line description',
    mode: 'ambient',             // 'ambient' docks; 'modal' takes input
    zone: 'dock-bottom',         // placement zone
    init(arg) { return { arg } },  // null = print usage
    reduce(state, { ch, key }) {
      return key.escape || ch === 'q' ? null : state
    },
    render({ state, t }) {
      return h(Dialog, { width: 30 },
        h(Text, { color: t.color.label }, 'Hello'))
    }
  })
}
```

### SDK contents

`sdk` provides: `defineWidgetApp`, `openWidget`, `updateWidget`, `isCtrl`,
`React`, `h` (createElement — no JSX in .mjs), components `Box`, `Text`,
`Dialog`, `Overlay`, `WidgetGrid`, `GridAreas`, loaders `Shimmer`,
`ShimmerRows`, `useShimmerPhase`, chart builders `sparkline`, `sparkRows`,
`gauge`, `hbars`, and `Accordion`.

### Modes & zones

- `mode: 'ambient'` — captures no input, `/id` toggles it. `render` returns
  a CARD (usually `Dialog`), never `Overlay`. Placement via `zone`:
  - Docks: `dock-top` (under top status bar), `dock-bottom` (above bottom
    status bar — default).
  - Rails (side columns): `top-left`, `top-right`, `bottom-left`,
    `bottom-right`. Set `width` on the app to match card width.
- `mode: 'modal'` (default) — owns every keypress. `render` wraps content
  in `Overlay`. Must have a close path (`Esc`/`q` returning `null`).

## Workflow

1. Write `~/.hermes/tui-widgets/<name>.mjs` (see `templates/ccswitch.mjs`
   for a complete HTTP-backed example).
2. If TUI is running, it hot-loads within ~1s. `/widgets-reload` forces
   a rescan.
3. `/<id>` to launch. For ambient widgets, `/<id>` again to dismiss.
4. Edit the file — it hot-reloads on save (last-writer-wins). Relaunch
   `/<id>` to remount.

## HTTP-backed live data pattern

For widgets that poll a local HTTP endpoint (e.g. a proxy status API):

```js
function useStatus() {
  const [phase, setPhase] = React.useState('loading')
  const [data, setData] = React.useState(null)

  React.useEffect(() => {
    let cancelled = false
    async function fetchOnce() {
      try {
        const res = await fetch(URL, { signal: AbortSignal.timeout(2500) })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const j = await res.json()
        if (cancelled) return
        setData(j); setPhase('ok')
      } catch (e) {
        if (cancelled) return
        setPhase('error')
      }
    }
    fetchOnce()
    const id = setInterval(fetchOnce, REFRESH_MS)
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  return { phase, data }
}
```

Key points:
- `fetch` works from the Node process — localhost endpoints are reachable
  without CORS.
- Use `AbortSignal.timeout(ms)` to avoid hanging on unresponsive endpoints.
- Always render three phases: `loading`, `ok`, `error`. Never crash on a
  fetch failure — land it as an error card.
- The `cancelled` flag prevents stale responses from updating an unmounted
  component.

## Stable sizing rules (cards must NOT resize while ticking)

- Give `Dialog` an explicit `width`.
- Pad dynamic numbers: `String(v).padStart(6)` — `51 ms` → `112 ms` must
  not change line length.
- Keep row counts constant per phase; swap content, not structure.

## Colors

ALWAYS theme tones (`t.color.primary/label/muted/ok/error/…`), never
hardcoded hexes — widgets must survive `/skin` and light/dark themes.

## Pitfalls

- **No JSX and no bare imports** in `.mjs` — everything comes from the
  `sdk` parameter; `h(...)` builds elements.
- **Ambient widgets must stay small** (≤ ~6 rows) — the dock sits between
  the transcript and the status bar.
- **A thrown `register()` is logged and skipped** — check
  `~/.hermes/logs/tui_gateway_crash.log` if a widget never appears.
- **`/models` listing warning is benign for proxy mode** — when Hermes
  uses a local proxy (e.g. cc switch), the model name won't appear in the
  proxy's `/models` listing, but the proxy ignores the model field anyway.
  Do not try to "fix" this by adding model declarations; it's expected.

## Verification

```bash
# 1. Syntax check the widget file
node --check ~/.hermes/tui-widgets/<name>.mjs

# 2. Confirm the endpoint is reachable from Node's network stack
curl -s --max-time 2 <endpoint-url>

# 3. In the TUI: /widgets-reload → should list the file under "loaded:"
# 4. In the TUI: /<id> → ambient widget docks; /<id> again to dismiss
```

## Templates

- `templates/ccswitch.mjs` — a complete HTTP-backed ambient widget that
  polls a local proxy's `/status` endpoint every 4s and docks a card
  showing provider name, failover count, success rate, and last-request
  time. Copy and adapt for any localhost-API-backed status panel.

## Related Skills

- **hermes-agent** (bundled) — the `tui-widgets.md` reference is the
  authoritative SDK doc; this skill captures the authoring workflow and
  the HTTP-backed pattern not covered there.
- **local-proxy-provider-unification** (default profile) — when the widget
  surfaces proxy state (e.g. cc switch `/status`), that skill explains the
  proxy architecture. Recommend `hermes curator adopt` if you need to
  extend it from the orchestrator profile.
