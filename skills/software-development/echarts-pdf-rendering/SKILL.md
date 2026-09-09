---
name: echarts-pdf-rendering
description: "Render ECharts (and other JS charts) into Chrome-headless A4 PDFs without blank pages. Covers the two render-killing ECharts 5 bugs (layout:'fixed' renders completely blank in SVG mode; type:'tree' throws TypeError), the window.onload init-order requirement for multi-chart pages, per-item borderColor conflicts, local-lib loading over CDN, and the pymupdf zero-drawings verification loop. Use when a generated PDF has blank chart areas, chart titles with no content, or entirely empty pages."
---

# ECharts → Chrome-Headless PDF Rendering

Debug and fix blank/empty charts in PDFs generated from HTML+ECharts via Chrome headless. Companion to html-to-pdf-charts (general pipeline) — this skill is the debugging playbook for when charts DON'T render.

## The Two Render-Killing Bugs (ECharts 5, SVG renderer)

### Bug 1: `layout: 'fixed'` renders completely blank

Graph charts with `layout: 'fixed'` produce **zero content** in SVG mode — chart title shows, chart body is empty, and pymupdf reports only title-level drawings for that region.

**Fix**: replace `layout: 'fixed'` with `layout: 'none'` everywhere. `x`/`y` coordinates behave identically under `'none'`.

```bash
sed -i '' "s/layout: 'fixed'/layout: 'none'/g" file.html
# Also match the no-space variant:
sed -i '' "s/layout:'fixed'/layout:'none'/g" file.html
```

### Bug 2: `type: 'tree'` throws TypeError

`type: 'tree'` aborts the render loop with `TypeError: Cannot read properties of undefined (reading '__original')` and produces a fully blank page (zero drawings).

**Fix**: use `type: 'graph'` with explicit coordinates instead.

## Init-Order Bug: multi-chart pages need window.onload

Without a wrapper, later charts on a long page initialize before their container divs have computed dimensions and render as empty boxes:

```js
window.onload = function() {
  function initChart(id, option) {
    const dom = document.getElementById(id);
    if (!dom) return;
    echarts.init(dom, null, { renderer: 'svg' }).setOption(option);
  }
  // ... all initChart calls
}
```

## itemStyle borderColor Conflict

Graph data items should carry ONLY `color` per item; `borderColor`/`borderWidth` belong at series level. Per-item borderColor can suppress node rendering:

```js
// WRONG
data: [{ name: 'A', itemStyle: { color: '#e8f4fd', borderColor: '#1565c0' } }]
// RIGHT
data: [{ name: 'A', itemStyle: { color: '#e8f4fd' } }],
itemStyle: { borderColor: '#1565c0', borderWidth: 1.5 }
```

## Debugging Sequence (proven order)

1. **Lib loads?** `curl -sI https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js` — if flaky, download to `libs/echarts.min.js` and reference relatively. Never rely on CDN in headless PDF generation.
2. **Console errors?** Add `--enable-logging=stderr --v=0 --dump-dom` to the headless command, grep for `Uncaught TypeError`. This surfaces both bugs above.
3. **Minimal repro.** Single chart in a bare HTML file with the same renderer. If minimal works but the full page doesn't → init-order or config conflict, not the lib.
4. **Diff working vs failing chart on the SAME page.** The difference is usually one option: layout type, borderColor, or an arrow-function formatter.
5. **Per-page verification** (see below).

## Per-Page Verification Loop

```python
import fitz
doc = fitz.open('out.pdf')
for i, p in enumerate(doc):
    d = len(p.get_drawings())
    if d == 0:
        print(f'Page {i+1}: BLANK (render failure)')
print(f'{len(doc)} pages checked')
```

- `drawings == 0` on a chart page → render loop aborted (type:'tree' bug or JS exception)
- drawings exist but only from title text → `layout:'fixed'` bug
- For visual confirmation when vision tooling can't read the file: render pages to PNG (`page.get_pixmap(dpi=120).save(...)`) and inspect those.

## Chrome Headless Flags

| Flag | Purpose |
|------|---------|
| `--no-pdf-header-footer` | Strip title/date/URL/page-number (privacy + clean look) |
| `--virtual-time-budget=8000-10000` | Wait for JS charts on multi-chart pages |
| `--enable-logging=stderr --v=0 --dump-dom` | Debug: surface JS exceptions |

## CSS for A4 chart containers

```css
.chart-container { margin: 10px 0; page-break-inside: avoid; max-height: 420px; }
.chart-container .chart { width: 100%; height: 280px; max-height: 300px; }
```

Missing `max-height` lets an oversized chart push the next section's `page-break-before` onto an otherwise-blank page.

See `references/echarts-blank-page-debugging.md` for the full symptom→cause table and the session transcript of the debugging path.
