---
name: diagram-type-selection
description: "Map content to the correct diagram/chart type before writing any code. Skipping this step and defaulting everything to one chart type is the #1 cause of '图和内容不匹配' feedback. Covers the content→type mapping table, when to use Graphviz vs ECharts vs Mermaid, and the narrow-image/overlap verification loop."
---

# Diagram Type Selection

Map content to the correct diagram type **before** writing any code. This is the design step that prevents "图和内容不匹配" — the most common user complaint about generated PDFs.

## Content → Diagram Type Mapping

| Content type | Best tool | Diagram type | Why |
|---|---|---|---|
| **Comparison** (A vs B metrics) | ECharts | `type: 'bar'` | Direct value comparison, clearest for 2-4 categories |
| **Hierarchy** (标准→子标准) | Graphviz | Tree `rankdir=LR` | Root left, children right, clear parent-child |
| **Process/workflow** (step1→step2→step3) | Graphviz | Flowchart `rankdir=TB` | Sequential flow, auto-layout, no JS dependency |
| **Zone isolation** (内网/交换区/互联网) | Graphviz | Swimlane clusters | `subgraph cluster_*` per zone, edges cross clusters |
| **Relationship network** | ECharts | `type: 'graph', layout: 'force'` | Force-directed for organic relationships |
| **Multi-dimensional comparison** | ECharts | `type: 'radar'` | Only when comparing 3+ dimensions across 2-3 entities |
| **Timeline/stages** | Graphviz | Flowchart `rankdir=LR` | Left-to-right progression |
| **Actor interaction** (妈妈→孩子→爸爸) | Graphviz | Linear chain `rankdir=TB` | Actor-colored nodes with action labels |
| **Route/itinerary** (地点A→地点B) | Graphviz | Flowchart with transport clusters | Transport nodes in orange, activity nodes in green |
| **Sequence diagram** (API calls, message flow) | Mermaid | `sequenceDiagram` | Mermaid's strongest feature, no Graphviz equivalent |

## Decision Rules

1. **Hierarchy >3 levels** → Graphviz tree (NOT ECharts tree — it's broken in ECharts 5)
2. **Zone isolation** → Graphviz swimlane clusters (NOT ECharts graph — no cluster support)
3. **Simple bar comparison** → ECharts bar (fast, interactive)
4. **Sequence/interaction** → Mermaid sequenceDiagram (only option)
5. **Everything else** → Graphviz PNG (most reliable, no JS rendering issues)

## When to Skip ECharts Entirely

Use Graphviz PNG instead when:
- Chart has >3 levels of hierarchy
- Chart has >10 nodes
- Chart needs zone/cluster isolation
- PDF must be generated without JS execution
- User has complained about ECharts rendering bugs before

## Verification After PDF Generation

### Check for narrow images (unreadable text)

```python
import fitz
doc = fitz.open("out.pdf")
for i, page in enumerate(doc):
    for img_info in page.get_images(full=True):
        for rect in page.get_image_rects(img_info[0]):
            ratio = rect.width / page.rect.width * 100
            if ratio < 40:
                print(f"Page {i+1}: image only {ratio:.0f}% width — too narrow")
```

**Fix**: rotate vertical images 90° with PIL, or redesign with `rank=same` in Graphviz.

### Check for image-text overlap

```python
import fitz
doc = fitz.open("out.pdf")
for i, page in enumerate(doc):
    for img_info in page.get_images(full=True):
        for rect in page.get_image_rects(img_info[0]):
            for block in page.get_text("blocks"):
                if block[6] == 0 and fitz.Rect(block[:4]).intersects(rect):
                    print(f"Page {i+1}: OVERLAP detected")
```

**Fix**: insert `<div style="height:12px;"></div>` after every chart container in HTML.

## Anti-Patterns (from user feedback)

| Anti-pattern | What happens | Fix |
|---|---|---|
| All charts use `type: 'graph'` | 图和内容不匹配 | Use the mapping table above |
| Skip content→type mapping | 5轮打补丁，没有根因分析 | Do the mapping FIRST, before writing any code |
| Use `layout: 'fixed'` | Blank chart (ECharts bug) | Use `layout: 'none'` |
| Use `type: 'tree'` | Blank page (ECharts bug) | Use Graphviz tree |
| Trust `drawings > 0` as "OK" | 图能看≠图和内容匹配 | Verify with vision or content check |
| No spacer after chart | Image-text overlap | Always add `<div style="height:12px;"></div>` |

## Related Skills

- **graphviz-pdf-diagrams** — Graphviz templates, color palette, PNG generation
- **echarts-pdf-rendering** — ECharts bug fixes, init-order, verification
- **mermaid-a4-diagram-design** — Mermaid aesthetics when you must use Mermaid
- **html-to-pdf-charts** — Chrome headless PDF generation pipeline