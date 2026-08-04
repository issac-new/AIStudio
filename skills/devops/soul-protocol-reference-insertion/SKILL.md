---
name: soul-protocol-reference-insertion
description: >-
  Insert shared protocol references (Ontology, forward-deployed-protocol)
  and workflow steps (前线侦察) into team SOUL.md files. Covers
  insertion-point-aware patching: numbered 工作流程 lists vs fenced
  标准作业循环 code blocks, full-list renumbering discipline, content-line
  anchoring for reference blocks, skip-already-patched handling, and
  anchor-grep verification. Use when adding a shared protocol step or
  reference block across N profiles in a team.
version: 1.0.0
platforms: [macos, linux]
metadata:
  hermes:
    tags: [soul-design, patch-techniques, protocol-references, swarm-team]
    related_skills:
      - agent-soul-patching
      - soul-md-privacy-section-patching
      - multi-team-soul-enrichment
---

# SOUL.md Protocol Reference + Workflow Step Insertion

A specialized patching technique for inserting **shared protocol
references** (e.g. `~/.hermes/profiles/_shared/ontology.md`,
`~/.hermes/profiles/_shared/forward-deployed-protocol.md`) and **workflow
steps** (e.g. 前线侦察 forward-recon) into every SOUL.md in a team.

Distinct from `agent-soul-patching` (fixing install commands + appending
tool sections) and `soul-md-privacy-section-patching` (the two-copy privacy
trap): this skill handles **positional insertion into existing workflows**
where the step must land at a specific position and all subsequent steps
must renumber.

## When to Use

- User says "为 N 个 profile 的 SOUL.md 添加 X 引用 + Y 步骤"
- A shared protocol document is introduced under `_shared/` and every team
  profile must reference it + execute its steps
- Adding a 前线侦察 (forward-recon) step, an Ontology reference block, or
  any protocol that standardizes how agents operate across a team

## Step 1 — Read All Targets + The Already-Patched Template

Batch-read every target SOUL.md **and** the already-patched profile (if the
user says "X already patched, skip"). The already-patched one is your
template — it shows exactly where the step and reference block should go.

```python
# Batch read in one turn
for p in targets + [template_profile]:
    read_file(f"~/.hermes/profiles/{p}/SOUL.md")
```

## Step 2 — Classify Each SOUL.md by Family

The insertion point depends on the workflow structure. Two families:

| Family | How to recognize it | Where the workflow step goes | Where the reference block goes |
|---|---|---|---|
| Numbered 工作流程 list | `## 工作流程\n\n1. **接收任务** — ...` | Insert as step 2, renumber 2→N to 3→N+1 | Before `## Loop Engineering 验证门` |
| Fenced 标准作业循环 code block | `## 标准作业循环\n\n```\nkanban_show()  # 1. ...` | Insert as line 2-3 inside the ``` block, renumber `# N.` comments | After 输出契约 code block, before 协作协议 |

## Step 3 — Patch Workflow Step (with full renumber)

### Numbered list family (architect, requirement-analyst, project-manager)

```python
# old_string (unique block, with renumber):
old = """1. **接收任务** — `kanban_show()` ...
2. **分析需求** — ...
3. **设计架构** — ...
4. **输出文档** — ...
5. **完成** — ..."""
# new_string (step 2 inserted, 2→3→4→5→6):
new = """1. **接收任务** — ...
2. **前线侦察** — `read_file` 读 AGENTS.md/相关代码；`search_files` 搜索仓内上下文；`session_search` 查历史会话；`hindsight_recall` 查团队记忆。将摘要写入 `kanban_comment(body="## 前线侦察摘要\\n...")`（详见 `~/.hermes/profiles/_shared/forward-deployed-protocol.md`）
3. **分析需求** — ...
4. **设计架构** — ...
5. **输出文档** — ...
6. **完成** — ..."""
patch(mode="replace", path=SOUL, old_string=old, new_string=new)
```

### Fenced code block family (worker-*)

```python
# old_string (the full code block with comments):
old = """kanban_show()                      # 1. ...
cd $HERMES_KANBAN_WORKSPACE        # 2. ...
读上游架构/需求文档 + 现有代码       # 3. ...
acp_send(provider="claude", …)     # 4. ...
...
kanban_complete(summary, metadata)  # 9. ..."""
# new_string (line 2-3 inserted, all comments renumbered):
new = """kanban_show()                      # 1. ...
cd $HERMES_KANBAN_WORKSPACE        # 2. ...
前线侦察: read_file/search_files/session_search/hindsight_recall → kanban_comment("## 前线侦察摘要\\n...")  # 3. 前线侦察（详见 forward-deployed-protocol.md）
读上游架构/需求文档 + 现有代码       # 4. ...
acp_send(provider="claude", …)     # 5. ...
...
kanban_complete(summary, metadata)  # 10. ..."""
patch(mode="replace", path=SOUL, old_string=old, new_string=new)
```

**Renumbering discipline**: ALL subsequent step numbers must shift +1. A
partial renumber leaves the workflow logically inconsistent. When the
old_string spans the full list/block, the patch tool replaces it atomically
— no partial state.

## Step 4 — Patch Reference Block (content-line anchored)

The reference block is a standalone section. Anchor on a unique content
line — NEVER on `---` dividers (per `soul-md-privacy-section-patching`).

### Template

```markdown
---

## Ontology 引用

> 本任务的产出遵循 `~/.hermes/profiles/_shared/ontology.md` 定义的对象模型。产出物类型：Artifact (type=code/report/...)，含 markings 标记。完成交接遵循 CompletionHandoff 接口。
```

### Insertion (anchor on a unique code-block end)

For worker-* profiles, anchor on the last line of the 输出契约 code block:

```python
old = '''kanban_block(reason="deploy-failed: ...",
             kind="needs_input")
```'''  # the closing ``` of 输出契约

new = '''kanban_block(reason="deploy-failed: ...",
             kind="needs_input")
```

---

## Ontology 引用

> 本任务的产出遵循 `~/.hermes/profiles/_shared/ontology.md` 定义的对象模型。产出物类型：Artifact (type=code/report/...)，含 markings 标记。完成交接遵循 CompletionHandoff 接口。'''
```

For architect/requirement-analyst (no 输出契约), anchor before `## Loop Engineering 验证门`:

```python
old = "---\n\n## Loop Engineering 验证门"
new = "---\n\n## Ontology 引用\n\n> ...\n\n---\n\n## Loop Engineering 验证门"
# ⚠️ If `---\n\n## Loop Engineering 验证门` is NOT unique (appears 5x
# across different sections), include more context or use a larger
# old_string that spans from a unique line down to the target.
```

## Step 5 — Verify with Anchor Grep

After all patches, verify both anchors landed exactly once per file:

```python
for p in profiles:
    path = f"~/.hermes/profiles/{p}/SOUL.md"
    ont = search_files(pattern="Ontology", path=path, output_mode="count")
    recon = search_files(pattern="前线侦察", path=path, output_mode="count")
    # Expect count=1 for each
    status = "✓" if ont and recon else "✗"
    print(f"{p}: {status} ontology={ont} recon={recon}")
```

A count of 0 = patch missed; 2+ = duplicate (rare with content-line
anchoring, but check).

## Pitfalls

### `---\n\n## Loop Engineering 验证门` is not unique

In some SOUL.md files (e.g. requirement-analyst), the pattern
`---\n\n## Loop Engineering 验证门` appears multiple times because `---`
separates many sections. The `patch` tool returns "Found 5 matches".

**Fix**: Include a larger context block in `old_string` — from a unique
nearby line (e.g. the last `### 不要做的事` bullet) down through the
`## Loop Engineering 验证门` header. Or anchor on a different unique line
and append the reference block after it.

### skill_manage cannot patch default-profile skills

The existing skills (`agent-soul-patching`, `soul-md-privacy-section-patching`,
`multi-team-soul-enrichment`) are symlinked from `default` into
`orchestrator`. `skill_manage(cross_profile=true)` recognizes the flag but
doesn't resolve the skill lookup — it still says "not found in active
profile". This is a known limitation documented in `agent-soul-patching`.

**Workaround**: Create a new orchestrator-profile skill (like this one) to
capture the learning. The SOUL.md files themselves are not skills — they're
agent configuration files — so `patch` and `write_file` work on them
directly without cross_profile restrictions.

### Partial renumber in fenced code blocks

When patching inside a ``` code block, it's tempting to only match the
first 2-3 lines and insert. But the `# N.` comments after the inserted line
are now wrong. **Always match the full code block** (all lines with `# N.`
comments) so the replacement includes the renumbered version.

## Session Record (2026-07-31)

- **7 profiles patched**: architect, requirement-analyst, worker-coder,
  worker-deployer, worker-researcher, worker-reviewer, worker-tester
- **2 patches each** (workflow step + reference block) = 14 patches total
- **2 skipped**: orchestrator (router, no task execution), project-manager
  (already patched by user — used as template)
- **Verification**: all 7 files had count=1 for both `Ontology` and
  `前线侦察` anchors
- **No duplicates, no orphaned fences** — content-line anchoring held up
- **One non-blocking issue**: `---\n\n## Loop Engineering 验证门` was
  non-unique in requirement-analyst (5 matches); resolved by using a larger
  old_string spanning from `### 不要做的事` bullets to the header

## Related Skills

- **agent-soul-patching** — (default profile) Batch-patch SOUL.md install
  commands + append tool sections. This skill extends it with positional
  workflow-step insertion.
- **soul-md-privacy-section-patching** — (default profile) The two-copy
  privacy trap and content-line anchoring. This skill builds on the
  content-line anchoring rule for reference-block insertion.
- **multi-team-soul-enrichment** — (default profile) Three-phase pipeline
  for multi-team SOUL.md enrichment. This skill is the "Strategy C"
  (protocol references) that complements its Strategy A (command manuals)
  and Strategy B (tool supplements).
