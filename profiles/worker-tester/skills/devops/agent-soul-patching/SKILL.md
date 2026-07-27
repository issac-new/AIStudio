---
name: agent-soul-patching
description: >-
  Batch-patch agent SOUL.md files: fix existing install commands (apt→brew,
  vague go install→full import paths) and append new tool sections. Covers
  the two-phase patch pattern, append-at-end technique, concurrency batching
  of independent patches, offset/limit pagination warnings, and unique-string
  matching in large files. Use when acting on a gap analysis to patch SOUL.md
  files with new tools and corrected install commands.
version: 1.0.0
platforms: [macos, linux]
metadata:
  hermes:
    tags: [soul-design, hack-team, tool-integration, patch-techniques]
    related_skills: [soul-tool-gap-research, security-team-soul-enrichment]
---

# Agent SOUL.md Batch Patching

Techniques for patching agent SOUL.md files in bulk: fixing broken
install commands and appending new tool sections. This is the
**implementation phase** that follows the research/gap-analysis phase
covered by `soul-tool-gap-research`.

## When to Use

- Acting on a gap analysis to patch SOUL.md files with new tools
- Fixing install commands that are wrong for the host platform
  (apt on macOS → add brew equivalents)
- Adding `go install` full import paths where only tool names were listed
- Appending a `## 补充工具与命令` section with new tools + usage examples
- Any bulk edit to a SOUL.md that involves both fixes and additions

## The Two-Phase Patch Pattern

### Phase 1 — Fix existing install commands (batch small patches)

For each broken/vague install command, use `patch(mode='replace')` with a
unique `old_string` (the current broken line + 1-2 context lines for
uniqueness) and `new_string` (the corrected cross-platform version).

**Pattern for apt→brew fix:**
```
old_string: "# 安装 dc3dd\nsudo apt install dc3dd"
new_string: "# 安装 dc3dd\n# macOS:\nbrew install dc3dd\n# Linux:\n# sudo apt install dc3dd"
```

**Pattern for vague go install fix:**
```
old_string: "2. **go install**: nuclei, subfinder, httpx, gowitness, ffuf"
new_string: "2. **go install** (完整导入路径):\n   - `go install github.com/projectdiscovery/nuclei/v3/cmd/nuclei@latest`\n   - `go install github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest`\n   ..."
```

**Pattern for Volatility3 symbol table fix:**
```
old_string: "# 安装 Volatility3\npip install volatility3"
new_string: "# 安装 Volatility3\npip install volatility3\n\n# 安装符号表（必需！...）\nmkdir -p ~/volatility3/symbols\ncurl -L -o ~/volatility3/symbols/Win10x64_19041.zip https://..."
```

**Key technique**: Batch ALL independent patches in a single turn. The
runtime executes them concurrently. Each patch targets a different unique
string in the same file, so there's no dependency between them. In the
2026-07 session, 6 apt→brew fixes + 1 go-install fix + 1 Volatility3
symbol-table fix were applied to hack-forensics in a single turn (8
concurrent patches).

### Phase 2 — Append new `## 补充工具与命令` section

To append at end of file, match the last unique block (e.g. the last table
row or section) and replace it with itself + the new section appended:

```
old_string: "| Radare2 | 逆向分析框架 | brew |"   # last line of file
new_string: "| Radare2 | 逆向分析框架 | brew |\n\n## 补充工具与命令\n\n> ...\n\n### tool1 — description\n\n```bash\n...\n```"
```

For each new tool, include:
- **Install command**: full Go import path (`go install github.com/owner/repo/cmd/tool@latest`),
  `brew install` / `apt install` for system tools, `pip install` for Python
- **5-6 usage examples**: concrete commands with realistic parameters
- **Config file examples** where relevant (e.g. uncover's `provider-config.yaml`)

### Phase 3 — Update reference tables

If the SOUL.md has a tool reference table (e.g. the `hackingtool 工具速查`
section), patch it too — add `brew install` alongside `apt install` for
each entry. This is a separate patch from Phase 1 since it targets a
different section of the file.

## Tool Section Template

For each new tool added to a SOUL.md, use this structure:

```markdown
### toolname — Short Description (Publisher/Ecosystem)

```bash
# 安装
go install github.com/owner/repo/cmd/toolname@latest
# 或: brew install toolname
# 或: pip install toolname

# Usage 1 — what it does
toolname -host example.com -o results.txt

# Usage 2 — another scenario
cat input.txt | toolname -o results2.txt

# Usage 3 — advanced/pipeline
toolname -host example.com -silent | nexttool

# Usage 4-6 — more examples covering different modes
```

## Concurrency Strategy

1. **Read all target files first** (batch `read_file` calls in one turn)
2. **Batch all Phase 1 fixes** in one turn (independent patches to same file)
3. **Batch Phase 2 appends** in one turn (one append per file)
4. **Batch Phase 3 table updates** in one turn
5. **Verify** by reading the patched sections

In the 2026-07 session, the full operation was:
- Turn 1: Read report + both SOUL.md files (3 concurrent reads)
- Turn 2: Fix go-install in hack-recon + add Vol3 symbols in hack-forensics (2 patches)
- Turn 3: Append new section to hack-recon (1 large patch)
- Turn 4: Batch 6 apt→brew fixes in hack-forensics (6 concurrent patches)
- Turn 5: Append new section to hack-forensics (1 large patch)
- Turn 6: Update hack-forensics reference table (1 patch)

## Pitfalls

### offset/limit pagination warning (non-blocking)

When `read_file` is called with `offset` (e.g. reading lines 340+), the
`patch` tool warns: "was last read with offset/limit pagination (partial
view). Re-read the whole file before overwriting it." **The patch still
succeeds** — the warning is non-blocking. To avoid it, re-read the full
file without offset before patching, or simply accept the warning.

### Matching unique strings in large SOUL.md files

SOUL.md files with repeated patterns (e.g. multiple `brew install` lines,
multiple `# 安装` comments) require extra context lines in `old_string`
to ensure uniqueness. Include the preceding comment, section header, or
surrounding tool name for uniqueness.

**Bad** (not unique — multiple files have this):
```
old_string: "sudo apt install yara"
```

**Good** (unique — includes surrounding context):
```
old_string: "# 安装 YARA\nsudo apt install yara"
```

### skill_manage cannot edit default-profile skills

Skills symlinked from the `default` profile into `orchestrator` cannot be
patched via `skill_manage(cross_profile=true)`. The flag is recognized but
doesn't resolve the skill lookup. **Workaround**: Use the `patch` tool
directly on the SOUL.md files (those are not skills, they're agent
configuration files, so cross_profile restrictions don't apply). For
skill updates, create a new orchestrator-profile skill (like this one)
to capture the learning.

### Appending to a file read with pagination

If you read a file with `offset` to check its end, then try to patch by
matching the last lines, the patch tool's fuzzy matching still works
correctly. The pagination warning doesn't affect match accuracy.

## Cross-Platform Install Command Reference

When fixing install commands, use this mapping:

| Tool Category | macOS | Linux |
|---------------|-------|-------|
| System packages | `brew install X` | `sudo apt install X` |
| Go tools | `go install github.com/owner/repo/cmd/tool@latest` (same) | same |
| Python tools | `pip install X` (same) | same |
| GUI apps | `brew install --cask X` | `sudo apt install X` |
| Rust tools | `cargo install X` or download binary | same |
| Pre-built binaries | Download from GitHub releases | same |

**Note**: Some tools are Linux-only (e.g. Guymager). Mark them as such
in the reference table rather than providing a fake macOS equivalent.

## Related Skills

- **soul-tool-gap-research** — (default profile) Research methodology for
  finding tools NOT yet in SOUL.md files, producing the gap analysis that
  this skill acts on
- **security-team-soul-enrichment** — (default profile) Tool-to-agent
  mapping, AST-based catalog extraction, parallel SOUL.md batch updates
  via delegate_task
