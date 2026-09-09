---
name: soul-framework-propagation
description: "Use when a paradigm shift must reach all worker SOULs."
version: 1.0.0
platforms: [macos, linux]
metadata:
  hermes:
    tags: [soul-design, patch-techniques, framework-propagation, context-to-execution, cross-profile]
    related_skills: [agent-soul-patching, soul-md-privacy-section-patching, [已移除]-team-deployment]
---

# SOUL.md Framework Propagation

Insert a **shared framework** (paradigm, policy, methodology) into N agent
SOUL.md files where the section structure is identical but the domain
examples are customized per file. This closes the **context→execution gap**:
high-value insights recorded in a shared context file (child-profile,
policy doc, reflection log) that never reach the worker SOUL.md files
that actually drive behavior.

Distinct from `agent-soul-patching` (fix install commands / append tools)
and `soul-md-privacy-section-patching` (handle the two-copy privacy trap):
this skill handles **semantic framework content** that needs **per-role
domain adaptation**, not mechanical tool edits.

## When to Use

- A ⭐⭐⭐ reflection or paradigm shift lands in a context file
  (child-profile.md, policy doc) but the worker SOUL.md files don't carry it
- A new company/team policy must be embedded in every agent's behavior
- A methodology upgrade (e.g. activity-oriented → relationship-oriented)
  needs to reach all teachers/workers, not just the orchestrator
- User says "the teachers don't know about X" or "why are agents still
  doing the old thing after we changed the policy"

## The Context→Execution Gap

```
context layer (shared file)              execution layer (N SOUL.md files)
┌─────────────────────────┐             ┌───────────────────────────┐
│ child-profile.md        │             │ [已移除]/SOUL.md       │
│  └─ ⭐⭐⭐ 8.10 反思    │ ── GAP ──▶ │ [已移除]/SOUL.md          │
│     (四个C, 成长型思维) │             │ [已移除]/SOUL.md      │
│     ✅ recorded          │             │ ... (empty of new framework)│
└─────────────────────────┘             └───────────────────────────┘
```

Without propagation, the insight is "known" to the orchestrator/context
layer but invisible to the workers who generate recommendations. The
result: the team keeps doing the old behavior despite the parent/policy
having moved on.

## Core Pattern: Shared Skeleton + Per-File Domain Lens

The section **title, structure, and required elements are identical** across
all N files. Only the **domain-specific examples** differ.

### Standardized section elements (all files carry these)

1. **Framework definition** — the core model (e.g. four-C table:
   安全感/胜任感/掌控感/归属感 + 身份认知)
2. **Behavioral contrast tables** — ❌ old-pattern vs ✅ new-pattern
   (e.g. evaluative feedback vs process-descriptive feedback)
3. **Intervention scripts** — fixed-mindset trigger → growth-mindset
   response (e.g. "我太笨了" → "需要练习")
4. **Anchor case reference** — a real observed incident that exemplifies
   the framework (provenance-cited, not invented)
5. **Domain-specific scenarios table** — 场景 → new-pattern做法

### Per-file customization (differs)

For each of the N files, rewrite:
- The "在XX中的体现" column of the framework table → that role's domain
- The example sentences in contrast/intervention tables → domain-realistic
- The scenarios table → that role's actual workflow moments

Each file flags the failure mode most likely in ITS domain (e.g. STEM is
the fixed-mindset high-risk zone; arts is the "画得像=好" trap).

### One file gets enhanced treatment

The profile that **owns** the framework gets a longer section: source
quotes, theory mapping, and a 对外职责 block defining it as the
authoritative source the other N-1 profiles defer to.

## Patch Mechanics

### Anchor selection

Insert BEFORE a stable pedagogy/policy heading in each SOUL.md. Good
anchors (verified across [已移除] team):

- `## 安全红线（不可违反）` — most [已移除] SOUL.md files
- `## 安全红线` — [已移除] (no parens! use exact string or mis-match)
- `## 核心职责` — ops/product teams

The framework belongs with pedagogy/policy sections (above safety rules),
NOT appended at file end (which lands it after privacy boilerplate).

### cross_profile=true is mandatory

Target files under a different profile (e.g. `~/.hermes/profiles/[已移除]-*/`)
require `cross_profile=true` on the `patch` tool. **The `patch` tool
honors this flag correctly for agent SOUL.md files** — this is the
recommended path.

> ⚠️ Contrast: `skill_manage(cross_profile=true)` does NOT resolve
> default-profile skills (it refuses with "exists in profile 'default'").
> But `patch(cross_profile=true)` on agent SOUL.md files works cleanly.
> Use `patch` for SOUL.md edits across profiles, never `skill_manage`.

### Ground content in real source material

Before writing the framework section, read the source insight file
(e.g. child-profile.md ⭐⭐⭐ section) and quote/cite it. Never fabricate
framework details — if the source says "四个C", use exactly that; if it
names a specific incident (投壶事件), reference it with date and provenance.

## Batch Propagation for Large Fleets (N > ~10)

Per-file `patch(cross_profile=true)` calls scale to about ten files. Beyond
that, write ONE batch Python script and run it:

1. **Anchor census first** — grep every profile's SOUL.md for each candidate
   anchor heading and record which one it has. The census output drives the
   whole patch: profiles legitimately differ in which section can host the
   framework (shared-rules vs collaboration vs tools vs none), so the script
   needs a per-profile anchor dict, not a single anchor.
2. **Match anchors by exact stripped line** (`line.strip() == anchor`), never
   substring — real fleets carry parenthetical-suffix variants of the same
   heading, and substring matching inserts under the wrong heading.
3. Insert with two primitives: insert-after-section (find the anchor line,
   walk forward to the next `## ` heading, insert before it) and
   insert-before-section. Put a unique marker keyword in every inserted block.
4. **Verify marker count == fleet size** across all SOUL.md files. Profiles
   missed by the first pass are almost always anchor suffix variants the
   census missed — grep their actual heading text, add to the variant dict,
   re-run for just those profiles, re-verify, then spot-check 3 files' inserted
   content.

Pitfalls:

- Do NOT inline the batch Python in a bash heredoc when the inserted text
  contains full-width (CJK) punctuation or nested quotes — shell escaping
  corrupts the string and the script dies with SyntaxError mid-fleet. Write
  the script to a file with a file-writing tool, then execute it.
- The census and the patch script must share one anchor list. A first pass
  handling only the dominant anchor variant silently skips minority profiles;
  the count verification is the only thing that catches this, so never skip
  step 4.

## Verification

After patching all N files, grep each for every required element:

```bash
for p in <profile-1> <profile-2> ... <profile-N>; do
  f=~/.hermes/profiles/$p/SOUL.md
  echo "$p: section=$(grep -c '<section-title>' $f) \
        elem1=$(grep -c '<keyword1>' $f) \
        elem2=$(grep -c '<keyword2>' $f) \
        example=$(grep -c '<example-marker>' $f)"
done
```

All N should show section=1, example=1, non-zero for framework keywords.
The framework-owner profile should have the highest counts.

## Generalization

This pattern is not bound to one specific framework. Any time a major
policy/methodology shift is recorded at the context layer, check whether
the N worker SOUL.md files already carry it. If not, propagate using this
pattern. Title each section with specific provenance (e.g. "8.10范式转移",
"X.X政策升级") so it stays traceable and doesn't read as generic boilerplate.

## Pitfalls

- **Heading-text variants across profiles**: `## 安全红线（不可违反）` vs
  `## 安全红线`. Always grep the exact heading in each target file before
  constructing old_string, or the patch matches the wrong location.
- **Symlinked skills can't be patched via skill_manage**: skills that
  resolve to profile 'default' refuse skill_manage writes even with
  cross_profile=true. Use `patch` on the SOUL.md files directly instead.
- **Fabricating framework details**: if you don't read the source insight
  file first, you'll invent plausible-but-wrong specifics. Always ground
  in the real child-profile/policy-doc text.
- **Forgetting the framework-owner enhancement**: one profile should get
  the authoritative longer version; the others defer to it. If all N get
  identical length, you've missed the ownership signal.

## Reference

- `references/paradigm-shift-soul-propagation.md` — full worked example:
  the 8.10 [已移除] propagation (6 teacher SOUL.md files, four-C framework),
  with per-subject section templates and the complete patch recipe.

## Related Skills

- **agent-soul-patching** (default profile) — batch tool-install fixes &
  tool-section appends; the mechanical counterpart to this semantic skill
- **soul-md-privacy-section-patching** (orchestrator) — the two-copy
  privacy-section trap; read before appending near file ends
- **[已移除]-team-deployment** (default profile) — initial [已移除] team setup;
  this skill covers the ongoing framework-propagation phase that follows
