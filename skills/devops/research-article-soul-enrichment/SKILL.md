---
name: research-article-soul-enrichment
description: >-
  Enrich a team of Hermes agent SOUL.md files with domain knowledge extracted
  from a research article (WeChat, blog, survey paper). Covers the full
  pipeline: fetch article → extract papers/tools/methodologies → map to
  profiles by gap analysis → insert domain sections with arXiv citations +
  maturity boundary warnings → verify 100% coverage. Use when the user
  provides an article URL and asks to "完善各agent的profile" or "调研分析并完善".
version: 1.0.0
platforms: [macos, linux]
metadata:
  hermes:
    tags: [soul-enrichment, research, domain-knowledge, gap-analysis, [已移除]]
    related_skills:
      - wechat-article-research
      - deep-research-workflow
      - agent-soul-patching
      - [已移除]
---

# Research Article → Team SOUL.md Enrichment

Enrich a team of agent SOUL.md files with domain knowledge extracted from a
single research article. This is the **integration skill** that connects
article extraction (`wechat-article-research`), gap analysis
(`deep-research-workflow`), and SOUL.md patching (`agent-soul-patching`) into
one end-to-end pipeline.

## When to Use

- User provides an article URL (WeChat `mp.weixin.qq.com`, blog, survey paper)
  and asks to "深入调研分析，完善各agent的profile"
- User asks to enhance a team's SOUL.md files based on a specific article's
  content (papers, tools, methodologies)
- User wants domain knowledge from a survey article mapped to existing agent
  profiles' "核心职责" sections

## When NOT to Use

- User asks for research only with no profile changes → use
  `deep-research-workflow` + `scope-discipline` (research-then-propose, no
  implementation)
- User asks to add CLI tools (not domain knowledge/papers) → use
  `agent-soul-patching` Phase 1 (fix install commands)
- User asks to create a brand-new team → use `multi-board-team-deployment`

## Workflow (6 steps)

### Step 1: Fetch and parse the article

Use `browser_navigate` to load the article URL, then `browser_snapshot` with
`full=true` to capture the complete content. For WeChat articles, the snapshot
may be truncated — use `read_file` on the saved snapshot path to read the rest.

```python
# After browser_navigate + browser_snapshot(full=True), the snapshot is saved to:
# ~/.hermes/profiles/orchestrator/cache/web/browser-snapshot-<hash>.txt
# Read it with read_file(offset=N, limit=200) to page through truncated content
```

**Key insight (2026-07-30)**: The `browser_navigate` snapshot for a long
WeChat article was ~300 lines visible + 200+ truncated. The truncated portion
contained half the papers (路线⑤⑥⑦). Always read the full snapshot file with
`read_file` using offset/limit pagination to get ALL content before analysis.

### Step 2: Extract structured knowledge

Parse the article to extract:
- **Papers/projects**: name, institution, arXiv ID or GitHub star count,
  core contribution, maturity boundary
- **Technical routes/categories**: group papers into themes (e.g. "数据训练",
  "Benchmark", "RTL生成", "验证", "Agent执行层", "工具演化", "模拟设计")
- **Key metrics**: success rates, improvement percentages — preserve exact
  numbers with their caveats (e.g. "36.66% success rate" not "high success")

### Step 3: Read ALL target team SOUL.md files

Batch `read_file` calls for every profile in the target team. For a 6-profile
team (e.g. [已移除]), issue 6 concurrent reads in one turn.

For each profile, note:
- Existing "核心职责" sections and their numbering (§1, §2, ... §N)
- The footer structure (Loop Engineering + Privacy — common to all)
- Which article routes/papers are already covered (gap = not covered)
- The profile's domain identity (e.g. "IP核工程师" vs "AI+[已移除]工程师")

### Step 4: Gap analysis — map article content to profiles

Create a gap matrix: article routes × profiles. For each cell, mark:
- **Covered**: profile already has this content
- **Gap**: profile should have this content based on its domain identity
- **N/A**: content doesn't apply to this profile's domain

**Gap analysis principles**:
- The profile with the broadest scope (e.g. `[已移除]` for [已移除] team) should get
  a "全景" section covering ALL routes — it's the team's AI methodology hub
- The profile with the deepest specificity (e.g. `[已移除]` for RTL/验证)
  should get deep coverage of the routes matching its domain (RTL生成, 验证)
- Profiles with adjacent domains (e.g. `[已移除]` for 模拟设计) should get
  the routes touching their domain (路线⑦ ACOF/ATLAS)
- Profiles with distant domains (e.g. `[已移除]` for 光学计算) should get
  a lightweight "方法论迁移" section — note which routes CAN transfer, not
  force-fit all routes

### Step 5: Patch each SOUL.md with domain sections

Use `patch(mode='replace')` to insert new sections. Two insertion patterns
depending on the file structure:

**Pattern A — Pre-footer insertion** (when file ends with Loop Engineering +
Privacy footer, common in [已移除]/swarm profiles):

Match the entire footer block as `old_string`, prepend the new section:

```
old_string: "## Loop Engineering 验证门\n\n`kanban_complete`...隐私保护规则...mandatory-privacy.md`."
new_string: "## <New Section Title>\n\n> ⚠️ **成熟度边界**：...\n\n<content with arXiv IDs>\n\n## Loop Engineering 验证门\n\n..."
```

**Pattern B — Mid-section insertion** (when adding after the last numbered
responsibility item, before the next `##` heading):

```
old_string: "### 6. 验证方法\n- ...existing items...\n\n## 标准作业循环"
new_string: "### 6. 验证方法\n- ...existing items...\n\n### 7. <New Title>\n\n> ⚠️ **成熟度边界**：...\n\n<content>\n\n## 标准作业循环"
```

**Pattern C — Table row addition** (for profiles with a tool/domain table):

```
old_string: "| **Last Row** | ... |"
new_string: "| **Last Row** | ... |\n| **New Domain** | ... |"
```

### Step 6: Verify coverage

Run a verification script via `execute_code`:

```python
import os, re

ALL_PAPERS = {
    'OpenRTLSet': '2606.10285', '[已移除]': '2605.06952', ...
}

all_content = ""
for p in TARGET_PROFILES:
    soul = f"{HERMES}/profiles/{p}/SOUL.md"
    all_content += open(soul, encoding='utf-8').read()

covered = sum(1 for name, arxiv in ALL_PAPERS.items() if arxiv in all_content)
print(f"Coverage: {covered}/{len(ALL_PAPERS)} papers")

# Also verify each profile got its new section
for p in TARGET_PROFILES:
    content = open(f"{HERMES}/profiles/{p}/SOUL.md").read()
    has_section = any(marker in content for marker in SECTION_MARKERS)
    arxiv_count = len(re.findall(r'arXiv \d+\.\d+', content))
    print(f"  {p}: new_section={'✅' if has_section else '❌'}, arXiv refs={arxiv_count}")
```

**Verification criteria**:
- 100% of papers from the article are referenced across the team
- Every profile has at least one new section matching its gap analysis
- Every new section has a `⚠️ 成熟度边界` warning
- No existing skeleton (ACP block, 你是谁, 标准作业循环, 验证清单, 输出契约,
  协作协议, Loop Engineering, 隐私保护) was modified

## Domain Knowledge Section Template

Every inserted section MUST follow this structure — arXiv ID + maturity
boundary are non-negotiable:

```markdown
## <Domain> 前沿（<Source>）

> ⚠️ **成熟度边界**：以下论文方法来自预印本和学术 benchmark，不等同于
> 企业级验证、签核或流片能力。实现时须以仿真/形式验证/综合工具的客观
> 结果为准。

### <Sub-topic>（路线N）
- **PaperName**（arXiv XXXX.XXXXX）：<one-line contribution>.
  <maturity caveat — what this does NOT guarantee>
- **PaperName**（arXiv XXXX.XXXXX）：<...>
```

## Key Lessons (from 2026-07-30 [已移除] enrichment session)

### 1. Read the FULL article, not just the first snapshot

WeChat articles can be 500+ lines. The initial `browser_snapshot` captures
~300 lines. The remaining 200+ lines contained 3 of 7 technical routes
(Agent执行层, [已移除]工具演化, 模拟设计). Without reading the full snapshot,
6 of 26 papers would have been missed.

### 2. The broadest-scope profile gets a "全景" section

`[已移除]` covers AI+[已移除] methodology holistically. It should get a section
covering ALL 7 routes (①-⑦), acting as the team's AI methodology hub.
Other profiles get route subsets matching their domain depth. This prevents
every profile from duplicating the full 26-paper list.

### 3. "方法论迁移" for distant-domain profiles

`[已移除]` (光学计算) has no direct overlap with AI for [已移除] routes. But
the AI for [已移除] methodologies (过程奖励, Agentic执行层) CAN transfer to
optical computing. A lightweight "方法论迁移" section (2-3 entries, not 26)
captures this without force-fitting. Mark each entry as "方法论可迁移至..."
rather than claiming direct applicability.

### 4. Maturity boundary warnings are mandatory

Every inserted section must start with `> ⚠️ **成熟度边界**：...`. This is
the user's hard requirement — "严禁编造数据，样子货" (no fabricated data,
no fake improvements). The boundary warning distinguishes "paper says X%" from
"this will work in production" — a distinction the user demands.

### 5. Verify with a coverage script, not by re-reading

After patching 6 files, don't manually re-read each one to check if all 26
papers are covered. Run a regex coverage script (`execute_code`) that checks
every arXiv ID across all files. This is faster and catches missed papers
that manual review would overlook.

### 6. cross_profile skill_manage limitation

If `skill_manage` reports "not found in active profile 'orchestrator'" for
a skill that `skill_view` CAN read, the skill is symlinked from `default`
profile. `skill_manage(cross_profile=true)` does NOT fix this — the lookup
still fails. Workaround: use the `patch` tool directly on the SKILL.md file
path (not `skill_manage`), or create a new orchestrator-native skill (like
this one) to capture the learning.

## Related Skills

- **wechat-article-research** — Article fetching with curl+regex or browser
  snapshot. Use for the initial content extraction (Step 1).
- **deep-research-workflow** — Multi-source research with parallel subagents.
  Use when the article references external sources that need follow-up
  research (e.g. fetching GitHub repos mentioned in the article).
- **agent-soul-patching** — General SOUL.md patching techniques including
  the pre-footer insertion pattern (Phase 2b). This skill's Step 5 uses
  those techniques with domain-knowledge-specific content.
- **[已移除]** — The [已移除] Platform codebase. Relevant when
  the enriched SOUL.md files guide development of that platform's modules.
