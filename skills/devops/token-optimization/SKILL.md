---
name: token-optimization
description: >-
  Optimize token consumption across a multi-profile Hermes Agent deployment.
  Covers progressive disclosure (SOUL.md/rules.md section externalization),
  config tuning (tool_output limits, compression aggressiveness), MCP server
  pruning, skills category precision, and delegate_task for large-data
  isolation. Use when the user wants to reduce per-turn context cost, trim
  bloated SOUL.md files, or apply the "three principles" (see only what's
  needed, exclude the irrelevant, avoid repetition).
version: 1.0.0
platforms: [macos, linux]
metadata:
  hermes:
    tags: [token-optimization, cost, progressive-disclosure, multi-agent, soul-design]
    related_skills: [agent-soul-patching, hermes-profile-config, hermes-worker-lifecycle]
---

# Token Optimization for Multi-Profile Hermes Deployments

Reduce per-turn context cost across a fleet of Hermes agent profiles by
applying three principles: **① let the AI see only what it currently
needs**, **② exclude irrelevant context**, **③ avoid repeating context
across turns**.

## When to Use

- Per-turn token cost is high and you need to find where the budget goes.
- SOUL.md or rules files have grown to 30K+ chars and most content is
  only needed at execution time, not planning/routing time.
- Worker profiles carry MCP server schemas they never invoke.
- Config defaults (tool_output limits, compression thresholds) are too
  generous for a cost-sensitive deployment.
- After a bulk SOUL.md enrichment session (see `agent-soul-patching`)
  that inflated files beyond their skeleton purpose.

## Diagnosis: Where Token Budget Goes

Before optimizing, measure the six consumption sources:

| Source | How to measure |
|--------|----------------|
| SOUL.md (per profile) | `wc -c ~/.hermes/profiles/*/SOUL.md` |
| *_rules.md (per profile) | `wc -c ~/.hermes/profiles/*/*_rules.md` |
| MCP tool schemas | Count `mcp_servers` entries per profile config × ~15-20 tools each |
| Skills descriptions | `find ~/.hermes/skills -name "SKILL.md" \| wc -l` × ~200 chars description |
| Tool output (per call) | `grep tool_output ~/.hermes/config.yaml` — max_bytes/max_lines |
| Conversation history | `compression.threshold` controls when compression triggers |

Run this one-liner for a quick audit:

```bash
echo "=== SOUL.md sizes ==="
find ~/.hermes/profiles -name "SOUL.md" -exec wc -c {} + | sort -rn | head -25
echo "=== Rules sizes ==="
find ~/.hermes/profiles -name "*_rules.md" -exec wc -c {} + | sort -rn
echo "=== MCP servers per profile ==="
for f in ~/.hermes/profiles/*/config.yaml; do
  p=$(basename $(dirname "$f"))
  c=$(grep -c "hermes-studio-" "$f" 2>/dev/null)
  [ "$c" -gt 0 ] && echo "$p: $c MCP entries"
done
echo "=== Config limits ==="
grep -E "max_bytes|max_lines|threshold|target_ratio|file_read_max" ~/.hermes/config.yaml
```

## Optimization 1: Progressive Disclosure (SOUL.md + Rules)

**Principle ①**: Not all content needs to be in context on every turn.
Move heavy reference material to `references/` subdirectories; load
on demand via `read_file`.

### What to externalize vs. what to keep

| KEEP in SOUL.md (skeleton) | EXTERNALIZE to `references/` |
|---|---|
| Role identity + authorization context | Detailed tool command manuals |
| Core capability domains (bullet list) | Tool reference tables |
| Standard workflow cycle (numbered steps) | Supplementary tool examples |
| Red lines / safety rules | Advanced usage patterns |
| Output delivery format (JSON schema) | Keyword classification tables |
| Privacy rules | Implementation examples |

### How to split

Use the reusable script `scripts/split_soul_sections.py`. It:

1. Reads a SOUL.md (or rules.md) file
2. Splits by `## ` (level-2 headers) into sections
3. For sections matching an externalize list, writes them to
   `references/<name>.md` in the same profile directory
4. Replaces the section in the original file with a pointer:
   `> 📖 **Section Name** 已外置到 \`references/<name>.md\` — 执行相关操作时用 \`read_file\` 按需加载。`

```bash
# Example: split all 6 hack profile SOUL.md files
python3 /tmp/split_soul_sections.py  # reads PROFILES list from script

# Example: split orchestrator_rules.md
python3 /tmp/split_orchestrator_rules.py  # reads EXTERNALIZE list from script
```

See `scripts/split_soul_sections.py` for the reusable implementation.

### Critical: Token optimization must not touch role-specific content

For hack profiles, the tool catalogs and methodology sections at the top
of SOUL.md define the profile's role. Externalize reference material, but
do not strip role-defining content. Token optimization targets repetitive
boilerplate and reference blocks, not the role description itself.

### Measured impact

| Target | Before | After | Reduction |
|--------|--------|-------|-----------|
| 6 hack SOUL.md files | 273K chars | 55K chars | -79% |
| orchestrator_rules.md | 35K chars | 19K chars | -46% |
| **Total per-turn saving** | | | **~271K chars ≈ 68K tokens** |

## Optimization 2: Config Tuning (Main config.yaml)

**Principle ②**: Reduce the volume of irrelevant context that enters
the conversation through tool output and late compression.

### tool_output limits

```yaml
# Before (generous defaults)
tool_output:
  max_bytes: 50000
  max_lines: 2000
file_read_max_chars: 100000

# After (cost-conscious)
tool_output:
  max_bytes: 20000    # -60%
  max_lines: 500       # -75%
file_read_max_chars: 50000  # -50%
```

### Compression aggressiveness

```yaml
# Before
compression:
  threshold: 0.5       # 50% of context before compression
  target_ratio: 0.2    # compress to 20%
  protect_last_n: 20

# After
compression:
  threshold: 0.35      # 35% — triggers earlier
  target_ratio: 0.15   # compress to 15% — more aggressive
  protect_last_n: 15    # protect fewer recent messages
```

These apply to the main `~/.hermes/config.yaml`. Worker profiles
have their own `compression:` section — sync the values there too
if needed (patch each profile's config.yaml).

### When changes take effect

- Main config: requires gateway restart or new TUI session
- Profile config: requires worker re-dispatch (next kanban task)
- Compression/tool_output: read at session start, not mid-conversation

## Optimization 3: MCP Server Pruning

**Principle ②**: Worker profiles don't need Web UI MCP tools.

Each `hermes-studio-*` MCP server injects 15-20 tool schemas into
every LLM call's context. With 3 servers per profile × 22 profiles,
that's ~37K chars of tool schemas per turn that workers never use.

### Which profiles to strip

Keep MCP servers ONLY on:
- `orchestrator` — needs Web UI / session / device management

Strip from ALL other profiles:
- workers (coder, deployer, researcher, reviewer, tester)
- hack agents (recon, exploit, forensics, auditor, c2, weapons)
- swarm specialists (architect, PM, RA)
- product team (PM, researcher, feedback, prioritizer)
- ops team (SRE, devops, IR, exec-summary)

### How to strip

Write a Python script to `/tmp/` that:
1. Reads each profile's `config.yaml`
2. Finds the `mcp_servers:` top-level key
3. Finds the next top-level key after it
4. Removes all lines between (inclusive of `mcp_servers:`, exclusive of
   the next key)
5. Writes back

```bash
python3 /tmp/strip_mcp_servers.py
```

See `scripts/strip_mcp_servers.py` for the reusable implementation.

### Impact

22 profiles × ~1,700 chars each = ~37,400 chars (~9.4K tokens/turn)
of tool schema removed. Workers receive tasks via Kanban dispatch and
don't need direct MCP tool access.

## Optimization 4: Skills Category Precision

**Principle ②**: Don't load skill descriptions for categories a profile
will never use.

Check each profile's `skills_enabled_by_category` in config.yaml:

```bash
for p in ~/.hermes/profiles/*/config.yaml; do
  profile=$(basename $(dirname "$p"))
  cats=$(sed -n '/skills_enabled_by_category:/,/^[^ ]/p' "$p" | grep "^  - " | sed 's/^  - //' | tr '\n' ', ')
  echo "$profile: $cats"
done
```

### Common mismatches

| Profile | Remove | Reason |
|---------|--------|--------|
| worker-reviewer | cybersecurity | It's a code reviewer, not a security auditor |
| architect | creative | Architects don't need art/design tools |
| requirement-analyst | creative | Same — analysis, not creation |
| swarm workers | red-teaming | Only hack profiles need offensive tools |
| hack profiles | mlops, creative | Hack agents don't train models or create art |

### How to fix

Use `patch(mode='replace')` on each profile's config.yaml to remove
the irrelevant category from the `skills_enabled_by_category` list.

## Optimization 5: delegate_task for Large-Data Isolation

**Principle ③**: When the main agent needs to read large files or search
large codebases, use `delegate_task` to isolate the raw data in a
sub-agent's context. Only the structured summary re-enters the main
context.

### When to use

- Reading a 500+ line code file → sub-agent reads + returns summary
- Searching across many files → sub-agent searches + returns hit list
- Web page content extraction → sub-agent fetches + returns structured data
- Any operation where the raw output is large but the conclusion is small

### Pattern

```
delegate_task(
  goal="Read the file at <path> and return a structured summary: key
       functions, their signatures, and any security-relevant patterns.",
  context="File path: <path>. Focus on authentication and data flow."
)
```

The sub-agent's full tool output stays in its own context window; only
the summary (a few hundred chars) enters the parent's conversation.

## Optimization 6: Stable Prefix Design

**Principle ③**: If the system prompt prefix is stable across turns,
the LLM provider can reuse KV cache (at ~10% of normal price). Design
SOUL.md and rules.md so stable content comes first, dynamic content
comes last.

### Rules

1. **Static instructions at the top**: role identity, authorization,
   core workflow — these don't change between turns.
2. **Dynamic routing logic at the bottom**: board routing keywords,
   tenant extraction rules — these may be skipped via progressive
   disclosure.
3. **Avoid interleaving**: don't put a stable paragraph, then a dynamic
   table, then another stable paragraph. Group stable content together.

### What breaks prefix caching

- Progress state accumulating in conversation history (use external
  state files instead — `read_file` a progress file rather than
  replaying history)
- Dynamic environment hints that change per turn
- Tool results interspersed with instructions in the system prompt

## Implementation Priority

| Priority | Optimization | Effort | Impact |
|----------|-------------|--------|--------|
| P0 | Progressive disclosure (SOUL.md + rules) | Medium | 30-50% |
| P1 | Config tuning (tool_output + compression) | Low | 5-15% |
| P1 | MCP server pruning | Low | 10-15% |
| P1 | Skills category precision | Low | 2-5% |
| P2 | delegate_task for large data | High | Variable |
| P2 | Stable prefix audit | Medium | Cache hit rate |

## Pitfalls

### Python scripts can't be inline in terminal

Bash quoting mangles Python with parentheses and quotes. Always write
to `/tmp/script.py` then run `python3 /tmp/script.py`. Use `write_file`
to create the script, not `terminal` with heredoc.

### split script section parsing

The split script must handle:
- `# ` (level-1) title lines as the first pseudo-section
- `## ` (level-2) as real section starts
- Lines before the first `## ` belong to the title/intro pseudo-section
- The last section runs to EOF

### MCP removal edge case: YAML top-level key detection

When removing `mcp_servers:` from config.yaml, the script must find the
next top-level key (non-indented, non-empty, non-comment) to know where
the section ends. Watch for:
- `mcp_servers:` at column 0
- Nested keys indented with 2 spaces
- `platform_toolsets:` or `known_plugin_toolsets:` as the next key

### skill_manage can't patch default-owned skills

Skills symlinked from the `default` profile into `orchestrator` cannot
be patched via `skill_manage(cross_profile=true)` from the orchestrator
session. Use `patch` tool directly on the SKILL.md file path with
`cross_profile=True` for file-level edits.

### Don't externalize authorization context

For hack profiles, the authorization block at the top of SOUL.md is
needed EVERY turn (to prevent LLM refusal), not just at tool-execution
time. Keep it inline even when externalizing everything else.

### Config changes need restart

- Main config.yaml: new TUI session or gateway restart
- Profile config.yaml: worker re-dispatch (next kanban task picks it up)
- Compression/tool_output: read at session start, NOT mid-conversation

### The "调研估算" anti-pattern: byte count × N is NOT a savings estimate

Naive savings projection multiplies the byte count of a candidate
segment by its profile coverage ("8 segments × 26 profiles = 40KB").
This **systematically overstates real savings by 50% or more** because
it ignores three forces:

1. **Only a fraction of profiles carry the canonical boilerplate**.
   Many "shared" sections are actually domain-templated
   (worker-researcher = OAuth2/JWT, [已移除] = FNO/L2-error, product-
   manager = PRD/NPS). Externalizing those requires keeping the
   template inline and only swapping the redundant prose.
2. **Appending a 1-line `_shared/...` reference still costs bytes**.
   A typical "通用契约详见" paragraph is 100-160B. For 10 profiles
   that's +1-1.6KB — the round can grow the corpus, not shrink it.
3. **Standard work loops diverge by domain** — worker-coder's 10
   steps (acp_send → verify → acp_send loop) ≠ worker-researcher's
   10 steps (web_search → web_extract) ≠ hack-recon's 11 steps
   (PentesterFlow 4 phases). Externalizing the "shared" loop forces
   a stripped-down 6-step skeleton that loses domain steps.

**Real example (2026-08-18, 26-profile Q2 audit)**:
- Naive estimate: 8 segments × ~5KB avg × 26 profiles = ~40KB
- Classified candidates into generic vs domain-specific before patching
- Actually generic-template coverage: 5/26 profiles (worker-coder + 4 [已移除])
- Real savings delivered: 21KB (52% of estimate)
- Skipped 2 segments entirely (标准作业循环 / 前线侦察协议) after realizing
  they weren't safely externalizable

**Mandatory step before reporting savings to user**: classify each
profile × each candidate section as "generic" (safe to externalize)
or "domain-specific" (must keep inline). Multiply by actual coverage.
Report the *lower* number with a clear "通用模板覆盖率 20-30%" caveat.

The full classification matrix is documented in
`soul-shared-rule-externalization` SKILL.md (Pits section, "通用模板
覆盖率低" pitfall) — read it before promising savings.

### The "追加引用" pitfall: appending a reference line adds bytes, doesn't save

After externalizing a section, the temptation is to keep the original
section AND append a `_shared/...` reference line "for completeness".
This **increases** the SOUL.md size instead of decreasing it.

**Wrong**: Keep the full original section + add "> 详见 _shared/xxx.md"
at the bottom. Net effect: +100-160B per section, -0% savings.

**Right**: Replace the entire section body with a 1-line summary +
`_shared/...` pointer. The section header stays, the body is replaced.
Net effect: -section_size + 60B reference line.

**Verification**: After each patch, check `wc -c` before vs after.
If the file grew, you appended instead of replaced. Revert and redo.

Real example (2026-08-18): Appending references to 10 domain-specific
"输出契约" sections added +104B each (+1,040B total). Reverting and
doing full replacement on 5 generic sections saved -2,171B each
(-10,855B total). The difference: 12x savings.

### The "语义替换" pitfall: externalizing a section whose _shared version differs

When creating a new `_shared/*.md` block from multiple SOUL.md files,
the temptation is to write a "canonical" version that merges all
variants. This **silently replaces** domain-specific content.

**Wrong**: Take worker-coder's "反模式三件套" (反过度设计/反应试/
未读代码不表态) and write _shared/anti-patterns.md with different
content (不重复失败调用/文本面板非汇报/完成靠工具不靠感觉).
The worker SOUL now references the new _shared block but the original
engineering craft rules are lost.

**Right**: Before creating a new _shared block, diff the candidate
sections across all N profiles. If they differ, either:
- Keep the domain-specific section inline (don't externalize), OR
- Write the _shared block as a superset that includes ALL variants
  (e.g. add "工程 craft 反模式" section alongside "Anthropic 反模式")

**Verification**: After creating a new _shared block, grep the .bak
files for the original section content and confirm every distinctive
phrase is still present in either the SOUL or the _shared block.

Real example (2026-08-18): worker-coder .bak "反模式三件套" was
engineering craft (反过度设计/反应试/未读代码不表态). New
_shared/anti-patterns.md was Anthropic style (不重复失败/文本面板/
完成靠工具). Blue-team reviewer caught the semantic replacement;
fix was to restore the original section in 5 SOULs + add _shared
reference, and add the 3 engineering craft items to _shared block.

### The "蓝军 reviewer 截断" pitfall: delegate_task fallback on provider exhaustion

When `delegate_task` spawns a blue-team reviewer with a fallback chain
(glm-5.3 → deepseek-v4-flash), the reviewer may hit HTTP 402
(Insufficient Balance) mid-task and return TRUNCATED results.

**Mitigation**: The parent should:
1. Not rely on the truncated review as complete — flag the gap
2. Run the remaining verification items itself (e.g. `hermes profile
   list` smoke test) and report which items were self-verified vs
   reviewer-verified
3. Consider pinning the reviewer to the primary model (glm-5.3) for
   short audit tasks to avoid fallback exhaustion

Real example (2026-08-18): Blue-team reviewer verified Items 1-4 but
hit 402 on Item 5. Parent ran `hermes profile list` itself and
reported "Item 5 self-verified (exit_code=0)" instead of claiming
full reviewer coverage.

## Reference Files

- `references/token-optimization-analysis-template.md` — diagnostic
  template for auditing a deployment's token consumption sources,
  with measurement commands and optimization recommendations.

## Scripts

- `scripts/split_soul_sections.py` — reusable script to split any
  SOUL.md or rules.md file by `## ` headers, externalizing specified
  sections to `references/` subdirectories with pointer lines.

## Related Skills

- **agent-soul-patching** — (default profile) Phase 1: batch-patching
  SOUL.md files with new tools and corrected install commands. This
  skill (token-optimization) is Phase 2: trimming bloated SOUL.md files
  back to their skeleton via progressive disclosure.
- **hermes-profile-config** — (default profile) Multi-profile config
  management, including write-guard workarounds for the orchestrator.
- **hermes-worker-lifecycle** — (default profile) Adding/removing
  worker profiles; relevant when MCP pruning changes profile behavior.
