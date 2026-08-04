---
name: forward-deployed-soul-enrichment
description: >-
  Enrich worker SOUL.md files with Forward-Deployed Protocol recon checklist
  and Ontology reference blocks. Applies to ALL teams (swarm/hack/product/ops/
  [已移除]) — the `_shared/forward-deployed-protocol.md` §5.1 expects all 29
  non-orchestrator profiles to carry the recon step. Covers batch insertion
  via Python str.replace (not patch tool), anchor selection per team, the
  read_file dedup pitfall in execute_code, and idempotency checks. Use when
  adding forward-deployed/ontology blocks to any worker SOUL.md.
version: 1.0.0
platforms: [macos, linux]
metadata:
  hermes:
    tags: [soul-design, forward-deployed, ontology, patch-techniques, batch-enrichment]
    related_skills:
      - [已移除]
      - agent-soul-patching
      - multi-team-soul-enrichment
---

# Forward-Deployed SOUL.md Enrichment

Add two blocks to worker SOUL.md files:

1. **前线侦察清单 (Forward-Deployed Recon Checklist)** — inserted before
   `## 标准作业循环` ([已移除] team) or `## 工作流程` (Ops team). References
   `~/.hermes/profiles/_shared/forward-deployed-protocol.md` §2.
2. **Ontology 引用块** — inserted before `## 输出契约`. References
   `~/.hermes/profiles/_shared/ontology.md` §5.

## When to Use

- Adding forward-deployed recon + ontology blocks to ANY worker profile
  (swarm/hack/product/ops/[已移除]), not just [已移除]/Ops
- The `_shared/forward-deployed-protocol.md` §5.1 verification expects all
  29 non-orchestrator profiles to contain `前线侦察`
- After creating/updating `_shared/ontology.md` or `_shared/forward-deployed-protocol.md`
  and needing to propagate the references into worker SOULs

## The Two Patch Blocks

### Block 1 — 前线侦察清单

Inserted BEFORE the workflow section (`## 标准作业循环` for [已移除],
`## 工作流程` for Ops/swarm). Content (exact text — copy from
`references/patch-blocks.md` to avoid transcription drift):

```markdown
---

## 前线侦察清单（执行任务前必须完成）

接到任务后，**在执行任何实质操作前**，必须完成以下侦察（尽可能并行）：

1. **读取任务上下文** — `kanban_show()` 读 body 中的 context / ontology_refs，读 parents 的 CompletionHandoff
2. **读取本地代码库** — `read_file("AGENTS.md")`，`search_files(pattern="<相关关键词>", target="content")`
3. **查历史会话** — `session_search(query="<任务相关关键词>", limit=3)`
4. **查团队共享记忆** — `hindsight_recall(query="<任务领域关键词>")`
5. **查相关 skill** — `skills_list()`

侦察完成后，**必须**将摘要写入 `kanban_comment`（含任务目标/上游交接物/本地代码现状/历史经验/适用skill/风险与约束/执行计划）。
未写侦察摘要就开始执行 = 任务未完成。详见 `~/.hermes/profiles/_shared/forward-deployed-protocol.md` §2。
```

### Block 2 — Ontology 引用块

Inserted BEFORE `## 输出契约` (fallback: `## Loop Engineering 验证门`):

```markdown
> 本任务的产出遵循 `~/.hermes/profiles/_shared/ontology.md` 定义的对象模型。
> 产出物类型：Artifact (type=code/report/...)，含 markings 标记。
> 完成交接遵循 CompletionHandoff 接口。
```

## Anchor Selection (per team)

| Team | Recon anchor | Ontology anchor |
|------|-------------|-----------------|
| [已移除] | `## 标准作业循环` | `## 输出契约` |
| Ops | `## 工作流程` | `## 输出契约` |
| Swarm (worker-*) | `## 标准作业循环` or `## 工作流程` | `## 输出契约` |
| Hack | `## 标准作业循环` (hack-auditor uses this) | `## 输出契约` or end of role section |
| Product | `## 工作流程` | `## 输出契约` |

**Multi-anchor fallback**: Always try `## 输出契约` first for ontology; if
absent, fall back to `## Loop Engineering 验证门`. For recon, try
`## 标准作业循环` then `## 工作流程`.

## Batch Insertion Technique — Python str.replace, NOT patch tool

**Do NOT use the `patch` tool for batch SOUL.md enrichment.** Use a Python
script via `terminal` (writing to `/tmp/script.py` and running `python3`).
Reasons:

1. `patch` tool fuzzy-matches and can miss/shift on large SOUL.md files
2. Python `str.replace(anchor, block + anchor, 1)` does exact byte matching
3. One script can patch 10+ files atomically with per-file assertions
4. The `patch` tool requires unique `old_string` — section headers like
   `## 工作流程` may not be unique across files (though they are within one file)

### Batch script template

See `scripts/batch-insert.py` — a complete re-runnable script that:
- Defines the two block strings
- Loops over a profile list
- Reads each file, checks idempotency (`has_recon`, `has_ontology`)
- Inserts via `str.replace` with anchor fallback
- Writes back, then re-reads to verify
- Prints a status table

## Idempotency — Check Before Inserting

**Always** assert the block is not already present before inserting:

```python
has_recon = "前线侦察清单" in content
has_ontology = "ontology.md` 定义的对象模型" in content
if has_recon and has_ontology:
    results.append((p, "SKIP", "already patched"))
    continue
```

Some profiles (e.g. `project-manager`, `hack-auditor`) may already be
patched from a prior group. Skipping is correct — never double-insert.

## Critical Pitfall: read_file Dedup in execute_code

**Do NOT use `execute_code` with `read_file` for batch SOUL.md patching.**

`read_file` has a dedup cache: if a file was already read earlier in the
conversation (by any tool), `read_file` returns a stub:
```json
{"status": "unchanged", "content_returned": false, ...}
```
...instead of the file content. Inside `execute_code`, this raises
`KeyError: 'content'` and crashes the batch script.

**Fix**: Write the batch script to a temp file and run it via `terminal`:

```python
# Write script to /tmp/patch_soul.py, then:
# terminal: python3 /tmp/patch_soul.py
```

Inside the script, use plain `open(path).read()` — NOT `read_file` — to
bypass the dedup cache entirely. This is reliable for 10+ files in one run.

## Critical Pitfall: skill_manage Cannot Patch Default-Profile Skills

Skills symlinked from `default` into `orchestrator` (like
`[已移除]`, `agent-soul-patching`) cannot be patched via
`skill_manage(cross_profile=True)`. The flag is recognized but doesn't
resolve the skill lookup — it errors with "not found in active profile".

**Workaround**: Create a new orchestrator-profile skill (like this one)
to capture new learnings. The original default-profile skill stays as-is.

## Verification After Enrichment

Use `search_files` (content mode) to verify each file:

```
For each profile:
  recon_header_count = count of lines starting with "## 前线侦察清单"  → expect 1
  ontology_count = count of "ontology.md` 定义的对象模型"            → expect 1
  ordering: recon_line < workflow_line < ontology_line < output_line < loop_line
```

Also spot-read 2-3 files with `read_file(offset=..., limit=...)` to
confirm the blocks render correctly in context.

### Full verification command

```bash
for p in <profile_list>; do
  f=~/.hermes/profiles/$p/SOUL.md
  echo "===== $p ====="
  grep -n "## 前线侦察清单\|ontology.md\` 定义的对象模型\|## 输出契约\|## Loop Engineering" "$f"
  echo "lines: $(wc -l < "$f")"
done
```

## Relationship to Other Enrichment Skills

| Skill | Enrichment type | Footer pattern | Team scope |
|-------|----------------|----------------|-----------|
| `[已移除]` (default) | `## 具体操作命令手册` | Loop Engineering anchor | [已移除] + Ops |
| `soul-enrichment-command-manual` (default) | `## 具体操作命令手册` | double-`---` footer | product/collaboration |
| `collaboration-team-soul-enrichment` (default) | `## 具体操作命令手册` | double-`---` footer | collaboration team |
| **`forward-deployed-soul-enrichment`** (this) | recon checklist + ontology block | n/a (insert before existing sections) | ALL teams |

This skill is **orthogonal** to the command-manual enrichment skills —
they add different sections and can coexist in the same SOUL.md.

## Session History

- 2026-07-31: Applied to ops team 4 + [已移除] team 6 = 10 profiles in one batch
  script. Group 3 of a 3-group rollout (group 1: swarm 7 profiles, group 2:
  hack team 6 profiles). All 10 files verified: exactly 1 recon header,
  exactly 1 ontology block, correct ordering.

## Related Skills

- **[已移除]** (default) — command-manual enrichment for
  [已移除]/Ops, Loop-Engineering-anchor technique
- **agent-soul-patching** (default) — batch SOUL.md patching, two-phase
  pattern, concurrency strategy, cross_profile limitation
- **multi-team-soul-enrichment** (default) — three-phase pipeline for
  cross-team enrichment (catalog → enrich → verify)
