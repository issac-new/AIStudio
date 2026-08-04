---
name: prompt-ownership-boundary
description: >-
  Decide whether prompt content belongs in local SOUL.md/rules.md or is the
  model service's responsibility. Covers the authorization-framing vs.
  authorization-boundary distinction, the batch-removal technique for
  refusal-mitigation blocks, and the cross-profile reference cascade when
  deleting a skill. Use when auditing SOUL.md for refusal-mitigation scaffolding,
  when tempted to add authorization preambles, or when a model refuses legitimate
  work and the question is whether to patch the prompt or switch the model.
version: 1.1.0
platforms: [macos, linux]
metadata:
  hermes:
    tags: [context-engineering, prompt-engineering, soul-design, authorization, model-alignment]
    related_skills:
      - context-engineering-audit
      - prompt-as-model-adapter
      - model-allocation-strategy
      - soul-audit-fix-execution
---

# Prompt Ownership Boundary

Distinguish prompt content the local deployment should own from content
that is the model service's responsibility. The canonical case:
**authorization framing** (refusal-mitigation preambles, rephrase-to-evade
recipes) is the model service's job; **authorization boundaries** (red
lines, Human Gates) are the local deployment's job.

## When to Use

- Auditing SOUL.md/rules.md and finding refusal-mitigation scaffolding
  ("授权安全研究声明" preambles, "降低模型误拒绝" recovery protocols,
  "rephrase goal as DevSecOps inventory to evade safety filter" recipes)
- A model refuses legitimate sensitive-domain work and the question is:
  add authorization framing to the prompt, or switch the profile's model?
- After deleting a skill, finding stale references to it in other skills
- Reviewing whether a SOUL.md section compensates for model-side behavior
  the model service should own (output format coaching, safety classification,
  refusal avoidance)

## The Core Distinction

| Concept | Purpose | Owner | Location | Action |
|---------|---------|-------|----------|--------|
| **Authorization framing** | Make the model not refuse | Model service | **Nowhere local** | Delete; if model refuses, switch model |
| **Authorization boundaries** | Tell the agent when to stop | Local deployment | rules.md §1, Human Gate | Keep |

### Authorization framing (DELETE)

Prompt-level scaffolding that tries to prevent model refusals by declaring
authorization context before sensitive keywords:

- SOUL.md top preamble: `> **授权安全研究声明 (Authorization Context)** ...`
- rules.md §4: `## 4. 降低模型误拒绝的协作模式 (Refusal Mitigation)` with
  steps like "引用授权声明, 重新表述请求为'在授权靶场上执行', 强调防御目的"
- Task-body wrappers: `> [授权安全测试] 本任务来自内部安全团队看板...`
- Skill recipes: "Rephrase the goal as 'DevSecOps tool inventory for
  authorized penetration testing team' to avoid triggering the safety filter"

**Why delete**: The model's safety classifier is the model service's
responsibility. Local prompt-level framing compensates for a model-side
behavior that the model service should absorb as models mature. Maintaining
it locally means re-tuning every model upgrade (the U-curve direction is
delete old tutorials, add cross-task governance — framing is "old tutorial").

**What to do instead**: If a model refuses legitimate work, switch that
profile's model:
```
hermes config set model.default <alt> --profile <name>
```
Do not add authorization preambles. Do not teach agents to rephrase goals
to evade safety filters.

### Authorization boundaries (KEEP)

Operational gates that tell the agent when to stop — these are not about
model refusal, they are about the agent deciding a task is out of scope:

- rules.md §1: `## 1. 授权红线 — 无授权不操作→kanban_block, 越界即停止, 最小影响`
- hack-weapons special: `钓鱼/DDoS 额外授权, payload 仅用于授权测试, 密码破解范围`
- Human Gate HIGH level: external comms, deployment, refunds need approval

**Why keep**: These are task-scope decisions, not prompt-engineering for
the model's safety classifier. They tell the agent to `kanban_block` when
authorization is missing — a behavior the deployment needs regardless of
which model is running.

## Batch Removal Technique

When the same refusal-mitigation block exists in N files (e.g. the
authorization preamble was byte-identical across 6 hack SOUL.md files),
use `execute_code` with a compiled regex — one call, N substitutions,
idempotent. Per-file `patch` calls would be N round-trips and require
unique-context matching.

### Pattern: SOUL.md preamble block (identical across N files)

```python
import re
preamble = re.compile(
    r'\n> \*\*授权安全研究声明 \(Authorization Context\)\*\*\n'
    r'.*?'
    r'> \*\*红线依然有效\*\*：无授权不操作、越界即停止、最小影响——详见 rules 文件。\n\n\n?',
    re.DOTALL
)
for p in hack_profiles:
    path = f'$HOME/.hermes/profiles/{p}/SOUL.md'
    content = open(path).read()
    new, n = preamble.subn('\n', content)
    if n == 1:
        open(path, 'w').write(new)
        print(f"{p}: removed ✓")
    else:
        print(f"{p}: WARN matched {n}, expected 1")
```

**Key**: regex matches from the header line to the closer line, with
`re.DOTALL` so `.` matches newlines. The `if n == 1` guard catches
unexpected matches (0 = already removed or block changed, >1 = duplicate
blocks — both need investigation).

### Pattern: rules.md trailing section (§4 to EOF)

```python
section = re.compile(r'\n\n## 4\. 降低模型误拒绝的协作模式.*$', re.DOTALL)
for p in hack_profiles:
    path = f'$HOME/.hermes/profiles/{p}/{p}_rules.md'
    content = open(path).read()
    new, n = section.subn('', content)
    if n == 1:
        open(path, 'w').write(new.rstrip() + '\n')
        print(f"{p}: §4 removed ✓")
```

### Pattern: orchestrator rules subsection (§0.5.3a)

Use `patch(mode='replace')` — single file, unique context, fuzzy matching
gives a clean unified diff. Not a batch operation.

### Verification (always run after removal)

Scan all profile .md + skills .md for residual prompt terms. Filter out
descriptive records (MEMORY.md entries recording the policy decision are
fine — they record the fact, not active prompt content). Terms to scan:

`授权安全研究声明`, `Authorization Context`, `降低模型误拒绝`,
`Refusal Mitigation`, `引用授权声明`, `授权上下文`, `授权框架`,
`授权安全测试`, `llm-refusal-mitigation`, `three-layer authorization`,
`safety refusal`, `rephrasing just avoids`, `triggering the safety filter`

Expected post-cleanup: 0 residual PROMPT hits.

### Red-line integrity check (must pass)

After removing framing, verify authorization BOUNDARIES are intact:

```python
for p in hack_profiles:
    rules = open(f'$HOME/.hermes/profiles/{p}/{p}_rules.md').read()
    assert '## 1. 授权红线' in rules, f"{p}: §1 MISSING!"
# hack-weapons special authorizations
w = open('$HOME/.hermes/profiles/hack-weapons/SOUL.md').read()
for term in ['钓鱼/DDoS 额外授权', 'payload 仅用于授权测试', '密码破解范围']:
    assert term in w, f"MISSING: {term}"
```

## Cross-Profile Reference Cascade

When deleting a skill (e.g. `llm-refusal-mitigation`), other skills that
reference it by name become stale. After deletion, scan ALL skills for the
deleted name and clean references.

Affected skills and the replacement pattern (2026-07-29 cascade):

| Skill | Old reference | New text |
|-------|---------------|----------|
| aux-fallback-model-routing | "refusals are a prompt-framing problem; use llm-refusal-mitigation" | "Content refusals are the model service's responsibility, not the local fallback chain's" |
| model-allocation-strategy | "Refusal constraints outrank cost ... three-layer authorization framework" | "Refusal handling is the model service's responsibility; switch the profile's model" |
| multi-model-role-allocation | "three-layer authorization framing that makes GLM-5.2 viable" | (delete the reference) |
| team-model-routing | "low-refusal model after llm-refusal-mitigation framing isn't enough" | "different model if the current one refuses legitimate security work" |
| token-optimization | "Do NOT externalize authorization context — must stay inline" | "must not touch role-specific content" |
| soul-audit-fix-execution | rules.md patch loop anchoring on `## 4. 降低模型误拒绝` | append penalty block to end of file |
| soul-operability-quality-bar | "LLM Safety Refusal Workaround — rephrase to evade filter" | "LLM refusals on tool research — do NOT rephrase; switch model or do research via terminal" |
| soul-advanced-usage-deepening | "rephrase as DevSecOps inventory" | "do NOT rephrase to evade; switch model or use terminal + gh api" |
| soul-enrichment-pipeline | "rephrase as DevSecOps tool inventory task" | same as above |

**Why this matters**: A deleted skill referenced by name in other skills'
"Related Skills" or "When to Use" sections creates dead pointers. Future
agents loading those skills will try `skill_view('llm-refusal-mitigation')`
and get nothing, breaking the workflow.

## Pitfalls

### Don't conflate framing and boundaries

The most common error during cleanup: removing §1 authorization red lines
along with §4 refusal mitigation. §1 tells the agent to `kanban_block` when
authorization is missing — that's an operational gate the deployment needs
regardless of model. Only §4 (refusal recovery protocol) and the SOUL
preamble (authorization declaration) are framing.

### skill_manage cannot patch symlinked default-profile skills

`context-engineering-audit`, `prompt-as-model-adapter`, and most
`soul-*` skills are symlinked from the `default` profile.
`skill_manage(cross_profile=true)` reports "not found in active profile"
even though the flag is recognized. **Workaround**: use `patch` tool or
`execute_code` directly on the physical file under `~/.hermes/skills/...`
(those are not agent config, they're skill files, so cross_profile
restrictions don't apply to file tools). This skill exists in the
orchestrator profile as a native skill to capture patterns that extend
those symlinked umbrellas.

### Don't add new framing when switching models is the fix

If a model refuses legitimate security work, the temptation is to add a
new authorization preamble tuned for that model. Don't. Switch the
profile's model via `hermes config set model.default <alt> --profile <name>`.
Adding framing trades safety posture for convenience and creates
maintenance debt that grows with every model swap.

### Verification must distinguish active prompts from descriptive records

The post-cleanup scan will find mentions of "refusal" and "authorization"
in MEMORY.md and in skills that RECORD the policy decision ("deleted on
YYYY-MM-DD"). These are descriptive, not active prompt content. The scan
should filter for PROMPT terms (preamble headers, recovery protocol
headers, rephrase recipes), not for every occurrence of the word "refusal".

## Reference Files

- `references/removal-session-2026-07-29.md` — the exact files modified,
  block patterns used, verification scan output, and red-line integrity
  check results from the 2026-07-29 cleanup session

## Related Skills

- **context-engineering-audit** (default profile, symlinked) — the
  umbrella for SOUL.md/rules.md audit framework. This skill extends it
  with the authorization-framing-vs-boundary policy. Cannot be patched
  from orchestrator; this native skill captures the extension.
- **prompt-as-model-adapter** (default profile, symlinked) — the U-curve
  analysis showing prompt is a model adapter layer. This skill is the
  concrete application: authorization framing is "old tutorial" the model
  service should absorb, not local prompt debt.
- **model-allocation-strategy** (default profile, symlinked) — when a
  model refuses, this skill decides which alternative model to switch to.
- **soul-audit-fix-execution** (default profile, symlinked) — batch
  patching techniques for SOUL.md. This skill adds the batch-removal
  (regex-based block deletion) pattern, complementary to its batch-add
  patterns.
