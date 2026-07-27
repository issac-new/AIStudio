---
name: soul-enrichment-command-manual
description: >-
  Add or update `## 具体操作命令手册` sections in Hermes agent SOUL.md files — 
  the CLI-command reference sections that turn abstract role descriptions into
  actionable tool knowledge. Covers the Python fallback for when the `patch`
  tool's fuzzy matching fails on `**` markdown bold markers or multiple `---`
  separators, the insert-before-separator technique for privacy-rules-section
  files, and per-profile command tool selection (product-manager gets Linear
  CLI + Pandoc, worker-researcher gets httpx + jq + pandas, etc.). Use when
  enriching any agent's SOUL.md with operation commands — product, ops, or
  collaboration profiles.
version: 1.0.0
platforms: [macos, linux]
metadata:
  hermes:
    tags: [soul-design, product-team, patch-techniques]
    related_skills: [agent-soul-patching, collaboration-team-soul-enrichment, soul-enrichment-pipeline]
---

# SOUL.md Command Manual Enrichment

Add a `## 具体操作命令手册` section to Hermes agent SOUL.md files — the
practical CLI/Python-API reference that turns a role description into
actionable tool knowledge. Complements the hack-team tool-fix workflow
in `agent-soul-patching` with a product/ops-team focus.

## When to Use

- A SOUL.md has no `## 具体操作命令手册` section
- Adding real CLI commands (brew/pip/npm install, tool usage) to a profile
- Batch-enriching multiple profiles (e.g. all product-team profiles at once)
- The `patch` tool failed on `**` bold markers or `---` separators

## Anatomy of a Command Manual Section

Each command manual lives at the end of the main SOUL.md content, just
before the privacy-rules separator (`---`). It groups tools by category:

```markdown
## 具体操作命令手册

### Tool/Platform Name — Short Description

```bash
# Install
brew install toolname           # or: pip install / npm install -g / cargo install

# Key command 1 — what it does
toolname subcommand --flag value

# Key command 2 — another task
toolname subcommand --other-flag value

# Python / advanced usage
python3 << 'EOF'
# script usage
EOF
```
```

### Tool Selection by Profile Type

| Profile Type | Typical Tools to Include |
|---|---|
| product-manager | Linear CLI, Notion API, GWS CLI, Pandoc, xlsxwriter, gh CLI, markdownlint |
| product-researcher | httpx, pandas, jq, matplotlib/plotly, xlsxwriter, curl, pandoc |
| product-feedback | app-store-scraper, vaderSentiment, csvkit, jq, xlsxwriter, TextBlob, NPS calc |
| product-prioritizer | Linear, xlsxwriter (RICE), jq, Python RICE calc, gh CLI, graphviz |
| worker-researcher | httpx, curl, jq, pandas, pandoc, htmlq, csvkit, matplotlib |
| ops-exec-summary | pandoc, jq, yq, graphviz, glow, matplotlib, text processing pipeline |

## Insertion Technique

### The Separator Pattern in SOUL.md Files

All Hermes profile SOUL.md files end with:

```
---

---

## 隐私保护规则（全局强制）
```

You need to insert the command manual BEFORE the first `---`. This is
the critical insertion point.

### Method 1: `patch` (when it works)

Use `patch` with old_string ending BEFORE the `---`:

```python
old_string = "your-unique-content-line\n\n> workspace_kind 规则：..."
# Crucially: NO trailing ---
new_string = old_string + "\n\n## 具体操作命令手册\n\n...commands...\n\n---"
```

**Pitfalls** (see details below):
- `**` in old_string triggers fuzzy matching to find 10+ phantom matches
- `---` at end of old_string matches all `---` lines in the file

### Method 2: Python fallback (when patch fails)

When `patch` returns "Found N matches" on a truly unique string:

```python
import os

filepath = "/path/to/SOUL.md"
with open(filepath, "r") as f:
    content = f.read()

# Find the separator pattern — this is the unique marker
marker = "\n---\n\n\n---\n\n## 隐私保护规则"
idx = content.find(marker)
if idx == -1:
    print("ERROR: marker not found")
    exit(1)

# Insert command block right before the first ---
insert_pos = idx + 1  # after the \n, before the ---
new_content = content[:insert_pos] + command_block + content[insert_pos:]

with open(filepath, "w") as f:
    f.write(new_content)
```

Run this via `terminal()` or `execute_code`. Avoids all fuzzy matching
because Python's `str.find()` does exact byte-level matching.

## Pitfalls

### `**` markdown bold breaks patch's fuzzy matching

The `patch` tool treats `*` as a wildcard/glob pattern. An old_string
containing `**text**` gets interpreted as "anything near text", causing
"Found N matches" errors (N=10-20) even when the string is unique.

**Fix**: Use Python fallback (Method 2) whenever old_string contains `**`.
Do NOT attempt to escape the asterisks — the fuzzy matching has no escape
mechanism for wildcards.

### `---` at end of old_string matches all separators

SOUL.md files have multiple `---` lines. If old_string ends with `---`,
the fuzzy matcher matches the closest `---` after every occurrence of the
preceding text. For long old_strings this finds 2 matches (the first and
second `---` separators). For short ones it finds many more.

**Fix**: End old_string just before the `---`. The Python fallback
(Method 2) avoids this entirely by using exact matching.

### Multiple `---` lines are not identical

The two `---` in the footer are separated by blank lines:
```
---
[1-2 empty lines]
---
[empty]
## 隐私保护规则
```
The second `---` is part of the `---\n\n## 隐私保护规则` marker. If you
accidentally target the second one, your command manual ends up AFTER the
privacy rules section — breaking the file structure. Always verify the
insertion point by checking the lines around `---`.

### Verify after insertion

After inserting, verify:
1. `grep -c "## 具体操作命令手册"` returns exactly 1
2. The `---` separator and `## 隐私保护规则` section are still at the end
3. The command manual appears before `---`, not after it

```bash
grep -n "## 具体操作命令手册\|^---$\|## 隐私保护规则" SOUL.md | tail -10
```
