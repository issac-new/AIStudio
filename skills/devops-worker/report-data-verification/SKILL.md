---
name: report-data-verification
description: >-
  Verify every quantitative claim in a report before presenting it to the
  user. Prevents the recurring error of writing numbers from memory or
  inference, then having the user catch fabricated/stale data. Use when
  writing any report, design doc, or summary that contains specific numbers
  (tool counts, model names, line counts, config values, file sizes).
  Especially critical for reports shown to third parties (boss, client).
version: 1.0.0
platforms: [macos, linux]
metadata:
  hermes:
    tags: [quality, verification, reports, cognition, anti-fabrication]
    related_skills: [cognition-self-check, prompt-rule-enforcement]
---

# Report Data Verification

Every number in a report must be traceable to a tool command run in the
**same session**. Memory is not a valid source. Inference is not a valid
source. "I remember reading X" is not a valid source.

## When to Use

- Writing a report, design doc, or summary for the user or a third party
- The report contains specific numbers (counts, sizes, model names, config values)
- The report will be shown to someone else (boss, client, team)
- User previously caught you presenting stale/wrong data
- After loading cognition-self-check but still writing reports from memory

## The Problem

The agent writes reports from memory because it's faster than running
verification tools. But memory contains stale facts:

- Model assignments change over time (K3 → GLM-5.2)
- Fallback chains get updated (4-level → 3-level)
- File sizes and line counts drift as files are edited
- Tool counts change as SOUL.md files are patched

When the user asks "这些数据是从哪来的" (where did this data come from?),
the answer "from memory" is not acceptable. The user's trust depends on
every number being verifiable.

## Solution: Pre-Output Verification Pass

### Step 1: Identify all quantitative claims

Before writing the report, list every number, name, and config value
that will appear:

```
Claims to verify:
- "6 agents" → need: ls profiles
- "889 lines SOUL.md" → need: wc -l
- "GLM-5.2 model" → need: grep config.yaml
- "60+ tools" → need: grep + sort -u + wc -l
- "Docker 444MB" → need: docker images
```

### Step 2: Run verification commands

Run ALL verification commands BEFORE writing the report, not after:

```bash
# Line counts
wc -l ~/.hermes/profiles/hack-*/SOUL.md

# Tool counts (unique names)
grep -ohE '\b(nmap|sqlmap|metasploit|...)\b' ~/.hermes/profiles/hack-*/SOUL.md | sort -u | wc -l

# Model/provider
grep -E 'default:|provider:' ~/.hermes/profiles/hack-recon/config.yaml

# Fallback chains
grep -A 5 'fallback_providers' ~/.hermes/profiles/hack-recon/config.yaml

# Docker images
docker images hermes-terminal-sandbox

# File sizes
ls -la /path/to/file
```

### Step 3: Write the report with verified data

Only NOW write the report. Every number comes from a command you just ran.

### Step 4: Add a "verified by" column (for formal reports)

For reports shown to third parties, add a verification column:

```markdown
| Metric | Value | Verified by |
|--------|-------|-------------|
| Agent count | 6 | `ls ~/.hermes/profiles/hack-*/` |
| SOUL.md lines | 889 | `wc -l` |
| Model | GLM-5.2 | `config.yaml` |
| Tools | 52 | `grep` extraction |
| Docker | 444MB/99.5MB | `docker images` |
```

## Case Study: Hack Team Design Report (2026-07-27)

### What happened

The agent wrote a hack team introduction report for the user's boss.
Numbers came from memory, not tools:

| Claim | Reality | Memory was wrong because |
|-------|---------|--------------------------|
| "60+ 安全工具" | 52 tools | Rounded up from stale memory |
| "Kimi K3" | GLM-5.2 | Model was switched weeks earlier |
| "四级容灾链" | Three-level | Fallback was simplified |
| "全 8 类 hackingtool" | 6 categories | Overcounted |
| "444MB Docker" | 444MB disk / 99.5MB compressed | Partially correct but imprecise |

User reaction: "这些数据是从哪来的 我说过了 不要胡编乱造！！"

### Root cause

The agent knew the verification commands (wc, grep, config.yaml reads)
but didn't run them BEFORE writing. It ran them only AFTER the user
challenged the data — reactive verification instead of proactive.

### Fix applied

1. Rewrote the report with a verification table
2. Every number now has a "verified by" column showing the tool command
3. Updated the technical specs section to include actual tool output

## High-Risk Report Types

These report types are most prone to memory-based fabrication:

| Report type | Common stale data | Verification command |
|-------------|-------------------|---------------------|
| Team capability report | Tool counts, model names | `grep` + `config.yaml` |
| System status report | Profile counts, board tasks | `ls` + `sqlite3 kanban.db` |
| Migration report | File sizes, config values | `du` + `cat config.yaml` |
| Audit report | Line counts, tool coverage | `wc -l` + `grep` |
| Performance report | Token counts, response times | `hermes insights` + logs |

## Relationship to cognition-self-check

This skill is a **specialized enforcement** of cognition-self-check
item #1 (事实vs虚构), applied specifically to report writing:

| cognition-self-check | report-data-verification |
|----------------------|--------------------------|
| General "is this from a tool call?" | Specific to report numbers |
| 5-item checklist for all outputs | Pre-report verification pass |
| Catches fabrication broadly | Catches stale memory in reports |

The broader checklist fires on all outputs. This skill fires specifically
when the output is a **report with numbers** — the highest-risk output
type because:
1. Reports are shown to others (boss, client)
2. Numbers are specific and checkable
3. Memory is most likely to be stale for config values
4. The cost of being wrong is reputational damage

## Pitfalls

### Don't verify only the numbers you're unsure about

Verify ALL numbers, even ones you're "sure" about. The hack team report
had "K3" which the agent was confident about — but the model had been
switched to GLM-5.2 weeks earlier. Confidence is not verification.

### Don't use memory as a "first draft" then verify

The temptation is to write the report from memory, then verify and fix.
This doesn't work because:
1. You'll miss claims you didn't realize were quantitative
2. You'll rationalize ("close enough") instead of fixing
3. The verification pass becomes selective, not systematic

**Always verify first, then write.** The order matters.

### Don't forget to verify qualitative claims too

"Full 8 categories" is a quantitative claim disguised as qualitative.
"All profiles" is a quantitative claim. "Complete coverage" is too.
If a claim can be checked with a tool, verify it.

## Verification Command Reference

Common verification commands for report data:

```bash
# Counts
ls -d ~/.hermes/profiles/hack-*/ | wc -l           # profile count
wc -l ~/.hermes/profiles/hack-*/SOUL.md             # SOUL line counts
grep -c '##' ~/.hermes/profiles/hack-*/SOUL.md      # section counts

# Tool extraction (unique tool names)
grep -ohE '\b(nmap|sqlmap|metasploit|...)\b' \
    ~/.hermes/profiles/hack-*/SOUL.md | sort -u | wc -l

# Config values
grep -E 'default:|provider:' ~/.hermes/profiles/hack-recon/config.yaml
grep -A 5 'fallback_providers' ~/.hermes/profiles/hack-recon/config.yaml
grep -A 10 'toolsets:' ~/.hermes/profiles/hack-recon/config.yaml

# Docker
docker images hermes-terminal-sandbox

# Kanban tasks
sqlite3 ~/.hermes/kanban.db "SELECT COUNT(*) FROM tasks;"
sqlite3 ~/.hermes/kanban/boards/swarm/kanban.db "SELECT COUNT(*) FROM tasks;"

# File sizes
du -sh ~/hermes-docker-sandbox/workspace/[已移除]/
```

## Related Skills

- **cognition-self-check** — the general 5-item checklist (item #1 is
  the broader version of this skill's rule)
- **prompt-rule-enforcement** — ensures meta-rules are executed
- **cognition-lattice** — cognitive frameworks for bias detection
