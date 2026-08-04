---
name: mermaid-pdf-report
description: >-
  Generate professional PDF reports from HTML+Mermaid diagrams using Chrome
  headless print-to-pdf. Covers the no-header-footer flag, Mermaid CDN
  rendering with virtual-time-budget, CSS page-break control for A4 layout,
  and programmatic PDF verification with pymupdf (fitz) when vision_analyze
  cannot process PDF pages. Use when the user asks for a PDF version of any
  markdown/HTML document, especially reports with architecture diagrams,
  flowcharts, or sequence diagrams.
version: 1.0.0
platforms: [macos, linux]
metadata:
  hermes:
    tags: [pdf, mermaid, chrome, report, documentation, diagrams]
    related_skills: [report-data-verification, markdown-viewer]
---

# Mermaid PDF Report Generation

Generate professional PDF reports from HTML+Mermaid — no LaTeX, no pandoc,
no external PDF library. Just Chrome headless + Mermaid CDN + CSS.

## When to Use

- User asks for a PDF version of a markdown document or architecture plan
- Report contains diagrams (flowcharts, sequence diagrams, architecture)
- User wants no headers/footers (no time/date/file path in margins)
- User wants A4 layout with no diagram split across pages

## The Workflow

### Step 1: Write HTML with Mermaid CDN

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
<style>
@page { size: A4; margin: 18mm 15mm 15mm 15mm; }
* { box-sizing: border-box; }
body { font-family: "PingFang SC", "Microsoft YaHei", sans-serif;
       line-height: 1.55; font-size: 13px; max-width: 760px; margin: 0 auto; }
h2 { page-break-after: avoid; }           /* don't break right after a heading */
table, .mermaid { page-break-inside: avoid; } /* don't split diagrams/tables */
.note, .danger, .safe { page-break-inside: avoid; }
.mermaid { text-align: center; margin: 16px 0; }
.page-break { page-break-before: always; }   /* manual page breaks for major sections */
</style>
</head>
<body>
<!-- content with <div class="mermaid">graph TD...</div> blocks -->
<script>
mermaid.initialize({startOnLoad: true, theme: 'default',
  flowchart: {htmlLabels: true, curve: 'basis'},
  sequence: {actorMargin: 40, mirrorActor: false}});
</script>
</body>
</html>
```

### Step 2: Generate PDF with Chrome Headless

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless \
  --disable-gpu \
  --no-pdf-header-footer \    # CRITICAL: suppresses title/url/date/page-number
  --print-to-pdf=/path/to/output.pdf \
  --virtual-time-budget=8000 \  # wait for Mermaid JS to render (ms)
  "file:///path/to/input.html"
```

**Key flags:**
- `--no-pdf-header-footer` — removes ALL headers/footers (title, URL, date, page number). Must use this exact flag name. `--print-to-pdf-no-header` does NOT fully suppress; `--no-margins` alone doesn't suppress either.
- `--virtual-time-budget=8000` — gives Mermaid CDN time to load and render SVGs before Chrome captures the page. Without this, diagrams may be blank.

### Step 3: Verify the PDF (when vision_analyze fails)

`vision_analyze` often cannot process PDF pages directly (returns "Unsupported Image").
Use pymupdf (fitz) for programmatic verification instead:

```python
import fitz  # pip install pymupdf / anaconda pip install pymupdf

doc = fitz.open('output.pdf')
print(f'Pages: {len(doc)}')

for i, page in enumerate(doc):
    d = len(page.get_drawings())  # vector graphics count
    t = page.get_text()
    text_len = len(t.strip())

    # Check header/footer (top/bottom 40-50px)
    rect = page.rect
    top = page.get_text(clip=fitz.Rect(0, 0, rect.width, 40)).strip()
    bot = page.get_text(clip=fitz.Rect(0, rect.height - 40, rect.width, rect.height)).strip()

    # Check for leaked paths (privacy)
    has_path = any(x in t for x in ['cuishi', 'file:///', '/workspace/'])

    print(f'Page {i+1}: drawings={d}, text={text_len}, '
          f'header=[{top[:40]}], footer=[{bot[:40]}], has_path={has_path}')

# Interpretation:
# - drawings > 0 on diagram pages = Mermaid rendered as SVG ✓
# - drawings == 0 = Mermaid did NOT render (blank page) ✗
# - header/footer empty = no privacy leak ✓
# - has_path = False = no file path leaked ✓
doc.close()
```

**Verification checklist:**
- [ ] Page count reasonable (not 1 page for a multi-section doc)
- [ ] Drawings count > 0 on pages that should contain Mermaid diagrams
- [ ] No raw Mermaid syntax in text (no `graph TD` or `sequenceDiagram` as plain text)
- [ ] Header region (top 40px) is empty — no title/date/URL
- [ ] Footer region (bottom 40px) is empty — no page number/path
- [ ] No file paths in text content (no `cuishi`, `file:///`, `/workspace/`)

### Step 4 (optional): Render pages to images for visual check

```python
import fitz
doc = fitz.open('output.pdf')
for i in [0, 1, 2]:  # first few pages
    page = doc[i]
    pix = page.get_pixmap(dpi=150)
    pix.save(f'/tmp/pdf-page-{i}.png')
    # Then use vision_analyze on the PNG (not the PDF)
doc.close()
```

Note: Even PNG exports from pymupdf may show as "Unsupported Image" in
vision_analyze. The drawings-count + text-extraction method above is
the reliable verification path.

## Pitfalls

### `--print-to-pdf-no-header` does NOT fully suppress headers

This flag is a weaker variant. Use `--no-pdf-header-footer` instead.
If you only use `--no-margins`, Chrome still prints the page title and
URL in the header area.

**Symptom**: `get_text()` on page 0 shows
`file:///Users/username/path/to/file.html` in the header.

**Fix**: Switch to `--no-pdf-header-footer`.

### Mermaid diagrams render as blank without virtual-time-budget

Chrome headless captures the page before Mermaid CDN finishes loading
the JS and rendering SVGs.

**Symptom**: Pages that should have diagrams show `drawings=0`.

**Fix**: Add `--virtual-time-budget=8000` (or higher for large documents).

### `vision_analyze` cannot process PDF pages or pymupdf PNG exports

Returns `[Unsupported Image]` for both PDF files and PNG screenshots
of PDF pages.

**Fix**: Use the pymupdf drawings-count + text-extraction method
described in Step 3. This is a programmatic proxy for visual inspection.

### page-break-inside: avoid doesn't prevent all splits

CSS `page-break-inside: avoid` works for simple elements (tables,
`.mermaid` divs) but Chrome may still split complex nested structures.

**Mitigation**: Add `.page-break { page-break-before: always; }` class
to `<h2>` tags for major sections, forcing a new page before each
chapter heading.

### Mermaid `subgraph` with long labels overflows on A4

Mermaid auto-sizes SVG width to content. Very wide flowcharts may
exceed A4 width and get clipped.

**Mitigation**: Keep `subgraph` labels short. Use `graph TD` (top-down)
instead of `graph LR` (left-right) for tall narrow layouts that fit A4
portrait better.

## Multi-Version Iteration Pattern

When producing a technical architecture/security report:

1. **v1.0**: Write the initial HTML from your own knowledge
2. **User feedback**: "方案有些单薄" / "not deep enough" / "didn't use team capabilities"
3. **v2.0+**: Dispatch parallel review subagents (architect, hack-auditor,
   hack-forensics) to review the plan from their specialized angles,
   then integrate their findings into the next version

See `references/multi-profile-review-pattern.md` for the dispatch +
integration workflow.

## Related Skills

- **report-data-verification** — verify all numbers before writing (run
  `wc -l`, `grep`, `config.yaml` reads BEFORE composing the report)
- **markdown-viewer** — alternative for in-chat Markdown rendering
  (Mermaid-like diagrams in chat without PDF generation)
