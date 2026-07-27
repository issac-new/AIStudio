---
name: multi-team-soul-enrichment
description: >-
  Enrich SOUL.md files across multiple agent teams simultaneously —
  product team, ops team, swarm team — using a three-phase pipeline:
  (1) multi-team GitHub mainstream tool research via parallel delegate_task,
  (2) two-strategy enrichment (new command manuals + existing manual supplements),
  (3) post-enrichment quality verification. Captures patterns discovered when
  extending soul-enrichment-pipeline beyond hack+collaboration to all teams.
  Complements soul-enrichment-pipeline and soul-enrichment-command-manual.
version: 1.0.0
platforms: [macos, linux]
metadata:
  hermes:
    tags: [soul-design, enrichment, product-team, ops-team, swarm-team]
    related_skills:
      - soul-enrichment-pipeline
      - soul-enrichment-command-manual
      - soul-md-privacy-section-patching
      - collaboration-team-soul-enrichment
---
# Multi-Team SOUL.md Enrichment

Add command manuals and supplementary tools to Hermes agent SOUL.md files
across multiple teams (product, ops, swarm) in a single coordinated session.
Complements `soul-enrichment-pipeline` which covers the foundational 5-layer
structure and hack-team enrichment.

## When to Use

- User requests to "research mainstream GitHub projects and enhance all profiles"
- Extending enrichment beyond hack+collaboration teams to product/ops teams
- Batch-enriching 10+ profiles in a single session
- Profiles with NO command manual (`## 具体操作命令手册`) exist alongside
  profiles needing tool supplements

## Three-Phase Workflow

### Phase 0 — Quick Audit (5 minutes)

Before any research, run a systematic gap analysis across all target profiles:

```bash
TEAM="product ops swarm"
for d in product-manager product-researcher ... ops-exec-summary; do
  f=~/.hermes/profiles/$d/SOUL.md
  lines=$(wc -l < "$f")
  blocks=$(( $(grep -c '```' "$f" 2>/dev/null) / 2 ))
  grep -q "具体操作命令手册" "$f" && manual="Y" || {
    grep -q "## 常用工具命令\|## 常用命令\|## 事故响应.*命令" "$f" && manual="C" || manual="N"
  }
  echo "$d: L=$lines B=$blocks M=$manual"
done
```

This produces a clear table of who needs a full new manual (M=N)
vs who needs supplements (M=Y or C).

### Phase 1 — Multi-Team GitHub Research

Dispatch parallel `delegate_task` subagents, one per team, to research
mainstream GitHub projects. Each subagent should:

1. Use `gh api repos/owner/repo --jq '.stargazers_count, .description'`
   to fetch real star counts for 30-90 tools per team
2. Record install commands (brew/pip/npm/go/cargo) for each tool
3. Map tools to profiles based on functional alignment
4. Handle renamed/not-found repos by searching (`gh search repos`)

**Key research queries by team:**

| Team | Focus areas | Typical tool count |
|------|------------|-------------------|
| Product | Linear, Notion, GWS, Pandoc, xlsxwriter, app-store-scraper, VADER | 25-35 |
| Swarm | pre-commit, k9s, nx, CodeQL, Playwright, spectral, just, argocd | 80-100 |
| Ops | chaos-mesh, litmus, promtool, loki, checkov, robusta, Glow, yq | 35-45 |

**CRITICAL: Handle subagent output loss.** Subagents frequently complete
their data gathering but fail on the final `write_file` call with
"Connection error after 3 retries". The research data is NOT lost —
extract it from the live transcript:

```bash
grep "result.*execute_code.*ok" \
  ~/.hermes/profiles/<profile>/cache/delegation/live/<deleg_id>/task-0.log \
  | tail -5
```

Or simply use your own knowledge of mainstream tools (all confirmed
tools have star counts available via `gh api` at any time). The research
phase's real value is confirmation, not discovery — you already know
what kubectx, Playwright, chaos-mesh etc. do.

### Phase 2 — Two-Strategy Enrichment

Split the enrichment work into two parallel `delegate_task` batches,
each using `role='orchestrator'` so subagents can write files directly:

**Batch A — New Command Manuals** (for profiles with M=N):
Add a full `## 具体操作命令手册` section. Recommended tools by profile:

| Profile Type | Core Tools to Include |
|---|---|
| product-manager | Linear, Notion, GWS CLI, Pandoc, xlsxwriter, gh, markdownlint |
| product-researcher | httpx, pandas, jq, matplotlib, xlsxwriter, curl, pandoc |
| product-feedback | app-store-scraper, vaderSentiment, csvkit, jq, xlsxwriter |
| product-prioritizer | Linear, xlsxwriter (RICE calc), jq, gh, graphviz |
| worker-researcher | httpx, curl, jq, pandas, pandoc, htmlq, csvkit, matplotlib |
| ops-exec-summary | pandoc, jq, yq, graphviz, glow, matplotlib |

**Batch B — Tool Supplements** (for profiles with M=Y or C):
Add 3-8 new tool categories to existing manuals. Focus on mainstream
GitHub tools missing from the current section:

| Profile | Good Additions |
|---|---|
| architect | graphviz, structurizr, c4builder, d2lang, netron |
| project-manager | gh projects, Linear sprint automation, Python burndown |
| requirement-analyst | Spectral, Prism, Cucumber CLI, ajv |
| worker-coder | pre-commit, nx/turborepo, git-cliff, just |
| worker-deployer | k9s, stern, kubectx, kube-bench, dive, syft, argocd, flux, grype |
| worker-reviewer | CodeQL, SonarQube, gitleaks, trufflehog |
| worker-tester | Playwright, Artillery, Locust, Bruno, testcontainers |
| ops-sre | chaos-mesh, litmus, promtool, grafana CLI, loki, jaeger |
| ops-devops | checkov, terrascan, terragrunt, argocd, flux, kubeval, pluto |
| ops-incident-commander | amtool, grafana/oncall, robusta, upptime, awx |

When using subagents for patching, instruct them to use `cross_profile=True`
and to prefer `execute_code` with Python string replacement over the `patch`
tool when the files have duplicate `---` seperators.

### Phase 3 — Quality Verification

After both batches complete, verify the enrichment:

```bash
echo "=== Quality Check ==="
for d in product-manager ... ops-exec-summary; do
  f=~/.hermes/profiles/$d/SOUL.md
  lines=$(wc -l < "$f")
  blocks=$(( $(grep -c '```' "$f" 2>/dev/null) / 2 ))
  grep -q "具体操作命令手册" "$f" && manual="Y" || manual="N"
  echo "$d: L=$lines B=$blocks M=$manual"
done
echo ""
echo "Total lines: $(cat ~/.hermes/profiles/*/SOUL.md | wc -l)"
echo "Avg lines: $(echo "scale=0; $(cat ~/.hermes/profiles/*/SOUL.md | wc -l) / 16" | bc)"
```

Confirm that:
1. All profiles now have `M=Y` (manual present) or `M=C` (commands present under alternate header)
2. Each new-manual profile has ≥8 code blocks
3. The `---` separator and privacy section are still at the end of each file

## Pitfalls

### Subagent Final Write API Failure
All research and enrichment subagents that perform a final `write_file` or
`kanban_complete` risk "Connection error after 3 retries". This does NOT
mean the data was lost — use the live transcript (task-0.log) to extract
results, or dispatch a separate write-only subagent.

**Fix**: If the subagent's research data is critical, save intermediate
results to JSON files inside `execute_code` during the run. These survive
even if the final write call fails.

### Duplicate `---` Separators
SOUL.md files have TWO consecutive `---` lines before `## 隐私保护规则`.
The `patch` tool's fuzzy matching finds both, returning "Found 2 matches".
Use `execute_code` with Python string replacement instead:

```python
with open(filepath) as f: content = f.read()
marker = "\n---\n\n\n---\n\n## 隐私保护规则"
idx = content.find(marker)
if idx != -1:
    content = content[:idx] + command_block + content[idx:]
    with open(filepath, "w") as f: f.write(content)
```

### `read_file` Dedup Cache
The `read_file` tool returns `{'content_returned': False}` for files
already read this session. In `execute_code`, use `terminal` with `cat`
or open files directly with Python's `open()`.

## Results Reference

From the 2026-07-24 session (full three-team enrichment):

- **16 profiles enriched** (all non-hack profiles)
- **Total gain**: ~3,700 → 6,869 lines (+86%)
- **Code blocks**: 98 → 237 (+142%)
- **6 new command manuals** added (product team ×4 + worker-researcher + ops-exec-summary)
- **10 profiles supplemented** with 3-8 new tool categories each
- **80+ tools added** from mainstream GitHub research

## Related Skills

- **soul-enrichment-pipeline** — The parent pipeline covering hack-team
  and collaboration-team 5-layer SOUL.md structure. This skill extends
  that pipeline to product and ops teams.
- **soul-enrichment-command-manual** — Python fallback technique for
  adding command manual sections when `patch` tool fails on `**` bold
  markers or `---` separators.
- **soul-md-privacy-section-patching** — Two-copy privacy section
  workaround and content-line anchoring technique.
- **security-tool-github-research** — Security-tool version of the
  research phase (for hack team).
