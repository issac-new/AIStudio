---
name: soul-rule-enforceability-audit
description: >-
  Audit SOUL.md files for "necessary capability written as suggestion"
  defects — suggestion tone on mandatory rules, missing quantified
  triggers, skills installed but never referenced, verification steps
  written as optional. Distinct from prompt-rule-enforcement (runtime
  rule following) and soul-operability-quality-bar (command density).
  Use when the user asks to audit all profiles' SOUL.md for rule
  enforceability, or after enrichment to verify new rules land correctly.
version: 1.0.0
platforms: [macos, linux]
metadata:
  hermes:
    tags: [soul-design, audit, rule-enforceability, quality-bar]
    related_skills:
      - prompt-rule-enforcement
      - soul-operability-quality-bar
      - soul-enrichment-pipeline
      - agent-soul-patching
---

# SOUL.md Rule Enforceability Audit

Audit all profile SOUL.md files for defects where a **necessary
capability is written as a suggestion**, causing the LLM to deprioritize
or skip it during task execution. This is the *static analysis*
complement to `prompt-rule-enforcement` (which handles *runtime*
enforcement of rules that are already written correctly).

## When to Use

- User asks to audit all profiles' SOUL.md for rule-quality defects
- After a SOUL.md enrichment round — verify new rules land with correct
  force level, not as soft suggestions
- A rule was followed inconsistently and the root cause is the RULE'S
  WORDING (not the runtime enforcement mechanism)
- After adding new skills, verify profiles reference them with mandatory
  triggers, not passive mentions

## Distinction from Related Skills

| Skill | What it covers | What this skill adds |
|-------|---------------|---------------------|
| `prompt-rule-enforcement` | Runtime enforcement: rules get forgotten mid-task → 3-layer fix (🔴 block + quantified triggers + memory sync) | Static audit: rules are WRITTEN wrong (suggestion tone, missing triggers, unreferenced skills) → identify and fix the wording |
| `soul-operability-quality-bar` | Command density (>25% commands, <60% description) | Rule enforceability: mandatory rules should NOT use suggestion tone; skills should be referenced with triggers |
| `soul-enrichment-pipeline` | Adding tool sections and command manuals | After enrichment, audit whether new mandatory behaviors are written as rules vs suggestions |

## The Five Problem Patterns

### Pattern 1: Suggestion tone on mandatory rules

**Signal**: Words like "应", "建议", "推荐", "可以", "建议使用" used for
rules that are actually mandatory.

**Example** (found in all 23 profiles, privacy section):
```
在 Docker 可用环境中，建议使用 terminal.backend: docker 实现 OS 层面的终端隔离
```
Privacy rules are marked 🔴 最高优先级, but this last line uses "建议"
(suggest). The LLM treats it as optional.

**Fix**: Replace with mandatory + penalty:
```
Docker 可用环境中**必须**使用 terminal.backend: docker；不可用时降级为本地执行并在 comment 中声明降级理由。
```

### Pattern 2: Missing quantified triggers

**Signal**: "必须"/"强制"/"不可" present but no numbers — no threshold
that says WHEN the rule fires.

**Example** (orchestrator cognition-lattice, before fix):
```
当遇到以下场景时，必须先 skill_view('cognition-lattice')...
- 任何 Gateway 消息执行前
- 任务路由、分解、Worker 分配...
```
"任何 Gateway 消息" is a trigger, but there's no penalty for skipping.
Compare to the smart-routing rule which has `忘记留痕 = 任务未完成`.

**Fix**: Every mandatory rule needs three elements:
1. **Trigger** (quantified: tool call count, file write count, scenario type)
2. **Action** (specific tool call or step)
3. **Penalty** (what happens if skipped: `= 任务未完成`, `kanban_block`, etc.)

### Pattern 3: Skills installed but not referenced in SOUL.md

**Signal**: A skill exists in `~/.hermes/skills/` but the profile's
SOUL.md has no `skill_view` reference or mandatory trigger to load it.

**Detection method**:
1. List all installed skills: `find ~/.hermes/skills -name SKILL.md`
2. For each profile SOUL.md, grep for `skill_view` and skill names
3. Cross-reference: which skills should this profile's role use but
   doesn't reference?

**High-value findings from 2026-07-25 audit (49 findings)**:
- `cognition-lattice`: only orchestrator references it; 6 other
  decision-heavy profiles (architect, project-manager, product-manager,
  product-prioritizer, requirement-analyst, ops-incident-commander) don't
- `cybersecurity/*` (300+ skills): hack team 6 profiles reference
  `references/*.md` files but ZERO `skill_view` calls to the 300+
  installed cybersecurity skills that directly map to their core
  capability domains
- `writing-plans`, `evidence-based-research`, `kanban-handoff-contract`:
  early-generated profiles (architect/PM/RA) lack the entire
  "📚 按需加载的技能库" section that later profiles all have

**Fix**: Add a `## 📚 按需加载的技能库` section with mandatory triggers:
```markdown
> 📚 **按需加载的技能库**（触发时 `skill_view('<name>')`）：
> `cognition-lattice`（决策前必须加载，按确认偏误+规划谬误自检）
```

### Pattern 4: Verification steps written as optional

**Signal**: Quality standards described as ideals ("precision >90%")
without the mandatory wrapper ("must achieve" + "if not → kanban_block").

**Example** (ops-sre, before fix):
```
监控有信号无噪声：每条告警都对应一个可执行的 runbook；
precision >90%（告警都是真问题）、recall >95%（真问题都告警）。
```
This reads as a description, not a gate. The LLM may treat 85% as "close
enough".

**Fix**:
```
监控**必须**达到 precision >90% 和 recall >95%。
不达标 → kanban_block(kind='needs_input') 报告告警质量差距，不得标记完成。
```

### Pattern 5: "必须" without trigger conditions or penalty

**Signal**: The word "必须"/"强制" appears but is followed by a vague
action with no quantified trigger and no consequence.

**Example** (all 23 profiles, ACP verification):
```
ACP agent 声称"完成"后，必须亲自验证（terminal 跑测试/linter/构建、
read_file 检查文件），不信任自述。
```
"必须" is correct, but: (1) no pass/fail criteria — what counts as
"verified"? (2) no penalty — what if the agent skips verification?

**Fix**:
```
ACP agent 声称"完成"后，**必须亲自验证**。
验证通过标准：测试全绿 + 文件存在 + 无越界改动。
不验证就 kanban_complete = 任务未完成。
```

## Audit Methodology

### Step 1: Discover all SOUL.md files

```python
from hermes_tools import search_files
result = search_files(pattern="SOUL.md", target="files",
                      path="~/.hermes/profiles", file_glob="SOUL.md")
files = result["files"]
# Typically 20-25 files across 4 teams
```

### Step 2: Read all files (batch read_file calls)

Batch `read_file` calls — the runtime executes them concurrently. For
20+ files, read in groups of 5-6 to stay within context limits.

### Step 3: Scan for the five patterns

For each file, check:

| Pattern | Grep signal | False-positive risk |
|---------|------------|---------------------|
| Suggestion tone | `应\|建议\|推荐\|可以` near `必须\|强制\|不可` | Low — context determines if it's a real rule |
| Missing triggers | `必须` without nearby numbers or `= 任务未完成` | Medium — some rules are genuinely triggerless |
| Unreferenced skills | `skill_view` count vs installed skills list | Low — cross-reference is deterministic |
| Optional verification | Quality metrics (numbers + %) without `必须` or `kanban_block` | Low |
| Must-without-penalty | `必须` without `= 任务未完成` or `kanban_block` | Medium |

### Step 4: Cross-reference installed skills

```bash
# All installed skills
find ~/.hermes/skills -name SKILL.md | sort

# Skills referenced in a profile's SOUL.md
grep -c 'skill_view\|📚' ~/.hermes/profiles/<name>/SOUL.md
```

Build a matrix: skill × profile → referenced? The gaps are findings.

### Step 5: Write structured report

Output format (per profile):
```
### <profile>
- **行号**: <N>
- **原文**: <quoted text>
- **问题类型**: <pattern 1-5>
- **严重程度**: 🔴高 / 🟠中 / 🟡低
- **修复建议**: <specific fix>
```

End with:
- Total findings count
- Severity distribution
- Batch fix plan (P0/P1/P2/P3 priority)

## Severity Calibration

| Severity | Criteria | Example |
|----------|----------|---------|
| 🔴 高 | A mandatory capability is completely missing (no reference at all) to an installed skill that directly maps to the profile's core role | hack team not referencing 300+ cybersecurity skills |
| 🟠 中 | A rule exists but uses suggestion tone, or a mandatory rule lacks quantified triggers/penalty | "建议使用 docker" in a 🔴 privacy section |
| 🟡 低 | Cosmetic: a quality standard is described but could be clearer, or an early profile lacks a standard section that later profiles have | architect missing the "退出协议" section |

## Batch Fix Priorities

After the audit, prioritize fixes:

| Priority | What | Why |
|----------|------|-----|
| P0 | Add missing skill references to decision-heavy profiles (cognition-lattice for 6 profiles) | Directly impacts decision quality every session |
| P1 | Add missing skill references for role-specific tools (cybersecurity for hack team) | Impairs operational capability |
| P2 | Global replace suggestion→mandatory tone (same line in 23 files) | Mechanical, high-value, can be scripted |
| P3 | Add quantified triggers and penalties to existing "必须" statements | Improves but rules already partially work |

## Case Study: 2026-07-25 Full Audit (49 findings)

**Scope**: 23 profiles across 4 teams (swarm, hack, product, ops)

**Findings by severity**:
- 🔴 高: 8 (missing skill references for core capabilities)
- 🟠 中: 18 (suggestion tone, missing triggers)
- 🟡 低: 23 (cosmetic, missing standard sections)

**Key systemic findings**:
1. `cognition-lattice` referenced only by orchestrator — 6 decision
   profiles missing it entirely
2. 3 early-generated profiles (architect/PM/RA) lack the entire
   "📚 按需加载的技能库" section — later profiles all have it
3. hack team 6 profiles reference `references/*.md` files but make
   ZERO `skill_view` calls to 300+ installed cybersecurity skills
4. All 23 profiles: Docker isolation written as "建议" in a 🔴 section
5. All 23 profiles: ACP verification "必须" has no pass/fail criteria
   or penalty

**Report written to**: `~/hermes-docker-sandbox/workspace/soul-audit-report.md`

See `references/rule-enforceability-audit.md` for the full 49-finding
report with per-profile line numbers, original text, and fix suggestions.

## Pitfalls

### skill_manage cannot patch symlinked default-profile skills

`prompt-rule-enforcement`, `soul-operability-quality-bar`, and several
other skills are symlinked from the `default` profile. `skill_manage`
reports "not found in active profile" even with `cross_profile=True`.
This skill exists in `orchestrator` to capture audit methodology that
extends those default-profile skills. Use `patch` tool directly on
SOUL.md files (those are agent config, not skills).

### Early profiles lack standard sections

Profiles generated early (architect, project-manager,
requirement-analyst) don't have the "📚 按需加载的技能库" section,
the "🚨 退出协议" section, or the standardized "不要做的事" block.
Later profiles (worker-*, product-*, ops-*, hack-*) all have them.
When auditing, flag missing standard sections as 🟡 低 findings — they
should be backfilled but aren't as critical as missing skill references.

### Suggestion tone is sometimes correct

Not every "应"/"可以" is a defect. Some rules genuinely ARE optional
(e.g., "Kano 分类（可选）" in product-prioritizer). The audit must
distinguish: is this a mandatory rule dressed as a suggestion, or a
genuinely optional step? Context (the section heading, surrounding
🔴 markers) determines this.

## Related Skills

- **prompt-rule-enforcement** (default profile) — runtime enforcement
  of rules that ARE written correctly; 3-layer pattern (🔴 block +
  quantified triggers + memory sync)
- **soul-operability-quality-bar** (default profile) — command density
  audit (>25% commands, <60% description); this skill extends it with
  rule-enforceability audit
- **soul-enrichment-pipeline** — after enrichment, run this audit to
  verify new rules land with correct force level
- **agent-soul-patching** — batch patch techniques for applying the
  fixes identified by this audit
