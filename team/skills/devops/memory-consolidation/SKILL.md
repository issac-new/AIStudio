---
name: memory-consolidation
description: "Systematically consolidate and prune Hermes Agent persistent memory (MEMORY.md + USER.md) when it fills up, goes stale after major config changes, or before migration. Covers the MEMORY↔Hindsight boundary (what stays in every-turn injection vs what delegates to vector recall), cross-file deduplication, batch operations, and character-budget targeting."
version: 1.1.0
author: Hermes Agent
license: MIT
metadata:
  hermes:
    tags: [memory, consolidation, maintenance, hindsight, hermes]
    related_skills: [hermes-agent, agent-profile-lifecycle, hermes-offline-migration]
---

# Memory Consolidation

## When to consolidate

- **MEMORY.md or USER.md exceeds ~80%** of its character budget (MEMORY: 2200, USER: 1375). The `memory` tool reports current/limit on every write.
- **After major configuration changes** — model switches, team restructuring, provider changes — that render old entries stale or redundant.
- **Before migration/packaging** — clean memory reduces cross-machine noise and avoids shipping stale facts.
- **When entries reference completed TODOs or resolved issues** — these are task progress, not durable facts, and should be pruned per the memory tool's own SKIP rules.
- **Periodically (monthly)** — entropy accumulates even without major changes.

## The MEMORY ↔ Hindsight boundary

This is the core decision: **what stays in MEMORY vs what delegates to Hindsight**.

| Keep in MEMORY (every-turn injection) | Delegate to Hindsight (on-demand recall) |
|----------------------------------------|------------------------------------------|
| High-frequency operational pits (kanban toolset quirk, Matrix tenant format) | Model pricing details, token quotas, monthly cost analysis |
| Routing rules (board routing, security words) | Deployment timelines, decision rationale |
| Credential status (which keys failed, which providers need `models:` list) | Fallback deployment step-by-step logs |
| Tool path quirks (PATH, cross_profile workaround) | Skill欠账 progress tracking |
| Active failure patterns (refusal mitigation layers) | Completed migration checklists |
| User workflow preferences (cc switch, TUI routing) | Historical architecture comparisons |

**Principle**: If a fact would change how you act on the *next* user message, it belongs in MEMORY. If it's context you'd only need when asked "why did we do X" or "what was the analysis behind Y", it belongs in Hindsight.

Hindsight has unlimited capacity and auto-injects relevant memories via `hindsight_recall`. MEMORY has ~2200 chars and is force-injected every turn. Wasting MEMORY on historical detail crowds out operational pits that prevent repeated mistakes.

## Consolidation workflow

### Step 1: Read current state

```
read_file("~/.hermes/profiles/orchestrator/memories/MEMORY.md")
read_file("~/.hermes/profiles/orchestrator/memories/USER.md")
```

Note the character counts and entry list. The `memory` tool's last write response also reports `usage: X% — N/limit chars`.

### Step 2: Recall from Hindsight to identify safe-to-delete detail

Before deleting any entry, verify the information exists in Hindsight or is truly stale:

```
hindsight_recall(query="model pricing k3 glm-5.2 v4-flash fallback chain configuration")
hindsight_recall(query="skill欠账 TODO aux-fallback multi-model-role-allocation")
hindsight_recall(query="15 profiles team structure swarm hack board")
```

If Hindsight has the detail → safe to remove from MEMORY (it can be recalled on demand).
If Hindsight does NOT have it → either retain in MEMORY, or `hindsight_retain` it first, then remove from MEMORY.

When archiving an entry you are about to compress or remove, retain the FULL original text (not a summary — the summary defeats the purpose of archiving) with a standard payload shape so recall works months later:

- `tags`: `["memory:archived-from-MEMORY", "<topic>"]`
- `metadata`: `{"source": "MEMORY.md <entry topic>", "archived": "<date>"}`
- `context`: 适用条件（什么场景需要这份细节）+ 时间锚

If the hindsight tools are not in the session toolset, the daemon takes raw HTTP (verified on this machine): `POST http://127.0.0.1:8888/v1/default/banks/<bank>/memories` with `{"items": [...], "async": false}`; recall via `POST .../memories/recall` with `{"query": ..., "max_tokens": ...}`. Bank name is per-machine/per-profile — read it from hindsight config, don't guess.

### Step 3: Categorize each entry

For each existing entry, assign one of:

| Category | Action |
|----------|--------|
| **Operational pit** (high-frequency, changes next-turn behavior) | Keep, possibly compress |
| **Stale TODO** (references completed work, resolved issues) | Remove |
| **Historical detail** (pricing, timelines, analysis — available in Hindsight) | Remove |
| **Duplicated** (same fact in both MEMORY.md and USER.md) | Remove from the less appropriate file |
| **User profile fact** (who the user is, their setup) | Keep in USER.md, remove from MEMORY.md |
| **Still-relevant but verbose** | Compress to essential facts |

### Step 4: Batch-apply via operations array

Use a SINGLE `memory` call with an `operations` array. This is atomic — the char limit is checked only on the final result, so you can remove entries to free space AND add new ones together:

```
memory(target="memory", operations=[
  {action: "replace", old_text: "long verbose entry...", content: "compressed entry"},
  {action: "remove", old_text: "stale TODO entry"},
  {action: "remove", old_text: "duplicated entry that's in USER.md"},
  {action: "add", content: "new operational pit discovered this session"}
])
```

**Critical**: The `old_text` field must be a unique substring of the entry you want to replace/remove. Include enough context to be unique.

### Step 5: Verify on disk

After the memory tool confirms, read the actual files to verify the final state:

```
read_file("~/.hermes/profiles/orchestrator/memories/MEMORY.md")
read_file("~/.hermes/profiles/orchestrator/memories/USER.md")
```

Count entries and compare against the intended count — more entries than intended means a separator-collision fragment (see Pitfalls). Characters: target ~50% utilization to leave room for future entries. Finally recall-verify every Hindsight archive a deletion relied on — deletion is only safe once recall returns the content.

## Cross-file deduplication

The same fact often ends up in both MEMORY.md and USER.md. Rules:

| Fact type | Correct file |
|------------|--------------|
| Team structure (15 profiles, board isolation) | USER.md (it's who the user is) |
| Routing rules (board routing, security words) | MEMORY.md (operational pit) |
| Model assignment (k3→hack, glm5.2→swarm) | MEMORY.md (affects every-turn behavior) |
| User tool preferences (cc switch, executable commands) | USER.md (user preference) |
| Memory vs Hindsight principle | USER.md (meta-fact about the system) |
| Fact fully carried by the profile's SOUL.md (identity, doctrine, routing rules the SOUL restates) | SOUL.md only — remove the MEMORY.md copy |

When deduplicating, keep the entry in the more appropriate file and remove from the other. SOUL.md is a dedup target too: it is injected every turn just like MEMORY, so a MEMORY copy of identity/doctrine text the SOUL already carries adds zero information and burns budget.

## Character budget targeting

- **MEMORY.md**: 2200 char limit. Target 50-60% utilization (1100-1320 chars) to leave room for ~3-5 new entries.
- **USER.md**: 1375 char limit. Target 60-70% utilization (825-960 chars).
- If an add is rejected with "current entries shown", reissue as ONE batch that removes/shortens enough stale entries AND adds the new one together.

## Pitfalls

- **条目内容禁含 § 字符**：MEMORY.md 用 § 作条目分隔符，内容里的章节引用符（`§7.3`）或带前缀的路径段都会撞分隔符把一条切成多条碎片（每片仍计字数且语义断裂）。章节引用写「7.3节」，路径写「同目录X.yaml」这类短形。污染入口不止一个，别枚举入口——防线是写后机械校验。
- **写后必做 split-check**：批量写入后 read 磁盘文件按 § split，条目数必须等于预期条数；条目数变多=分隔符撞车碎片化，先合并复原再收工。memory 工具的 success 回执抓不住碎片。
- **Deleting without Hindsight verification**: If you remove an entry and Hindsight doesn't have the detail, it's gone. Always `hindsight_recall` before removing anything non-trivial.
- **Keeping too much detail**: Model pricing, token quotas, deployment step-by-step, and cost analysis are all available in Hindsight. They waste MEMORY's every-turn injection budget.
- **Keeping stale TODOs**: "Skill欠账" (skill debt) entries that reference completed work are task progress, not durable facts. Remove them.
- **Same fact in both files**: Causes redundant injection every turn. Deduplicate.
- **Verbose entries**: Each entry should be a compressed fact, not a paragraph. "k3→hack6profile(多模态独占)" is better than "K3套餐(Allegro,560¥/月,~23.75亿token,57分,5h窗口限量,原生多模态)→hack团队6profile安全执行层(多模态白送,智能最高且低拒绝是安全工作硬约束,hack负载突发性契合限量配额)".
- **Imperative phrasing in memory**: Write declarative facts ("User prefers concise responses"), not instructions ("Always respond concisely"). Imperatives get re-read as directives in later sessions.
- **Not using the operations array**: Individual `memory(action="add")` calls that get rejected due to full budget, then manually removing entries, then re-adding — all separate calls. Use the `operations` array to do it atomically.

## Verification

After consolidation, verify:
1. Every remaining MEMORY.md entry is a high-frequency operational fact that changes next-turn behavior
2. Every remaining USER.md entry describes who the user is or their stable preferences
3. No entry is duplicated across both files
4. Character utilization is 50-70% in both files
5. No removed detail was lost — it's either in Hindsight or was genuinely stale