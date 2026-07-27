---
name: token-optimization-v2
description: >-
  Round 2 token optimization patterns: re-optimization after SOUL.md
  enrichment, compression sync across all profile configs, and the
  enrichment→optimize cycle. Complements the base token-optimization
  skill (default profile) with patterns discovered in the second
  optimization round. Use when profiles have grown again after an
  enrichment session and need re-trimming.
version: 1.0.0
platforms: [macos, linux]
metadata:
  hermes:
    tags: [token-optimization, cost, progressive-disclosure, re-optimization]
    related_skills: [token-optimization, soul-enrichment-pipeline, hermes-profile-config]
---

# Token Optimization Round 2: Re-Optimization After Enrichment

After a bulk SOUL.md enrichment session (see `soul-enrichment-pipeline`,
`collaboration-team-soul-enrichment`, `multi-team-soul-enrichment`),
profiles that were previously optimized will have grown again. The
"具体操作命令手册" sections that enrichment adds are exactly what
progressive disclosure should externalize.

## When to Use

- You just ran a SOUL.md enrichment session across multiple profiles.
- Profiles that were previously trimmed via progressive disclosure
  have grown back to 15K+ chars.
- Compression config in profile config.yaml files still has old
  defaults (threshold=0.5, target_ratio=0.2).

## Detecting Re-Bloat

```bash
# Find all profiles with heavy tool-command sections
for f in ~/.hermes/profiles/*/SOUL.md; do
  profile=$(basename $(dirname "$f"))
  cmd_line=$(grep -n "具体操作命令手册\|常用工具命令\|事故响应常用命令\|Burp Suite" "$f" | head -1 | cut -d: -f1)
  if [ -n "$cmd_line" ]; then
    next=$(awk -v s="$cmd_line" 'NR>s && /^## / {print NR; exit}' "$f")
    [ -z "$next" ] && next=$(wc -l < "$f")
    size=$(sed -n "${cmd_line},$((next-1))p" "$f" | wc -c)
    echo "$profile: L$cmd_line-L$next ($size chars)"
  fi
done
```

## Sections to Externalize Across ALL Profile Types

The first optimization round only covered hack profiles. The second
round showed that ALL profile types accumulate externalizable sections
after enrichment:

| Section header pattern | Found in | Typical size |
|------------------------|----------|-------------|
| `## 具体操作命令手册` | product-*, ops-*, worker-*, project-manager, architect | 3-8K |
| `## 常用工具命令` | ops-devops, ops-sre | 6-8K |
| `## 事故响应常用命令` | ops-incident-commander | 6K |
| `## Burp Suite Headless 操作指南` | hack-exploit | 3.7K |
| `## 验收` | worker-coder (unique — not just "commands") | 5.4K |
| `## 不要做的事` | worker-coder (unique — anti-patterns, not commands) | 2.2K |

## How to Split (Same Script, Expanded Scope)

Use the same `scripts/split_soul_sections.py` from the base
`token-optimization` skill — just expand the PROFILES list and
EXTERNALIZE map to cover all profile types, not just hack.

## Compression Sync: Profile Config Does NOT Inherit Main Config

### Pitfall

Profile config.yaml files have their OWN `compression:` section that
does NOT inherit from the main `~/.hermes/config.yaml`. After changing
the main config's compression settings, you must sync each profile
individually.

### The exact string match

The `threshold` and `target_ratio` lines have 2-space indentation.
The exact match string for `str.replace()` is:

```python
old = "  threshold: 0.5\n  target_ratio: 0.2"
new = "  threshold: 0.35\n  target_ratio: 0.15"
```

Do NOT use regex or fuzzy matching — YAML whitespace is significant.
The `patch` tool's fuzzy matching may fail because it can't distinguish
between the compression section's `threshold:` and other thresholds
elsewhere in the config. Write a Python script with `str.replace()`.

### Verification

```bash
# Should output 23 (one per profile)
grep -r 'threshold:' ~/.hermes/profiles/*/config.yaml | grep -c '0.35'
grep -r 'target_ratio:' ~/.hermes/profiles/*/config.yaml | grep -c '0.15'
```

## Measured Impact (Two Rounds Combined)

| Metric | Original | Round 1 After | Round 2 After | Cumulative |
|--------|----------|--------------|--------------|------------|
| 23 profile SOUL.md total | 459K | 305K | **222K** | -52% |
| References (on-demand) | 0 | 239K | **790K** | all externalized |
| MCP tool schemas (22 prof) | ~37K | 0 | 0 | -100% |
| tool_output.max_bytes | 50K | 20K | 20K | -60% |
| tool_output.max_lines | 2000 | 500 | 500 | -75% |
| compression.threshold (24 cfg) | 0.5 | 0.35 (main only) | 0.35 (all 23) | synced |
| compression.target_ratio (24 cfg) | 0.2 | 0.15 (main only) | 0.15 (all 23) | synced |

**Total per-turn context saving: ~237K chars ≈ 59K tokens/turn**

## Pitfalls

### Enrichment → Re-bloat Cycle

SOUL.md enrichment skills (`soul-enrichment-pipeline`,
`collaboration-team-soul-enrichment`, `multi-team-soul-enrichment`,
`soul-enrichment-command-manual`) add large "具体操作命令手册" sections
to SOUL.md files. After any enrichment session, re-run the diagnostic
scan and externalize the new sections. This is a recurring cycle:
**enrich → optimize → enrich → optimize**. Budget for the optimization
step whenever planning an enrichment session.

### skill_manage can't patch default-owned skills

Skills symlinked from the `default` profile into `orchestrator` cannot
be patched via `skill_manage(cross_profile=true)`. The tool reports
"Skill not found in active profile" even though `skill_view` can read
it. Workaround: use `skill_manage(action='edit')` with the full
rewritten content and `cross_profile=True`, or use `write_file` with
`cross_profile=True` to write directly to the SKILL.md file path.

### Python script quoting in terminal

Bash quoting mangles Python with parentheses and quotes. Always write
scripts to `/tmp/script.py` via `write_file`, then run
`python3 /tmp/script.py`. Never use `terminal` with inline Python
heredocs or `-c` flags for complex scripts.

## Related Skills

- **token-optimization** — (default profile) Base skill covering the
  three principles, progressive disclosure for hack profiles, config
  tuning, MCP pruning, and skills category precision. This skill
  (token-optimization-v2) extends it with Round 2 patterns.
- **soul-enrichment-pipeline** — (default profile) The enrichment
  pipeline that creates the bloat this skill trims. Enrichment and
  optimization form a cycle.
- **hermes-profile-config** — (default profile) Multi-profile config
  management patterns.
