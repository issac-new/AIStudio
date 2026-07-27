---
name: python-data-visualization
description: "Python data visualization best practices and headless-environment pitfalls for matplotlib, seaborn, and plotly. Covers non-interactive rendering, font issues, and ACP fallback patterns."
version: 1.0.0
author: Hermes Agent
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [python, matplotlib, visualization, headless, plotting, data-science]
    related_skills: [jupyter-live-kernel]
---

# Python Data Visualization — Headless Environment Guide

> For Hermes workers and agents generating charts, plots, and visualizations in non-interactive environments (servers, containers, CI/CD, background tasks).

## When to Use This Skill

- Generating matplotlib/seaborn charts in headless environments
- Creating algorithm visualizations (sorting, graph traversal, etc.)
- Building dashboards or reports programmatically
- Running visualization code via ACP agents or background processes

## Core Principle: Never Block on `plt.show()`

In headless/agent environments, `plt.show()` opens a GUI window that never closes, causing the process to hang indefinitely. Always use file-based output.

### ✅ Correct Pattern
```python
import matplotlib.pyplot as plt

# Generate your plot
fig, ax = plt.subplots()
ax.plot([1, 2, 3], [1, 4, 9])

# Save to file, then close
plt.savefig('/tmp/output.png', dpi=150, bbox_inches='tight')
plt.close('all')  # Critical: frees memory, prevents figure accumulation
```

### ❌ Anti-Pattern (Hangs in Headless Mode)
```python
plt.plot([1, 2, 3], [1, 4, 9])
plt.show()  # ← Blocks forever in non-interactive environments
```

## Font and Emoji Handling

### Problem: Emoji Characters Cause Warnings or Missing Glyphs

macOS with Chinese fonts (Arial Unicode MS, SimHei) often lacks emoji support. This produces warnings like:
```
UserWarning: Glyph 128202 (\N{BAR CHART}) missing from font(s) Arial Unicode MS.
```

### Solution: ASCII/Unicode Fallbacks

Replace emoji with ASCII or simple Unicode equivalents:

| Emoji | ASCII Fallback | Unicode Fallback |
|-------|---------------|------------------|
| 📊 | [Chart] | ▓▓▓ |
| ✅ | [OK] | ✓ |
| ❌ | [FAIL] | ✗ |
| 🚀 | [Start] | → |
| 🎉 | [Done] | ★ |
| ✂️ | [Split] | / |
| 🔀 | [Merge] | ↔ |
| 🔄 | [Process] | ⟳ |

### Code Pattern
```python
# Bad: emoji in labels
ax.set_title('🎉 Sorting Complete!')

# Good: ASCII fallback
ax.set_title('[Done] Sorting Complete!')

# Better: conditional based on environment
import os
if os.environ.get('HERMES_ENV'):
    # Headless/agent mode: use ASCII
    labels = {'initial': '[Initial]', 'done': '[Done]'}
else:
    # Interactive mode: can use emoji
    labels = {'initial': '📊 Initial', 'done': '🎉 Done'}
```

## ACP Agent Timeout Fallback

### Problem: `acp_send` Times Out on Complex Tasks

When delegating visualization coding to ACP agents (OpenCode, Claude Code via ACP), long-running tasks may timeout:
```json
{"stop_reason": "timeout", "tool_calls": [...]}
```

### Solution: Immediate Fallback to Direct File Operations

```python
# Step 1: Try ACP delegation
result = acp_send(
    provider="opencode",
    prompt="Create a matplotlib visualization script..."
)

# Step 2: Check for timeout
if result.get('stop_reason') == 'timeout':
    # Fallback: write the file directly
    write_file(
        path='/tmp/visualization.py',
        content="""import matplotlib.pyplot as plt
# ... full script content ...
"""
    )
    print("⚠️ ACP timeout — wrote file directly")
```

### Complete Fallback Pattern
```python
def generate_visualization_with_fallback(output_path, data):
    """Try ACP first, fallback to direct file write on timeout."""
    
    # Attempt 1: ACP delegation
    acp_result = acp_send(
        provider="opencode",
        prompt=f"Create a bar chart visualization for {data}..."
    )
    
    if acp_result.get('stop_reason') != 'timeout':
        return acp_result
    
    # Attempt 2: Direct file generation
    import matplotlib
    matplotlib.use('Agg')  # Non-interactive backend
    import matplotlib.pyplot as plt
    
    fig, ax = plt.subplots(figsize=(10, 6))
    ax.bar(range(len(data)), data)
    ax.set_title('[Chart] Data Visualization')
    
    plt.savefig(output_path, dpi=150, bbox_inches='tight')
    plt.close('all')
    
    return {'status': 'fallback', 'path': output_path}
```

## Non-Interactive Backend Setup

### Force Aggressive Backend (Before Importing pyplot)
```python
import matplotlib
matplotlib.use('Agg')  # Must be before importing pyplot
import matplotlib.pyplot as plt
```

Common backends:
| Backend | Use Case |
|---------|----------|
| `Agg` | PNG output, most reliable |
| `SVG` | Vector graphics |
| `PDF` | PDF documents |
| `PS` | PostScript |

## Memory Management for Batch Generation

When generating many plots in a loop:
```python
import matplotlib.pyplot as plt

for i, dataset in enumerate(datasets):
    fig, axes = plt.subplots(2, 2, figsize=(12, 10))
    # ... plot data ...
    
    plt.savefig(f'/tmp/plot_{i:03d}.png', dpi=150)
    plt.close('all')  # Critical: prevents memory leak
    
    # Optional: heartbeat for long batches
    if i % 10 == 0:
        kanban_heartbeat(note=f"Generated {i}/{len(datasets)} plots")
```

## Color Schemes for Accessibility

Avoid relying solely on color to convey information. Use patterns + color:
```python
# Good: color + hatch pattern
ax.bar(x, y, color=['#3498db', '#e74c3c'], hatch=['/', '\\'])

# Good: explicit labels on bars
for bar in bars:
    height = bar.get_height()
    ax.text(bar.get_x() + bar.get_width()/2., height,
            f'{height}', ha='center', va='bottom')
```

## Verification Checklist

Before running visualization code in headless mode:

- [ ] `matplotlib.use('Agg')` set before `import pyplot`
- [ ] No `plt.show()` calls (replace with `plt.savefig()`)
- [ ] `plt.close('all')` after every save
- [ ] Emoji replaced with ASCII or Unicode fallbacks
- [ ] Output paths are absolute (not relative)
- [ ] DPI and figure size appropriate for use case
- [ ] Memory cleanup for batch operations

## Pitfalls

1. **Backend must be set BEFORE importing pyplot** — `matplotlib.use()` has no effect after `import matplotlib.pyplot as plt`
2. **Figure accumulation without `plt.close()`** — Each `plt.subplots()` creates a new figure. Without closing, memory grows unbounded.
3. **Relative paths in containers** — Always use absolute paths or `$HERMES_KANBAN_WORKSPACE`
4. **Font caching on first run** — Matplotlib builds font cache on first import; this can take 10-30 seconds. Not a bug, just wait.
5. **Color maps and accessibility** — 8% of males are colorblind. Don't rely on color alone.

## Templates

### Basic Bar Chart (Algorithm Visualization)
```python
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np

def visualize_array(arr, title, highlight_indices=None, output_path=None):
    """Visualize an array as a bar chart with optional highlighting."""
    fig, ax = plt.subplots(figsize=(10, 6))
    
    x = np.arange(len(arr))
    colors = ['#3498db'] * len(arr)
    if highlight_indices:
        for idx in highlight_indices:
            colors[idx] = '#e74c3c'
    
    bars = ax.bar(x, arr, color=colors, alpha=0.8, edgecolor='black')
    
    # Add value labels
    for bar, val in zip(bars, arr):
        ax.text(bar.get_x() + bar.get_width()/2., bar.get_height(),
                str(val), ha='center', va='bottom', fontsize=10)
    
    ax.set_title(title, fontsize=14, fontweight='bold')
    ax.set_xlabel('Index')
    ax.set_ylabel('Value')
    ax.set_xticks(x)
    ax.set_xticklabels([str(i) for i in range(len(arr))])
    ax.grid(axis='y', alpha=0.3)
    
    if output_path:
        plt.savefig(output_path, dpi=150, bbox_inches='tight')
        plt.close('all')
    
    return fig
```

## References

- See `references/headless-matplotlib-troubleshooting.md` for specific error messages and fixes
- See `templates/algorithm-visualization.py` for a complete sorting algorithm visualization template
