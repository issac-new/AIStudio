---
name: soul-shared-block-externalization
description: >-
  Remove inline shared rule blocks (ACP, 认知自检, Loop Engineering,
  隐私保护, Ontology) from N SOUL.md files and replace with a single
  import reference line pointing to _shared/shared-rules-reference.md.
  Covers regex batch removal via execute_code, import-line placement
  matrix, orchestrator special handling (preserve role-specific blocks),
  .archived profile discovery, and dual-condition verification. Use when
  consolidating duplicated shared rules into import references.
version: 1.0.0
platforms: [macos, linux]
metadata:
  hermes:
    tags: [soul-design, patch-techniques, shared-blocks, deduplication]
    related_skills:
      - soul-protocol-block-insertion
      - soul-protocol-reference-insertion
      - soul-md-privacy-section-patching
---

# SOUL.md Shared Block Externalization

The reverse of `soul-protocol-block-insertion`: **remove inline shared
rule blocks from N SOUL.md files and replace them with a single import
reference line**. This deduplicates content — instead of each SOUL.md
carrying a full copy of the ACP rule, privacy rule, Loop Engineering
gate, etc., each carries one import line pointing to
`_shared/shared-rules-reference.md`.

## When to Use

- User says "为 N 个 profile 的 SOUL.md 做共享规则块外移" or "删除内联共享规则块，替换为 import 引用"
- A `_shared/shared-rules-reference.md` index file already exists (or is being created)
- Shared rule blocks are duplicated across many SOUL.md files and need consolidation

## Prerequisites

1. **Read `_shared/shared-rules-reference.md`** — confirm the index file
   exists and lists all shared block files. This is the target of the
   import reference line.
2. **Read all target SOUL.md files** — batch read to understand each
   file's structure, which shared blocks it has, and where the import
   line should go.
3. **Discover actual paths** — some profiles may be `.archived`; see
   the pitfall below.

## Technique: Regex Batch Removal via execute_code

Unlike insertion (which needs per-file precision patching), removal
batches efficiently with Python regex in a single `execute_code` call.
Shared block patterns are consistent enough across profiles that one
regex set handles all files.

```python
import re, os

# Shared block removal patterns — match from header to next ## header
SHARED_BLOCK_PATTERNS = [
    r'## 🔴 强制规则：编码开发必须通过 ACP 调用 Claude Code\n.*?(?=\n## |\n# |\Z)',
    r'## 🔴 强制规则：认知自检.*?\n.*?(?=\n## |\n# |\Z)',
    r'## Ontology 引用\n.*?(?=\n## |\n# |\Z)',
    r'## Loop Engineering 验证门\n.*?(?=\n## |\n# |\Z)',
    r'## 隐私保护规则（全局强制）\n.*?(?=\n## |\n# |\Z)',
]

def remove_sections(content, patterns):
    result = content
    for pat in patterns:
        result = re.sub(pat, '', result, flags=re.DOTALL)
    result = re.sub(r'\n{3,}', '\n\n', result)  # collapse 3+ blank lines
    return result
```

**Key regex detail**: Each pattern uses `.*?(?=\n## |\n# |\Z)` with
`re.DOTALL` — non-greedy match to the next `## ` or `# ` header, or end
of file. This cleanly removes the entire section body without touching
the next section.

## Import Line Placement Matrix

The import line placement varies by profile structure:

| Profile structure | Import line goes before | Examples |
|---|---|---|
| Has `## 🚨 退出协议` | That header | architect, project-manager, requirement-analyst |
| Has `## 具体操作命令手册` | That header | orchestrator only |
| Worker profiles (no 退出协议) | End of file | worker-coder/deployer/researcher/reviewer/tester |

```python
IMPORT_LINE = '> **共享规则**：所有共享强制规则块见 `~/.hermes/profiles/_shared/shared-rules-reference.md`。'

if '## 🚨 退出协议' in content:
    content = content.replace('## 🚨 退出协议', f'{IMPORT_LINE}\n\n## 🚨 退出协议', 1)
elif '## 具体操作命令手册' in content:
    content = content.replace('## 具体操作命令手册', f'{IMPORT_LINE}\n\n## 具体操作命令手册', 1)
else:
    content = content.rstrip() + '\n\n' + IMPORT_LINE + '\n'
```

## Orchestrator Special Handling

Orchestrator has role-specific blocks that must be PRESERVED — do NOT
apply the blanket removal patterns to orchestrator:

- `## 🔴 强制规则：智能路由留痕` — orchestrator-only routing rule
- `## 🔴 强制规则：Ontology 引用与 Markings 传播` — orchestrator-only marking propagation
- `## 认知增强决策框架` — orchestrator's cognitive decision framework
- `## Loop Engineering 验证门` — orchestrator's copy is role-specific
- `## 隐私保护规则` — orchestrator's copy is role-specific

Only remove the 6 generic shared blocks from orchestrator (ACP,
认知自检, 压力升级, Harness, Skill自演进, DeliveringWork) — use
separate targeted patterns:

```python
ORCHESTRATOR_REMOVE_PATTERNS = [
    r'## 🔴 强制规则：认知自检（防低级错误，不可覆盖）\n.*?(?=\n## 🔴 强制规则：Ontology)',
    r'## 🔴 强制规则：编码开发必须通过 ACP 调用 Claude Code\n.*?(?=\nYou are a smart task router)',
    r'## 🔴 强制规则：压力升级自检（执行中防线，不可覆盖）\n.*?(?=\n## 具体操作命令手册)',
    # Also: Harness, Skill自演进, DeliveringWork — add similar targeted patterns
]
```

## Verification (Dual Condition)

After processing, verify BOTH conditions per file:

```python
for name, p in paths.items():
    with open(p) as f:
        content = f.read()
    has_import = IMPORT_LINE in content
    # Check no shared block markers remain (except orchestrator's preserved blocks)
    shared_markers = [
        '## 🔴 强制规则：编码开发必须通过 ACP',
        '## 🔴 强制规则：认知自检',
        '## Loop Engineering 验证门',  # for non-orchestrator
        '## 隐私保护规则',              # for non-orchestrator
        '## Ontology 引用',             # for non-orchestrator
    ]
    remaining = [m for m in shared_markers if m in content]
    status = "✓" if (has_import and not remaining) else "⚠️"
    print(f"{status} {name}: import={'Y' if has_import else 'N'}, remaining={remaining}")
```

A file passes only if: (1) import line present, AND (2) zero shared
block markers remain (except orchestrator's preserved blocks).

## Pitfalls

### .archived Profile Discovery

Some profiles in the task list may exist only as `<name>.archived/`
directories (e.g. `architect.archived/`, `worker-deployer.archived/`).
Always glob for the actual SOUL.md path before assuming the standard
`profiles/<name>/SOUL.md` path:

```python
import glob, os
for name in task_profiles:
    pattern = os.path.join(base, "**", f"{name}*", "SOUL.md")
    matches = glob.glob(pattern, recursive=True)
    # May return: [.../architect.archived/SOUL.md] if active version doesn't exist
```

Process the `.archived` versions — they still contain SOUL.md content
that should stay consistent with active profiles.

### skill_manage cross_profile limitation

The existing insertion skills (`soul-protocol-block-insertion`,
`soul-protocol-reference-insertion`) may be symlinked from `default`
into `orchestrator`. `skill_manage` from `orchestrator` cannot patch
them even with `cross_profile=True` — it says "not found in active
profile". This is why this skill exists as a separate orchestrator
skill rather than a section appended to `soul-protocol-block-insertion`.

### read_file dedup caching

When batch-reading 9+ SOUL.md files via `read_file` in `execute_code`,
the tool may return `status: unchanged, content_returned: false` after
the first read of each file (dedup caching). Workaround: read files
directly with Python `open()` inside `execute_code` instead of calling
the `read_file` tool wrapper, or force non-cached reads by using
`offset`/`limit` parameters.

## Session Record (2026-07-31)

- **9 profiles processed**: orchestrator, architect, project-manager,
  requirement-analyst, worker-coder, worker-deployer, worker-researcher,
  worker-reviewer, worker-tester
- **5 were `.archived`**: architect, project-manager, requirement-analyst,
  worker-deployer, worker-reviewer (discovered via glob)
- **Orchestrator special handling**: preserved 5 role-specific blocks,
  removed 6 generic shared blocks
- **All 9 files passed verification**: import line present + zero shared
  block markers remaining
- **Size reduction**: 8-21% per file (700-1400 chars removed each)

## Related Skills

- **soul-protocol-block-insertion** — the forward operation (insert
  shared blocks into SOUL.md). This skill is its reverse.
- **soul-protocol-reference-insertion** — another forward operation
  (insert protocol references + workflow steps). Related but distinct.
- **soul-md-privacy-section-patching** — the two-copy privacy trap and
  content-line anchoring technique. This skill uses regex batch removal
  instead of precision patching, but the anchoring principles apply.
