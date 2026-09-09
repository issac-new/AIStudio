---
name: soul-protocol-block-insertion
description: >-
  Insert shared-protocol reference blocks (ontology, forward-deployed recon,
  marking-rules) from ~/.hermes/profiles/_shared/ into multiple agent SOUL.md
  files at the correct structural points. Covers the two team structural
  variants (hack team code-block loops vs product team numbered-list loops),
  step-renumbering, per-role content customization, and batch verification.
  Use when adding ontology/protocol/recon references to SOUL.md files.
version: 1.1.0
platforms: [macos, linux]
metadata:
  hermes:
    tags: [soul-design, patch-techniques, protocol-insertion, ontology]
    related_skills:
      - soul-md-privacy-section-patching
      - agent-soul-patching
      - soul-enrichment-pipeline
---

# SOUL.md Shared-Protocol Block Insertion

A recurring class of task: insert shared-protocol reference blocks
(read from `~/.hermes/profiles/_shared/`) into multiple SOUL.md files.
Typical blocks:

- `ontology.md` — output contract (object types, CompletionHandoff interface)
- `forward-deployed-protocol.md` — frontline recon checklist (§2)
- `marking-rules.md` — security marking propagation rules

This skill covers the structural patterns for inserting these blocks
correctly across hack team (6 profiles) and product team (4 profiles).

## When to Use

- Adding an ontology/output-contract reference to a set of SOUL.md files
- Adding a frontline-recon (前线侦察) checklist before the work loop
- Any task that says "add X reference + Y step to N profiles' SOUL.md"
- Rolling out a new `_shared/` protocol file to all worker profiles

## Prerequisites

1. **Read the shared source first** — `read_file` the `_shared/*.md` file
   to understand what you're inserting. You need to know the section
   numbers (e.g. `forward-deployed-protocol.md §2`) and the object type
   names (e.g. `Artifact`, `Finding`, `Decision`, `CompletionHandoff`).
2. **Read all target SOUL.md files** — batch `read_file` calls (5 at a
   time) to see each file's structure. Do NOT assume uniformity.

## Two Structural Variants

SOUL.md files come in two loop variants. The patch strategy differs.

### Variant H: Hack team — `## 标准作业循环` + code block

```
## 标准作业循环

​```
kanban_show()                        # 1. 定位任务
cd $HERMES_KANBAN_WORKSPACE          # 2. 进入工作区
skill_view('pentest-methodology-fusion')  # 3. 加载方法论框架
...                                  # 4. 5. 6. ...
kanban_complete(summary, metadata)    # N. 交付
​```
```

**Insertion**: Add a `## 前线侦察清单` section BEFORE the header, AND
insert a new step line inside the code block (`前线侦察（见上方清单）
# 3. ...`), AND renumber all subsequent steps (`# 3.`→`# 4.`, `# 4.`→`# 5.`,
etc.).

### Variant P: Product team — `## 工作流程` + numbered list

```
## 工作流程

1. `kanban_show()` —— 读任务卡 body...
2. `cd $HERMES_KANBAN_WORKSPACE` —— 进入工作区。
3. **先读上下文**：`read_file`/`search_files` 查看仓内已有的...
4. **问题框架**：...
```

**Insertion**: Add a `## 前线侦察清单` section BEFORE the header, then
REWRITE the existing step 3 in place (from `**先读上下文**` to
`**前线侦察**` with added `session_search` + `hindsight_recall` +
`kanban_comment` summary). No renumbering needed — step count stays
the same because step 3 is upgraded, not inserted.

## Two Insertion Points

Each SOUL.md has two natural insertion points for protocol blocks.

### Point A — Before the work loop (recon checklist)

Insert `## 前线侦察清单` section. The section body is largely identical
across all profiles — the 5-step parallel recon list
(kanban_show / read_file+search_files / session_search / hindsight_recall /
skills_list), followed by the kanban_comment summary requirement and a
pointer to `forward-deployed-protocol.md §2`.

See `templates/recon-checklist.md` for the standard block text.

### Point A-bis — Recon summary comment template + mechanical checks (2026-08-25, t_f4fd26da patch)

> 背景：基线挖掘实测侦察摘要执行率仅 ~13%（7/53），且 7 个实例格式参差（同一任务 3 个 author 三种格式）。
> t_a257ada7 解剖证明「有协议无模板无机械校验 = 执行率 ~10%」是跨协议共性。
> 插入侦察步骤时**必须同时**把以下模板与校验点写进 SOUL，否则侦察结果只留在 worker 脑中。

**统一 comment 模板**（插入 SOUL 时一并写入）：

```markdown
## 前线侦察摘要
**任务目标**: <一句话复述>
**上游交接物**: <parent task 的 artifacts/findings，或"无">
**本地现状**: <实测文件/schema/行数，禁自述>
**历史经验**: <session_search/hindsight 结果>
**适用 skill**: <已加载 skill 名>
**关键情报**: <任务书与现实的出入，如年龄修正/诊断过重>  # 可选但高价值
**风险与约束**: <边界声明>
**执行计划**: <编号步骤>
```

**机械校验点**（写进 SOUL 执行检查清单）：
- 开工后第一个 kanban_comment 必须含 `## 前线侦察摘要` 标题
- 摘要至少含 8 字段中的 5 个
- 「本地现状」字段必须含至少 1 个实测值（行数/schema/文件大小），禁纯定性描述

**多 author 场景纪律**：后续 author 的侦察摘要必须引用前者（`在 <author> 侦察基础上补充/修正`），禁平行重开。

**审计探针**（季度回归用）：

```bash
sqlite3 "file:~/.hermes/kanban/boards/<board>/kanban.db?immutable=1" \
  "SELECT count(DISTINCT task_id) FROM task_comments WHERE body LIKE '%前线侦察摘要%';"
# 对照同期 done 任务数得执行率（2026-08-25 基线：13% = 7/53）
```

**陷阱**：
- **模板是最小集不是全集**——[已移除] 的「教材参考」「年龄修正」、platform 的「认知自检」都是模板外高价值字段，字段可增不可减（少于 5 个核心字段才算违规）
- **侦察摘要 ≠ 侦察行为**——即使写了 comment 也要抽查「本地现状」是否真为实测（防「自述式侦察」）
- **不要追溯性补写**——摘要的时间价值在「开工前」，事后补写无防错功能（t_944ea2b0 的年龄修正只有在设计前发现才有意义）

**生效验证**：
- 抽查新完成任务：首个 comment 含 `## 前线侦察摘要` 且 ≥5 核心字段
- 执行率从基线 13% 在下个扫描窗口可测量提升
- 至少 1 个「关键情报」类修正被摘要捕获（证明摘要不是形式主义）

### Point B — Before the privacy section (ontology / output contract)

Anchor on the `## Loop Engineering 验证门` block (the last content
section before `## 隐私保护规则`). Replace the full block
(Loop Engineering + `---` + privacy header) with:
Loop Engineering block + new `## 输出契约：Ontology 引用` section +
`---` + privacy header.

This is pure content-line anchoring — no divider involvement, no
duplication risk. See `templates/ontology-block.md` for the standard
block text.

## Per-Role Content Customization

The ontology reference block should be customized per role — the
`Artifact (type=...)` values must match what that role actually produces.

| Role type | Artifact type values | Other objects |
|-----------|---------------------|---------------|
| hack-auditor/exploit/recon/forensics | report, code | Finding |
| hack-weapons | binary, code | Finding |
| hack-c2 | report, code | Finding |
| product-manager | report, config | Decision |
| product-prioritizer | report, config | Decision (topic=优先级排序) |
| product-feedback/researcher | report, data | Finding (category=insight) |

A generic block with `type=report/code` for everyone works but loses
precision. Take the extra 10 seconds to customize.

## Step-Renumbering Pitfall (Variant H)

When inserting a new step into a hack team `## 标准作业循环` code block,
the subsequent `# N.` comments must ALL be renumbered. If you only
insert the new line without renumbering, you get duplicate step numbers
(e.g. two `# 5.` lines). The `patch` tool will succeed but the file is
wrong.

**Fix**: include the ENTIRE code block from the insertion point to the
end in both `old_string` and `new_string`, with renumbered steps in the
new version. One patch per file for the full block renumber.

**Detection**: after patching, grep for duplicate step numbers:
```bash
grep -oE '# [0-9]+\.' SOUL.md | sort | uniq -c | awk '$1>1'
```

## Batch Workflow (10 profiles)

1. **Read shared sources** — `read_file` ontology.md + forward-deployed-protocol.md
2. **Read all target SOUL.md** — batch 5 `read_file` calls at a time
3. **Plan with `todo`** — one item per profile, mark in_progress as you go
4. **Patch Point A first** (recon checklist + loop modification) — one
   profile per turn. Each turn: mark todo in_progress → patch → mark completed.
5. **Patch Point B** (ontology block) — can be done in the same turn as
   Point A for the same file, or as a second pass. Both work.
6. **Verify after all patches** — run the verification grep (below)

### Turn economy

For a 10-profile job, the full operation takes ~12-14 turns:
- Turn 1: read 2 shared sources + read 5 target files
- Turn 2: read remaining 5 target files
- Turns 3-7: patch Point A + Point B for 2 profiles each turn (5 turns)
- Turn 8: verification grep across all 10 files

Do NOT try to batch-patch all 10 files concurrently — the diffs become
unreadable and step-renumbering errors compound silently.

## Verification Grep

After batch insertion, verify each file has the right marker counts:

```bash
for f in ~/.hermes/profiles/{hack-*,product-*}/SOUL.md; do
  echo "=== $(basename $(dirname $f)) ==="
  grep -c '前线侦察' "$f"       # expect 2 (checklist header + workflow ref)
  grep -c 'Ontology 引用' "$f"  # expect 1
  grep -c '## 隐私保护规则' "$f" # expect 1 (no duplication)
done
```

Expect: `2 / 1 / 1` for every file. Any deviation = patch error to fix.

For step-number duplication (Variant H only):
```bash
grep -oE '# [0-9]+\.' SOUL.md | sort | uniq -c | awk '$1>1'
# Empty output = good. Any line = duplicate step number.
```

## Pitfalls

### Anchor-text variants silently skip files (verify the FULL roster, not the patched count)

Heading text varies across profiles: `## 共享规则引用` vs `## 共享规则引用（2026-08-22 补齐）` vs `## 共享规则`. A classifier or patcher that matches one exact string will silently skip every profile whose heading carries a suffix — the batch "succeeds" and the final count is short. Two defenses:

1. Classify anchors with a SUBSTRING match (`grep -q "## 共享规则引用"` matches all three variants), then read each matched file to capture its exact heading before constructing the patch `old_string`.
2. After the batch, count coverage against the FULL profile roster (every dir with a SOUL.md, excluding `_shared`/`_trash`), and list MISSING by name. A report of "37/47 patched" without the missing-names list hides the gap; with it, a second pass targeting the variant heading closes it in minutes.

### Heading-text variants within one patch run (anchored patches)

The same pitfall at patch time: `## 安全红线（不可违反）` vs `## 安全红线`. Always grep the exact heading in each target file before constructing `old_string`, or the patch matches the wrong location (or nothing).

### skill_manage cross_profile limitation

The `soul-md-privacy-section-patching` skill (and other devops skills)
may live in the `default` profile. `skill_manage` from `orchestrator`
cannot patch them even with `cross_profile=True`. If you need to extend
a cross-profile skill, create a new skill in the active profile instead.
This skill (`soul-protocol-block-insertion`) exists for that reason.

### Batch insertion at fleet scale (47+ profiles): classify → script → full-roster verify

For fleet-wide insertions (all profiles, not one team), do NOT patch
files one-by-one with the patch tool — write a Python script that:
1. Classifies each profile by anchor type via SUBSTRING match
   (`共享规则引用` / `协作协议` / `补充工具与命令` / none), because heading
   suffix variants (`（2026-08-22 补齐）`) make exact-match classifiers
   silently skip files.
2. For each class defines ONE insertion function (after-section /
   before-section) and handles heading variants explicitly — a profile
   whose heading is `## 共享规则引用（2026-08-22 补齐）` will not match an
   exact `## 共享规则引用` old_string; add the variant as its own class.
3. After the batch, greps a unique marker of the inserted block against
   the FULL roster (every profile dir with a SOUL.md, excluding
   `_shared`/`_trash`) and prints MISSING by name — then runs a second
   pass keyed to the missed heading variant.

Real case: substring classify + script pass hit 37/47; the 10 missed all
shared the `…（2026-08-22 补齐）` variant heading; a second pass keyed to
that heading closed it to 47/47. Keep the inserted block short (a uniform
blockquote reference pointing at the `_shared/` source file, ≤6 lines) so
SOUL.md size stays bounded.

### Assuming uniformity across profiles

Hack team and product team SOUL.md files have DIFFERENT loop structures
(`## 标准作业循环` code block vs `## 工作流程` numbered list). A single
patch template will not work for both. Read each file and classify it
as Variant H or Variant P before patching.

### Forgetting to renumber (Variant H)

The most common error. After inserting a step, ALWAYS grep for duplicate
step numbers. A successful `patch` return does NOT mean the step numbers
are correct — it only means the string replacement worked.

## Related Skills

- **soul-md-privacy-section-patching** — the two-copy privacy section
  trap, content-line anchoring, duplicate-header diagnosis. This skill
  builds on those techniques for multi-point protocol insertion.
- **agent-soul-patching** — batch-patching install commands and appending
  tool sections. Covers the two-phase patch pattern and concurrency.
- **soul-enrichment-pipeline** — the 5-layer SOUL.md enrichment structure
  (role → commands → supplemental → advanced → reference).
