---
name: soul-shared-rule-externalization
description: >-
  Extract inline shared-rule blocks from N agent SOUL.md files and replace
  them with a single import reference to a central aggregator file under
  _shared/. Covers the 3-block removal pattern (head ACP rule, mid recon
  checklist, tail Loop+Ontology+Privacy triad), the shared-rules-reference.md
  aggregator file, archived-profile handling, inverse verification grep, and
  3-patches-per-file concurrency. Use when externalizing shared rules out of
  SOUL.md files (the inverse of soul-protocol-block-insertion).
version: 1.0.0
platforms: [macos, linux]
metadata:
  hermes:
    tags: [soul-design, patch-techniques, deduplication, shared-rules]
    related_skills:
      - soul-protocol-block-insertion
      - agent-soul-patching
      - soul-md-privacy-section-patching
---

# SOUL.md Shared-Rule Block Externalization

The inverse of `soul-protocol-block-insertion`. Instead of INSERTING
shared-protocol blocks inline into SOUL.md files, this skill EXTRACTS
inline shared-rule blocks from N SOUL.md files and replaces them with a
single import reference to a central aggregator file
(`_shared/shared-rules-reference.md`).

**Why externalize**: when the same 6 shared-rule blocks (mandatory-acp,
forward-deployed-protocol, ontology, marking-rules, loop-engineering-gates,
mandatory-privacy) are inlined in 33 SOUL.md files, a single rule change
requires editing 33 files. Externalizing to a central aggregator means
edit-once, apply-everywhere via import reference.

## When to Use

- User says "为 N 个 profile 的 SOUL.md 做共享规则块外移"
- Consolidating duplicated shared-rule blocks out of SOUL.md files
- Moving from inline-everywhere to import-once pattern after a
  `_shared/shared-rules-reference.md` aggregator has been created
- Any "delete inline shared blocks, replace with import reference" task

## Prerequisites

1. **The aggregator file must exist first** — confirm
   `~/.hermes/profiles/_shared/shared-rules-reference.md` exists. If not,
   create it BEFORE externalizing (it lists all 6 shared rule files with
   one-line descriptions and the standard load-order).
2. **Read all target SOUL.md files** — batch `read_file` calls to see
   each file's structure and confirm which inline blocks are present.
   Do NOT assume uniformity — some profiles may have extra blocks
   (e.g. hack team has 渗透方法论融合, product team has 认知自检).

## The 3-Block Removal Pattern

Every worker SOUL.md has the same 3 inline shared-rule blocks at
predictable positions. Externalization removes all 3 and appends a
single import-reference line at the tail.

### Block 1 — Head ACP rule (lines 1-5)

Located at the very top of the file, before the `# Role Name` header:

```markdown

## 🔴 强制规则：编码开发必须通过 ACP 调用 Claude Code

编码工作必须通过 `acp_send(provider="claude", agent="bypassPermissions")` 委托 Claude Code 完成。完整流程和例外见 `~/.hermes/profiles/_shared/mandatory-acp.md`。ACP 连续两次故障 → `kanban_block(kind="dependency")`。
---
```

**Patch**: replace this entire block (including the leading blank line
and trailing `---`) with just the `# Role Name` header line. This moves
the role header to line 1.

### Block 2 — Mid recon checklist (before the work loop)

Located between the role's core-能力域/职责 section and the work loop:

```markdown
## 前线侦察清单（执行任务前必须完成）

接到任务后，**在执行任何实质操作前**，必须完成以下侦察（尽可能并行）：

1. **读取任务上下文** — `kanban_show()` 读 body 中的 context / ontology_refs...
2. **读取本地代码库** — `read_file("AGENTS.md")`...
3. **查历史会话** — `session_search(query="<任务相关关键词>", limit=3)`
4. **查团队共享记忆** — `hindsight_recall(query="<任务领域关键词>")`
5. **查相关 skill** — `skills_list()`

侦察完成后，**必须**将摘要写入 `kanban_comment`...未写侦察摘要就开始执行 = 任务未完成。详见 `~/.hermes/profiles/_shared/forward-deployed-protocol.md` §2。

---
```

**Patch**: replace this entire block (including the trailing `---\n\n`)
with just the work-loop header (`## 标准作业循环` for hack team,
`## 工作流程` for product team).

### Block 3 — Tail triad (Loop + Ontology + Privacy)

Located at the end of the file, the last 3 sections before EOF:

```markdown
## Loop Engineering 验证门

`kanban_complete` 前必须通过验证门...详见 `~/.hermes/profiles/_shared/loop-engineering-gates.md`。

---

## 输出契约：Ontology 引用

> 本任务的产出遵循 `~/.hermes/profiles/_shared/ontology.md` 定义的对象模型...
> ...`kanban_complete` 的 metadata 必须用 ontology.md 中定义的 property 名。

---

## 隐私保护规则（全局强制）

仅访问 workspace 目录...完整规则见 `~/.hermes/profiles/_shared/mandatory-privacy.md`。
```

**Patch**: replace ALL THREE sections (Loop + `---` + Ontology + `---` +
Privacy) with a single import-reference line:

```markdown
> **共享规则**：所有共享强制规则块见 `~/.hermes/profiles/_shared/shared-rules-reference.md`。
```

This is the key move — 3 inline sections collapse to 1 import line.

## Per-File Patch Strategy: 3 Patches Concurrent

Each file needs exactly 3 `patch(mode='replace')` calls — one per block
removal location. The 3 patches target different unique strings in the
same file, so they are INDEPENDENT and can be batched concurrently in a
single turn (3 patch calls in one assistant response).

**Turn economy for 10 profiles**:
- Turn 1: read aggregator + batch-read all 10 target files
- Turn 2-4: patch 3-4 files per turn (3 patches each, batched) → 3 turns
- Turn 5: verification grep across all 10 files

Total: ~5 turns for 10 profiles. Much faster than insertion (which
needs step renumbering per file).

## Archived Profiles

Profiles archived with a `.archived` directory suffix
(e.g. `hack-c2.archived/`, `product-feedback.archived/`) are STILL valid
externalization targets. The user includes them in the profile list
because their SOUL.md content is still referenced. Patch them the same
way — the `.archived` suffix is just a marker, not a barrier.

**Detection**: when resolving a profile name to a path, check both
`~/.hermes/profiles/<name>/SOUL.md` and
`~/.hermes/profiles/<name>.archived/SOUL.md`. Use whichever exists.

## Inverse Verification Grep

After externalization, the marker counts are INVERTED relative to the
insertion skill. Inline blocks should be ABSENT (count 0), and the
import reference should be PRESENT (count 1).

```bash
for f in ~/.hermes/profiles/{hack-*,product-*}/SOUL.md; do
  echo "=== $(basename $(dirname $f)) ==="
  grep -c 'shared-rules-reference' "$f"   # expect 1 (import reference)
  grep -c '强制规则：编码开发必须通过 ACP' "$f"   # expect 0 (removed)
  grep -c '前线侦察清单（执行任务前必须完成）' "$f"  # expect 0 (removed)
  grep -c '## Loop Engineering 验证门' "$f"   # expect 0 (removed)
  grep -c '## 输出契约：Ontology 引用' "$f"   # expect 0 (removed)
  grep -c '## 隐私保护规则（全局强制）' "$f"   # expect 0 (removed)
done
```

Expect: `1 / 0 / 0 / 0 / 0 / 0` for every file. Any deviation = patch
error to fix.

For 10 profiles, this runs in a single `execute_code` block with a loop
that calls `terminal(grep ...)` per file — ~10 seconds total.

## What To Keep

Externalization removes only the 3 shared-rule blocks. The following
role-specific content MUST stay:

- `# Role Name (English Name)` header
- `## 你是谁` role definition
- `## 核心能力域` / `## 核心职责` (role-specific capabilities)
- `## 标准作业循环` / `## 工作流程` (the work loop itself — but the
  inline 前线侦察 step inside the loop stays, only the standalone
  checklist section is removed)
- `## 红线` (role-specific red lines)
- `## 协作协议` (role-specific collaboration table)
- `## 输出契约` (role-specific output contract — the role-specific
  metadata JSON example stays; only the generic Ontology 引用 section
  is removed)
- `## 📚 按需加载的技能库` (role-specific skill table)
- `## 具体操作命令手册` (role-specific command references)
- Role-specific 🔴 blocks (e.g. hack team's 渗透方法论融合, product
  team's 认知自检) — these are NOT shared rules, they stay inline

**Rule of thumb**: if a block is identical across all 10 profiles, it's
a shared rule → externalize. If it varies per role, it's role-specific
→ keep inline.

## Pitfalls

### Forgetting the archived profiles

When the user gives a profile list like "hack-c2, hack-weapons",
these may resolve to `hack-c2.archived/SOUL.md` and
`hack-weapons.archived/SOUL.md`. Always check both `<name>/` and
`<name>.archived/` when resolving paths. A profile that "doesn't
exist" may just be archived.

### Removing role-specific blocks by mistake

The hack team has `## 🔴 强制规则：渗透方法论融合（Pentest Methodology Fusion）`
which looks like a shared rule but is actually hack-team-specific.
Do NOT externalize it. Only externalize blocks that appear identically
in BOTH hack and product teams.

The product team has `## 🔴 强制规则：认知自检（不可跳过）` which is
product-team-specific. Do NOT externalize it.

### Patching the tail triad as 3 separate patches

The tail triad (Loop + Ontology + Privacy) can be removed as 3 separate
patches OR 1 combined patch. The combined patch is safer — it avoids
leaving orphaned `---` dividers between removed sections. Use one
`old_string` spanning all 3 sections + their dividers, replace with
the single import-reference line.

### execute_code + read_file returning 0 lines

When `read_file` is called inside `execute_code` without `offset=1`,
some files return `total_lines: 0` and empty content — a quirk of the
execute_code/read_file interaction for certain file sizes. **Workaround**:
use `terminal('cat <path>')` for bulk content reads inside execute_code,
or always pass `offset=1, limit=300` to `read_file` inside execute_code.

This is a tool-interaction quirk, not a file problem — the files are
intact and patchable regardless.

## The Aggregator File Pattern

`_shared/shared-rules-reference.md` is the single import target. Its
structure:

```markdown
# 共享规则引用入口

> 本文件是所有 Hermes agent profile 的共享规则索引。
> 每个 SOUL.md 只需在末尾引用本文件，无需内联复制共享规则块。
> 修改共享规则时只需改 `_shared/` 下的对应文件，全集群自动生效。

---

## 共享规则文件清单

| 文件 | 用途 | 适用范围 |
|------|------|---------|
| `_shared/mandatory-acp.md` | 🔴 编码开发必须通过 ACP 调用 Claude Code | 33/33 profile |
| `_shared/forward-deployed-protocol.md` | 🔴 前线侦察 + Staged Action + Mission Coordinator | 33/33 worker profile |
| `_shared/ontology.md` | 🔴 共享对象模型（6 对象+22 动作+8 标记） | 33/33 profile |
| `_shared/marking-rules.md` | 🔴 安全标记传播（合取 AND + 机械校验） | orchestrator + 跨 board 路由 |
| `_shared/loop-engineering-gates.md` | 🔴 Loop Engineering 验证门 | 33/33 worker profile |
| `_shared/mandatory-privacy.md` | 🔴 隐私保护规则 | 33/33 profile |

---

## 标准作业循环（所有 worker profile 通用）

1. kanban_show() — 读任务 body + 上游交接物
2. 前线侦察 — read_file + search_files + session_search + hindsight_recall + skills_list
3. 执行任务（编码通过 ACP 委托）
4. 验证（真实执行，非自述）
5. kanban_complete(summary, metadata) 或 kanban_block(reason)

---

## 退出协议

每次 run 的最后一个动作**必须**是 kanban_complete 或 kanban_block。
```

The aggregator serves double duty: (1) it's the import target for the
1-line reference in each SOUL.md, and (2) it's a readable index for
humans auditing which shared rules exist.

## Line-Count Impact

Externalization reduces each SOUL.md by ~39 lines on average (the 3
inline blocks total ~39 lines of duplicated content). For 10 profiles
that's ~390 lines of duplication removed. The import-reference line
adds 1 line per file, so net reduction is ~38 lines per file.

Track before/after line counts in the verification step as a sanity
check — if a file's line count didn't drop by ~35-40, a patch likely
missed a block.

## Related Skills

- **soul-protocol-block-insertion** — the INVERSE operation. Inserts
  shared-protocol blocks inline (recon checklist + ontology reference)
  into SOUL.md files. This skill is the yin to that skill's yang.
- **agent-soul-patching** — batch-patching install commands and
  appending tool sections. Covers the two-phase patch pattern and
  concurrency strategy used here.
- **soul-md-privacy-section-patching** — the two-copy privacy section
  trap and content-line anchoring. The tail-triad removal here uses
  the same content-line anchoring discipline (never anchor on `---`).

## Session Record (2026-07-31)

- **10 profiles externalized**: hack-auditor, hack-c2, hack-exploit,
  hack-forensics, hack-recon, hack-weapons, product-feedback,
  product-manager, product-prioritizer, product-researcher
- **3 patches per file** = 30 patches total, batched 3-per-file
  concurrently across 4 turns
- **4 archived profiles** handled correctly (hack-c2, hack-weapons,
  product-feedback, product-prioritizer all under `.archived/` dirs)
- **Verification**: all 10 files passed inverse grep —
  `shared-rules-reference=1`, all 5 inline-block markers=0
- **Line reduction**: avg 39 lines/file (218→179, 209→170, 198→159,
  207→168, 187→148, 184→145, 181→142, 181→142, 190→151, 183→144)
- **No issues** — 3-block removal pattern held uniformly across both
  hack team (Variant H code-block loop) and product team (Variant P
  numbered-list loop) structures
