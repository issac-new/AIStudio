---
name: orchestrator-soul-slimming
description: >-
  Slim a profile's SOUL.md by converting full theory blocks (PUA pressure
  engine, Harness 10 rules, Skill self-evolution, Delivering Work governance)
  into 1-line summaries that point to their skill_view() source. Use when a
  routing-layer profile (orchestrator) carries 7 🔴 blocks but 4 are pure
  theory with no runtime counter — the audit found it, this skill executes
  the slimming fix with before/after measurement. Bundles the 6 runnable
  audit probes as references. Complements multi-profile-system-audit (which
  FINDS the problem) with the EXECUTION of the slimming fix.
version: 1.0.0
metadata:
  hermes:
    tags: [context-engineering, soul-design, token-optimization, regression]
    related_skills: [multi-profile-system-audit, token-optimization, prompt-rule-enforcement]
---

# Orchestrator SOUL Slimming

Execute the fix that `multi-profile-system-audit` diagnoses: a
routing-layer profile whose SOUL.md bloated to 7 🔴 blocks (4 of them
pure theory with no runtime enforcement) gets slimmed to 1-line
`skill_view()` pointers, WITHOUT losing any rule.

## When to Use

- The audit (`multi-profile-system-audit`) found "7 🔴 blocks on a
  routing-only profile" — this skill does the slimming
- A profile's SOUL grew past ~400 lines / ~12KB after enrichment rounds
- Theory blocks (PUA L0-L4 tables, Harness 10 rules, Skill overlay
  formulas, Delivering Work governance tables) sit inline but have no
  runtime counter to enforce them
- Before a token-optimization pass — slimming is the prerequisite so
  the optimizer works on signal not boilerplate

## The Slimming Procedure

### Phase 0: Baseline (do NOT skip)

Before touching anything, capture the before numbers. A slimming
without a before/after number is an unverified claim.

```python
# Baseline capture
soul = open("~/.hermes/profiles/<profile>/SOUL.md").read()
print(f"before: {soul.count(chr(10))+1} lines, {len(soul)} chars")
blocks = re.findall(r'## 🔴 强制规则', soul)
print(f"🔴 blocks: {len(blocks)}")
```

Record: lines, chars, 🔴-block count, and the char-length of EACH
theory block you plan to slim.

### Phase 1: Identify the 4 theory blocks (the "cut list")

A theory block qualifies for slimming if ALL of these hold:
1. It's a 🔴 mandatory-rule block (has the 🔴 marker)
2. It contains tables/formulas/level-systems (L0-L4, 10 rules, overlay
   formulas, 5-dimensional tables, 6-layer audit tables)
3. It has NO runtime counter that enforces it (no kanban_comment
   failure-count, no error-signature hash, no auto-trigger)
4. Its content is ALREADY duplicated in a skill the profile can
   `skill_view()` on demand

The 4 canonical theory blocks on orchestrator (your cut list if
unchanged):

| Block | Source skill | Why it's theory-only |
|------|-------------|----------------------|
| 压力升级自检 (L0-L4) | pua-pressure-engine | No terminal-failure counter auto-triggers L2; model reads the table but nothing counts |
| Harness 工程纪律 (10 rules) | agent-harness-best-practices | No harness enforces rule #2/#4/#6 at runtime; it's a manifesto |
| Skill 自演进 (overlay formula) | skill-self-evolution-fusion | No runtime_weight calculation runs; overlay is aspirational |
| Delivering Work 治理 (5 items) | prompt-as-model-adapter | The 5 governance checks aren't mechanically enforced at kanban_complete |

### Phase 2: The slimming patch (per block)

For each theory block, replace the full block (tables, formulas,
examples — often 300-500 chars) with a 1-line summary + `skill_view()`
pointer. Keep the 🔴 marker and the block title — the slimmed line IS
the rule, the skill is the detail.

**Patch template** (the slimmed replacement):

```markdown
## 🔴 强制规则：<block title>（不可覆盖）

<1-sentence essence: what fires it + the 3-4 key items + the
diagnostic tag if applicable>. 详见 `skill_view('<source-skill>')`.
```

**Concrete example — pressure-engine block**:

Before (300+ chars):
```
## 🔴 强制规则：压力升级自检（执行中防线，不可覆盖）
> 来源：tanweai/pua 压力引擎...
### 压力升级等级（L0-L4）
| 失败次数 | 等级 | 强制动作 | ...
### 失败模式检测（连续失败后必查）
| 模式 | 检测条件 | 应对 | ...
### 诊断先行
改代码/配置前强制输出：[PUA-DIAGNOSIS] ...
### 突破降压
...
### 详细协议
完整压力升级协议...见 skill_view('pua-pressure-engine')。
```

After (1 line + pointer):
```
## 🔴 强制规则：压力升级自检（执行中防线，不可覆盖）

terminal 连续失败时按 L0-L4 升级（2次切方案/3次搜源码+列3假设/4次7项清单/5次拼命模式），检测 SPINNING(禁止重试)/EXPLORING(保持方向)/MIXED。改配置前强制输出 `[PUA-DIAGNOSIS] 问题是___；证据是___；下一步___`。详见 `skill_view('pua-pressure-engine')`。
```

**Key discipline**: the slimmed line MUST contain the trigger
condition ("terminal 连续失败时"), the key items (L0-L4 names,
SPINNING/EXPLORING/MIXED), and the diagnostic tag format
(`[PUA-DIAGNOSIS]...`). A model reading just this line knows WHEN to
fire and WHAT to do; the skill has the full table if needed.

### Phase 3: Keep the rule markers

Do NOT remove the `## 🔴 强制规则：` prefix or the `（不可覆盖）`
suffix. The slimmed block is still a mandatory rule — it just points
to the skill for the full table instead of inlining it. A future grep
for `🔴 强制规则` must still count the same N blocks before and after.

### Phase 4: Add the identity section if missing

A side-effect of bloated SOULs: the profile often has NO `# <Role>`
identity section at the top — the file opens straight into 🔴 rules.
While slimming, prepend a 3-line identity section:

```markdown
# Orchestrator（调度路由器）

你是 **Hermes 集群的调度路由入口**。<role scope>.
- **路由器，不是执行器**：<core duty 1>
- **分解器，不是实现者**：<core duty 2>
- **TUI/CLI 直接执行**：<edge case>
```

This is NOT optional — a profile without an identity section makes
the model start every turn reading rules instead of knowing who it is.

### Phase 5: Regression proof (mandatory)

Re-run the baseline probe. Every metric must move the right direction:

| Metric | Before | After (target) |
|--------|--------|---------------|
| Lines | 407 | <300 (-25%+) |
| Chars | 11,860 | <9,000 (-24%+) |
| 🔴 block count | 7 | 7 (unchanged — rules preserved) |
| Theory block avg char-len | 300-500 | <300 each |
| `skill_view()` pointer count | 0 | 4 (one per slimmed block) |

**Verified example (2026-07-30, orchestrator profile)**:
- Before: 407 lines / 11,860 chars / 7 🔴 blocks / 0 skill_view pointers
- After: 274 lines / 8,440 chars / 7 🔴 blocks / 4 skill_view pointers
- Result: -33% lines, -29% chars, 0 rules lost

If 🔴-block count drops, you DELETED a rule instead of slimming it —
revert and redo. The count is invariant.

## Pitfalls

### Don't slim a block that HAS a runtime counter

The 3 blocks to KEEP inline (do NOT slim):
- **智能路由留痕** — has a quantified trigger (≤2/3-5/≥6 tool calls)
  AND a mechanical check (kanban_create before reply). The table IS
  the enforcement.
- **认知自检** — the 5-item checklist IS the enforcement; slimming it
  to "see skill_view" lets the model skip the 5-second check
- **编码开发必须通过 ACP** — already 2 lines; nothing to slim

If you're unsure whether a block has runtime enforcement, DON'T slim
it. The audit skill's Phase 2 diagnosis table tells you which blocks
are theory-only.

### The "stable definition vs temp strategy" trap

When slimming, you may discover that a theory block ALSO contains a
stable definition (e.g. the Delivering Work block has both the 5
governance items AND the 6-layer rule-placement audit). The 5 items
are theory (no runtime check); the 6-layer audit is a stable
definition. Slim both — but the slimmed line must name BOTH:
"kanban_complete 前检查5项治理...规则分层：SOUL放身份/授权...详见
skill_view('prompt-as-model-adapter')".

### Identity section must precede the first 🔴 block

If you append the `# Orchestrator` identity section AFTER the first 🔴
block, the model reads rules before knowing its role — that's the
bloated-SOUL anti-pattern you're trying to fix. Always prepend.

### Cross-profile skill limitation (operational)

The `multi-profile-system-audit` and `soul-enrichment-command-manual`
skills live in the `default` profile's skill directory; the orchestrator
profile has symlink copies. `skill_manage` from the orchestrator
profile CANNOT patch them — it returns "not found in active profile".
To patch them: switch to `hermes -p default` first, or use standalone
`patch`/`write_file` with `cross_profile=True`. This is a known
operational constraint, not a bug.

## Reference Files

- `references/multi-profile-audit-scripts.md` — The 6 runnable
  `execute_code` probes for the 10-question health check. Run them
  BEFORE slimming (baseline) and AFTER (regression proof). Bundled
  here because the `multi-profile-system-audit` skill (default
  profile) references this file but doesn't ship it yet — this copy
  ensures the probes are reachable from the orchestrator profile.

## Related Skills

- **multi-profile-system-audit** (default profile) — DIAGNOSES the
  structural problems this skill FIXES. Overlaps on the audit scripts
  reference file — that skill's SKILL.md references the file but
  doesn't ship it; this skill ships a copy so the orchestrator
  profile can run the probes. Curator note: consolidate the scripts
  into the default-profile skill's references/ when cross-profile
  access is available.
- **token-optimization** — the broader token-reduction playbook.
  This skill is the SOUL-specific slimmer; token-optimization covers
  config tuning, MCP pruning, and delegate_task for large-data
  isolation.
- **prompt-rule-enforcement** — the runtime rule-following skill.
  This skill slims the RULE DEFINITION; prompt-rule-enforcement
  ensures the slimmed rule still fires at runtime. If a slimmed rule
  stops firing, the problem is enforcement, not the slimming.
