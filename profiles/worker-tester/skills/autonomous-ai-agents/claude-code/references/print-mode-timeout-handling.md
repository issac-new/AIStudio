# Claude Code Print Mode — Timeout Handling Guide

## Problem

When delegating large-file edits to Claude Code CLI in print mode (`-p`), the `Edit` tool frequently times out on files >500 lines, even with generous `--max-turns` (5) and timeout (120s). The timeout occurs because Claude must read the entire file into context, locate the precise `old_string`, and then write the replacement — all within a single turn budget.

## Symptoms

```
[Command timed out after 120s]
exit_code: 124
```

Or:

```
Error: Reached max turns (3)
exit_code: 1
```

## When to Use Claude Code vs. Native Hermes Tools

| Scenario | Tool | Why |
|----------|------|-----|
| Small targeted edit (<50 lines) | Claude Code `-p` | Precise `old_string`/`new_string` fits in context |
| File creation | Claude Code `-p` | `Write` tool is fast and reliable |
| Analysis/reporting | Claude Code `-p` | `Read` + natural language questions work well |
| Multi-file autonomous refactor | Claude Code `-p` | Claude determines changes across files |
| Large file (>500 lines) edit | Hermes `patch` | Avoids context window and timeout issues |
| Bulk CSS/JS extraction | Hermes `patch` | Precise line-based replacement |

## Native Hermes Pattern for Large Files

```python
# 1. Inspect file structure
read_file(path="pages/copilot.html", limit=15)

# 2. Locate specific patterns
search_files(path="pages/copilot.html", pattern="\u003c/style\u003e", target="content")

# 3. Read the exact section to replace
read_file(path="pages/copilot.html", offset=11, limit=749)

# 4. Apply the patch
patch(
    path="pages/copilot.html",
    mode="replace",
    old_string="  <style>\n    /* 747 lines of CSS */\n  </style>",
    new_string="  <link rel='stylesheet' href='../css/shared.css'>"
)
```

## Claude Code Workaround for Medium Files

If you MUST use Claude Code for a medium-sized edit, break it into smaller chunks:

```bash
# Instead of one big edit, do it in stages
claude -p "In file.py, replace lines 10-50 (the imports section) with X" --max-turns 3
claude -p "In file.py, replace lines 100-150 (the class definition) with Y" --max-turns 3
```

## Key Insight

Claude Code's `Edit` tool requires the entire `old_string` to match exactly. For large blocks, this means:
1. Claude must read the whole file (consumes context tokens)
2. Claude must locate the exact text (may need multiple reads)
3. Claude must write the replacement (more tokens)

All of this competes for the same turn budget. Native Hermes `patch` bypasses this by operating directly on the filesystem without LLM context constraints.
