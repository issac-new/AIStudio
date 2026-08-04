---
name: mermaid-a4-diagram-design
description: >-
  Design Mermaid diagrams that look good on A4 PDF pages. Covers theme
  selection (base+themeVariables not default), layout direction (TD not LR
  for portrait), subgraph internal direction, dashed vs solid lines,
  structured node labels with separators, SVG width constraints, and a
  pattern-fix table for common "ugly diagram" problems. Complements
  mermaid-pdf-report (which covers the PDF generation pipeline) with the
  diagram aesthetics layer. Use when a user says "图非常丑" or "不协调"
  about Mermaid diagrams in a PDF, or when designing diagrams for A4
  layout from the start.
version: 1.0.0
platforms: [macos, linux]
metadata:
  hermes:
    tags: [mermaid, pdf, diagrams, aesthetics, layout, a4]
    related_skills: [mermaid-pdf-report]
---

# Mermaid A4 Diagram Design

Make Mermaid diagrams look professional on A4 PDF pages.
This is the aesthetics layer — for the PDF generation pipeline
(Chrome headless, --no-pdf-header-footer, virtual-time-budget,
fitz verification), see `mermaid-pdf-report`.

## When to Use

- User says "图非常丑" / "不协调" / "ugly" about Mermaid diagrams
- Designing diagrams for A4 layout from the start
- PDF diagrams overflow the page or look unbalanced
- Mermaid default theme produces inconsistent colors

## Core Principles

### 1. Use `theme: 'base'` with custom themeVariables

The `default` theme produces inconsistent colors and poor contrast.
Use `base` with explicit color control:

```javascript
mermaid.initialize({
  startOnLoad: true,
  theme: 'base',                    // NOT 'default'
  themeVariables: {
    primaryColor: '#e8f4fd',       // light blue node fill
    primaryTextColor: '#1a1a1a',  // dark text
    primaryBorderColor: '#0d4a8f', // blue border
    lineColor: '#0d4a8f',
    secondaryColor: '#f5f8fc',
    tertiaryColor: '#ffffff',
    fontSize: '12px',
    fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif'
  },
  flowchart: {
    htmlLabels: true,
    curve: 'basis',
    padding: 8,
    nodeSpacing: 40,
    rankSpacing: 50,
    useMaxWidth: true,             // CRITICAL: prevents SVG overflow
    wrap: true                     // wraps long labels inside nodes
  },
  sequence: {
    actorMargin: 30,              // tighter than default 50
    boxMargin: 6,
    messageMargin: 25,
    useMaxWidth: true,
    wrap: true
  }
});
```

### 2. Prefer `graph TD` over `graph LR` for A4 portrait

A4 is taller than wide. `graph LR` overflows the right margin.
`graph TD` (top-down) fits naturally.

### 3. Use `direction TB` inside subgraphs

Control internal layout separately from the outer graph:

```
graph LR
    subgraph 外网区 ["外网区"]
        direction TB           ← nodes stack vertically inside
        ME["K3 / GLM-5.2"]
        DE["无权接触敏感数据"]
    end
    subgraph 内网区 ["内网区"]
        direction TB
        MI["GLM-5.1"]
        DD["可接触敏感数据"]
    end
    ME -.->|"能力差"| MI
```

### 4. Use dashed lines (`-.->`) for conceptual relationships

Solid lines = data flow; dashed lines = conceptual relationships.
When two regions are related but don't transfer data, use `-.->`.

### 5. Use `━━` separators inside node labels

For structured node content (title + bullet list):

```
COMP["components/<br/>组件源码<br/>━━━━━━━<br/>• 只有通用逻辑<br/>• 配置槽位<br/>• 无真实值"]
```

Renders as a clean header-body structure, much more readable than
a flat list with just `<br/>`.

### 6. CSS: constrain SVG width

```css
.mermaid svg {
  max-width: 100% !important;
  height: auto !important;
  font-size: 11px !important;
}
.mermaid {
  text-align: center;
  margin: 14px 0;
  page-break-inside: avoid;
  overflow: hidden;
}
```

## Common Ugly-Diagram Patterns and Fixes

| Problem | Fix |
|---------|-----|
| Diagram overflows right margin | Switch `graph LR` → `graph TD` |
| Nodes too sparse/empty | Use `direction TB` inside subgraph to stack nodes |
| Two parallel subgraphs look disconnected | Add `-.->` dashed cross-links with labels |
| Linear chain looks too simple (arrow串) | Add a side node with `C -.- F["约束"]` for context |
| Three isolated subgraphs with unclear relationships | Use `graph TD`, place subgraphs vertically, add solid arrows for data flow |
| Text in nodes too small | Set `fontSize: '12px'` in themeVariables |
| Colors inconsistent/ugly | Use `theme: 'base'` not `'default'` |

## Case Study: Zero-Code-Exit-Domain Report (2026-08-03)

User feedback: "一、七、八、十一 这4个章节的图非常丑"

### Before (ugly)

**Chapter 1**: Two parallel `graph LR` subgraphs with one node each —
looked empty and disconnected.

**Chapter 7**: Linear 5-node horizontal chain
(`A-->B-->C-->D-->E`) — too simple, looked like an arrow string.

**Chapter 8**: Three isolated `graph TB` subgraphs connected by
dashed lines — relationships unclear, layout unbalanced.

**Chapter 11**: Three large nodes in `graph LR` — text was dense,
filled the entire row, no visual hierarchy.

### After (fixed)

**Chapter 1**: Added `direction TB` inside both subgraphs (stacking
two nodes each), added `-.->` dashed cross-links with "能力差"/"信任差"
labels — now shows the core contradiction visually.

**Chapter 7**: Switched to `graph TD` (vertical), added a side node
`C -.- F["约束: 格式/大小/频率/延迟/审计"]` — linear flow + context.

**Chapter 8**: Switched to `graph TD`, placed three subgraphs
vertically (互联网区→交换区→内网区), used `━━` separators inside
nodes, used solid arrows for data flow.

**Chapter 11**: Switched to `graph TD`, added `━━` separator lines,
structured content as "阶段N / ━━━━━━ / role / capability / status".

## Related Skills

- **mermaid-pdf-report** — the PDF generation pipeline (Chrome headless,
  --no-pdf-header-footer, virtual-time-budget, fitz verification)
