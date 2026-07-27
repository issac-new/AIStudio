---
name: soul-md-privacy-section-patching
description: >-
  Patch SOUL.md files safely despite the TWO-copy privacy section trap,
  the trailing-backtick orphanage issue, and the fuzzy-matching quirks
  of the `patch` tool. Covers the content-line anchoring technique,
  duplicate-header diagnosis/cleanup, and batch orchestration for 10+
  files. Use when enriching any Hermes agent's SOUL.md with new tool
  sections, fixing install commands, or appending command manuals.
version: 1.0.0
platforms: [macos, linux]
metadata:
  hermes:
    tags: [soul-design, patch-techniques, privacy-section]
    related_skills:
      - soul-enrichment-command-manual
      - agent-soul-patching
      - soul-enrichment-pipeline
---

# SOUL.md Privacy Section Patching

Specialized techniques for patching content into Hermes agent SOUL.md
files that have the two-copy privacy section structure. This is a
tactical supplement to the broader approaches in `agent-soul-patching`
and `soul-enrichment-command-manual`.

## When to Use

- Appending new sections before the privacy rules divider
- Fixing a duplicate `## 隐私保护规则` header after a bad patch
- Batch-editing 10+ SOUL.md files in sequence
- The `patch` tool gave strange results (duplicates, orphaned fences)

## The Two-Copy Privacy Section Structure

Every Hermes agent SOUL.md ends with this pattern — **twice**:

```
[last content line — usage note or tool example]

---

---                          ← first `---` divider
                              ← empty line(s)
## 隐私保护规则（全局强制）   ← FIRST copy

> ⚠️ **最高优先级**...

### Terminal 命令限制

                              ← empty line(s)
### 文件系统访问限制         ← SECOND copy (identical)
1. **仅允许访问**...
```

The two copies are byte-identical. This means the pattern
`---\n\n\n---\n\n## 隐私保护规则` appears in the file where the
first copy starts, but the second copy does NOT have its own leading
`---` — it just repeats the body. This asymmetry is the root cause
of several patch failures.

## Techniques

### Content-Line Anchoring (Safe Default)

Anchor on the LAST UNIQUE content line before the first `---` divider.
Include NO dividers and NO privacy header text in the old_string.

```python
# ✅ Safe — anchors on unique content, no divider involvement
old_string = "> 使用原则：先 git diff 拿到变更范围..."
new_string = old_string + "\n\n### 7. 新工具\n\n```bash\n# usage\n```"
```

The `---` divider and both privacy-sections remain from the original file
unchanged. No duplication risk.

### Diagnosing Duplicates

After a patch, check for duplicate `## 隐私保护规则` headers:

```bash
grep -c "## 隐私保护规则" SOUL.md
# Expected: 2  (two copies)
# Duplicate: 3+
```

If you see 3+, fix with:

```python
old_string = "## 隐私保护规则（全局强制）\n## 隐私保护规则（全局强制）"
new_string = "## 隐私保护规则（全局强制）"
```

### Trailing Backtick Orphanage

**Symptom**: The patched file has `\`\`\`\n\`\`\`` (double code fence)
right before the `---` divider.

**Cause**: The old_string ended with `\`\`\``, but the actual code fence
in the file was positioned BEFORE the anchor line, not after. The patch
tool's fuzzy matching skipped the unmatched backticks.

**Fix**: NEVER include a trailing `\`\`\`` in the old_string unless
you've confirmed the fence comes AFTER your anchor line. To clean up:

```python
old_string = "\`\`\`\n\`\`\`\n---"
new_string = "\`\`\`\n---"
```

## Batch Orchestration for 10+ Profiles

When the task covers many profiles (10+), use this workflow:

1. **Read boundaries** — Batch-read the last 15 lines of every target
   SOUL.md in one turn. Note each file's unique anchor line.

2. **Plan with todo** — Create a `todo` list with one item per profile.
   This prevents skipping a file or losing your place.

3. **Patch one per turn** — Each 50-200 line section append is a large
   patch. Do one file per turn. Do NOT batch large patches concurrently
   — the diffs become unreadable and errors compound.

4. **Heartbeat on cleanup** — After every 3-4 patches, grep-check the
   latest file for duplicate headers or orphaned fences.

5. **Verify end state** — After completing all profiles, spot-check
   2-3 files' ends with read_file to confirm correct structure.

## Example: 10-Profile Enrichment Session

From the 2026-07-24 session (architect, PM, requirement-analyst,
worker-coder/deployer/reviewer/tester, ops-sre/devops/incident-commander):

- 10 profiles, 47 new sections, 84 tools added
- ~1,938 lines of new content
- 2 files required duplicate-header cleanup post-patch
- 2 files required orphaned-backtick cleanup
- Anchor strategy switched mid-session from privacy-header anchoring
  (caused duplicates) to content-line anchoring (clean)

The primary lesson: anchor on the content line, never the divider.
