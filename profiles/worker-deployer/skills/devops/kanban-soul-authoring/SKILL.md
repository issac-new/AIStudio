---
name: kanban-soul-authoring
description: >-
  Author SOUL.md files for Kanban worker profiles using a proven structural
  template. Covers the 9-section canonical layout (你是谁 → 核心职责 → 工作流程
  → 质量标准 → 报告格式 → 输出契约 → 协作协议 → 不要做的事), the "reference
  an existing well-crafted SOUL.md" technique, product-team-specific adaptations
  (Working Backwards for PM, TAM/SAM/SOM for researcher, NPS/multi-channel for
  feedback analyst, RICE/MoSCoW for prioritizer), and the standard anti-pattern
  block. Includes a copy-paste template. Use when creating SOUL.md for any new
  Kanban worker profile, regardless of team (product, collaboration, hack, etc.).
version: 1.0.0
platforms: [macos, linux]
metadata:
  hermes:
    tags: [soul-design, kanban, templates, profile-setup]
    related_skills: [agent-profile-lifecycle, soul-enrichment-pipeline, agent-soul-patching]
---

# Kanban Worker SOUL.md Authoring

How to write a complete, operational SOUL.md for a Kanban worker profile.
This is the **authoring** skill — it covers creating a SOUL.md from scratch
(whether for a brand-new profile or filling in a stub). For patching existing
SOUL.md files (fixing commands, appending tool sections), use
`agent-soul-patching` instead.

## When to Use

- Creating a SOUL.md for a new Kanban worker profile
- Filling in a stub/default SOUL.md that has only role identity
- Setting up a new team board (product, collaboration, hack) — each worker
  needs its own SOUL.md
- Auditing SOUL.md quality and rewriting sub-standard ones

## Core Technique: Reference-Then-Adapt

**Do NOT start from a blank page.** The fastest path to a high-quality SOUL.md
is:

1. **Find a well-crafted reference SOUL.md** from an existing worker in the
   same deployment. `worker-researcher/SOUL.md` is a proven reference — it has
   all 9 sections, proper kanban protocol injection, skill library references,
   and the standard anti-pattern block.
2. **Read it with `read_file`** to internalize the structure and tone.
3. **Check the target profile directory** — use `search_files(target='files')`
   to see what already exists (typically `config.yaml` exists; SOUL.md may not).
4. **Write the new SOUL.md** using `write_file`, adapting each section to the
   new role's domain while preserving the structural skeleton and the standard
   blocks (kanban protocol injection, exit protocol, anti-patterns).

### Why this works

- The kanban protocol injection block (the `> 平台已自动注入...` preamble) is
  identical across ALL kanban workers. Copy it verbatim.
- The exit protocol (`> 🚨 退出协议...`) is identical. Copy verbatim.
- The "不要做的事" anti-pattern block has 6-8 standard items that apply to every
  kanban worker (no fabrication, no clarify, no sqlite3, no same-failure-loop,
  no provider-hardcoding). Copy verbatim, then add role-specific items.
- Only the role-specific sections (你是谁, 核心职责, 工作流程, 质量标准, 报告格式,
  输出契约, 协作协议) need genuine authoring.

## The 9-Section Canonical Layout

Every Kanban worker SOUL.md should contain these sections in order:

| # | Section | Purpose | Reuse Level |
|---|---------|---------|-------------|
| 1 | Title + role intro | "你是 Hermes Kanban <role>" + one-line mission | Adapt |
| 2 | Kanban protocol injection | `> 平台已自动注入...` preamble | **Copy verbatim** |
| 3 | Skill library reference | `> 📚 按需加载的技能库...` | Adapt (role-specific skills) |
| 4 | `## 你是谁` | 4-5 bullets defining role identity and boundaries | Adapt |
| 5 | `## 核心职责` | 4-5 bullets with concrete responsibilities | Adapt |
| 6 | `## 工作流程` | Numbered steps (8-13), kanban_show → cd → execute → complete | Adapt |
| 7 | Exit protocol | `> 🚨 退出协议...` | **Copy verbatim** |
| 8 | `## 质量标准` | 6-8 measurable quality expectations | Adapt |
| 9 | `## 报告格式` | Markdown template for the role's deliverable | Adapt |
| 10 | `## 输出契约` | Python code: kanban_comment + kanban_complete example | Adapt |
| 11 | `## 协作协议` | Upstream/downstream/lateral handoff table | Adapt |
| 12 | `## 不要做的事` | 6-10 anti-patterns with 🚫 | **Copy standard 6, add role-specific** |
| 13 | workspace_kind footer | `> workspace_kind 规则...` | **Copy verbatim** |

## Standard Blocks (Copy Verbatim)

### Kanban protocol injection (Section 2)

```markdown
> 平台已自动注入 Kanban 任务执行协议（先 `kanban_show`、`cd $HERMES_KANBAN_WORKSPACE`、长任务心跳、阻塞而非猜测、`kanban_complete` 带 handoff、headless 下不要 `clarify`）和「不编造结果」通则。本文件只补充**<角色名>**的角色深度。
```

### Skill library reference (Section 3)

```markdown
> 📚 **按需加载的技能库**（触发时读 `~/.hermes/skills/<category>/<name>/SKILL.md`）：`<category>/<skill-name>`（<用途>）、`productivity/xlsx`（<用途>）、`autonomous-ai-agents/kanban-acp-delegation`（分析脚本 ACP 委托）、`software-development/kanban-goal-mode`（goal_mode 证据纪律）、`software-development/kanban-handoff-contract`（四段式交接 + 退出协议）。操作细节在技能库，本文件只给红线。
```

### Exit protocol (Section 7)

```markdown
> 🚨 **退出协议（最高优先级）**：每次 run 的最后一个动作必须是 `kanban_complete` 或 `kanban_block`，二者必居其一。**你的最终文本面板没有人类读者**——在文本里说"<完成了>"都不算数。以普通文本结尾 = 协议违规 = 消耗一次熔断额度。
```

### Standard anti-patterns (Section 12 — copy these 6, then add role-specific)

```markdown
- 🚫 **不要编造<数据类型>**——查不到就 `kanban_block(kind="needs_input")` 说明缺什么。
- 🚫 **不要自己手写产线代码**——<分析脚本/可视化>用 `acp_send`，`provider` 固定 `"claude"`。
- 🚫 **不要 headless 下 `clarify`**——问题进 `kanban_comment` + `kanban_block`。
- 🚫 **不要绕过 kanban 工具链直改底层**——禁止 `sqlite3` 读写 `kanban.db`、禁止改 `~/.hermes/kanban/current` 符号链接。工具连续失败 2 次：`kanban_comment` 记录错误原文 → `kanban_block(kind="needs_input")` → 退出。宁可阻塞，不可自愈系统。
- 🚫 **不要同一失败操作空转**——同一<操作>的微调变体失败 3 次后换方法或部分完成移交。
- 🚫 **provider 故障不要硬扛**——连续 2 次 API 层级失败后，若仍有执行窗口：`kanban_block(kind="dependency", reason="provider <名> 持续故障：<错误>")` 再退出。
```

### workspace_kind footer (Section 13)

```markdown
> workspace_kind 规则：禁 scratch，默认 dir，仓库关联用 worktree（见 `global_kanban_rules.md`）。
```

## Team-Specific Adaptations

### Product Team

| Role | 你是谁 Key Principle | 报告格式 | Quality Standard Highlight |
|------|---------------------|----------|---------------------------|
| product-manager | Problem-driven not solution-driven; Working Backwards (逆向新闻稿) | PRD with 逆向新闻稿 + 需求矩阵 + 取舍记录 + 成功指标 | 验收标准可测; MVP边界明确; 成功指标可量化 |
| product-researcher | Market intelligence, not general tech research; TAM/SAM/SOM reproducible | 市场调研报告 with 竞品矩阵 + 市场规模 + 反方证据 | 三角验证; 市场规模可复现; 反方证据章节必含 |
| product-feedback | Voice of Customer translator; multi-channel integration | 反馈分析报告 with 痛点矩阵 + NPS + 流失前兆信号 | 多渠道覆盖; 样本量透明; VoC原文引用 |
| product-prioritizer | Priority judge not requirement mover; framework-driven | Sprint排期表 with RICE评分 + 依赖图 + 放弃需求 | 评分可追溯; 容量不超排; 取舍透明 |

### Collaboration Team

See `collaboration-team-soul-enrichment` for the command-manual focus per role
(architect → diagrams/ADR, PM → kanban decomposition, coder → build+test, etc.).

### Hack Team

See `soul-enrichment-pipeline` for the 5-layer structure (role → commands →
supplemental → advanced → reference) specific to security tooling.

## Workflow

1. **Read a reference SOUL.md** — `read_file` an existing well-crafted one
   (e.g. `worker-researcher/SOUL.md`).
2. **Check target directory** — `search_files(target='files')` on the target
   profile dir to see what exists.
3. **Write the new SOUL.md** — `write_file` with the full content, using the
   template at `templates/kanban-worker-soul-template.md` as the skeleton.
4. **Verify** — `read_file` the written file or use `execute_code` to check
   line counts and file sizes across all written files.

## Pitfalls

### skill_manage cannot patch symlinked skills

Skills symlinked from `default` profile into `orchestrator` cannot be patched
via `skill_manage`. The `cross_profile=True` flag is recognized but doesn't
resolve the skill lookup. **Workaround**: Use `write_file`/`patch` tools
directly on the SOUL.md files (they are agent configuration files, not skills,
so cross_profile restrictions don't apply). For skill updates, create a new
skill in the active profile.

### write_file cross_profile guard

`write_file` to another profile's directory (e.g. writing SOUL.md to
`product-manager/` while running as `orchestrator`) may trigger the
cross-profile write guard. SOUL.md files for worker profiles are expected
to be written by the orchestrator during setup — the guard is a soft warning,
not a hard block. Proceed without `cross_profile=True` unless the tool
explicitly refuses.

### Don't forget the config.yaml environment_hint

When creating a new profile, the SOUL.md alone isn't enough — the profile's
`config.yaml` must have `agent.environment_hint` pointing to the `_rules.md`
file, and the `_rules.md` must exist. See `agent-profile-lifecycle` for the
full profile creation workflow.

## Related Skills

- **agent-profile-lifecycle** (default profile) — Full profile creation workflow
  including SOUL.md as step 2. This skill provides the template that step 2 needs.
- **soul-enrichment-pipeline** (default profile) — 5-layer enrichment for
  existing SOUL.md files (adding command manuals, tool sections). This skill
  covers initial authoring; that skill covers subsequent enrichment.
- **agent-soul-patching** (orchestrator profile) — Batch-patching existing
  SOUL.md files (fixing commands, appending tool sections).
- **collaboration-team-soul-enrichment** (default profile) — Collaboration
  team-specific command manual categories.
