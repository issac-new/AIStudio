---
name: subagent-api-limit-recovery
description: "Recover data from research subagents that hit their API call limit before writing output files. Three recovery sources: subagent summary files, live transcripts, and /tmp/ cached scraping data. Use when delegate_task subagents return 'API call limit reached' or 'tool calls exhausted' instead of the expected output file."
version: 1.0.0
platforms: [macos, linux]
metadata:
  hermes:
    tags: [delegation, subagent, recovery, research, failure-recovery]
    related_skills:
      - deep-research-workflow
      - research-then-improve
      - fusion-implementation-patterns
---

# Subagent API-Limit Recovery

When `delegate_task` subagents hit their API call limit (default: 50 calls
per subagent) before writing their output file, their collected data is
NOT lost. This skill captures the three-source recovery pattern.

## When to Use

- A `delegate_task` batch returns with status=completed but the expected
  output files don't exist
- Subagent summary says "due to tool call limit, I could not write the file"
- Subagent final log line shows `status=completed exit_reason=completed`
  but no file was produced
- 1 or more subagents in a batch of N hit limits while others succeeded

## The Problem

`delegate_task` subagents have a per-subagent API call budget (typically
50 calls). Deep research tasks that involve web scraping, document
fetching, or GitHub API calls can exhaust this budget before the subagent
reaches the "write output file" step. The subagent returns with
`status=completed` (it did complete its run) but the output file is
missing.

**Key insight**: the subagent's tool call results — fetched web pages,
GitHub repo metadata, document text — are cached in three places and
can be recovered by the parent agent.

## Three Recovery Sources (check in order of efficiency)

### Source A — Subagent Summary Files (read first, most efficient)

Path: `~/.hermes/profiles/orchestrator/cache/delegation/subagent-summary-<N>-<timestamp>.txt`

When a subagent finishes (even if it couldn't write the target file),
the delegation framework saves a structured summary of what the subagent
produced. These are 5-10KB each, pre-digested by the subagent into
organized findings.

Read these first:
```python
from hermes_tools import read_file
import glob

summary_files = glob.glob(
    os.path.expanduser(
        "~/.hermes/profiles/orchestrator/cache/delegation/subagent-summary-*.txt"
    )
)
for f in sorted(summary_files):
    r = read_file(f)
    content = r.get("content", "")
    # Extract findings by scanning for markdown headings and key phrases
    for line in content.split("\n"):
        if line.startswith("#") or "来源" in line or "http" in line:
            print(line)
```

### Source B — Live Transcripts (most complete, larger)

Path: `~/.hermes/profiles/orchestrator/cache/delegation/live/<delegation_id>/task-<N>.log`

Append-only human-readable log of every tool call + result the subagent
made. These can be 100KB+ per subagent. Use when Source A lacks detail
for a specific finding.

```python
import re

transcript_path = f"~/.hermes/profiles/orchestrator/cache/delegation/live/{delegation_id}/task-{N}.log"
with open(transcript_path) as f:
    content = f.read()

# Extract URLs that were fetched
urls = re.findall(r'https?://[^\s"\'<>]+', content)

# Extract structured data patterns (adapt regex to your data shape)
# Example: GitHub repos
repos = re.findall(r'([\w-]+/[\w.-]+)\s*\|\s*Stars:\s*(\d+)', content)

# Extract key findings (between "result" markers)
results = re.findall(r'result\s+\|.*?ok.*?output.*?:(.*?)(?=\n\d{2}:\d{2}:\d{2})', content, re.DOTALL)
```

### Source C — Cached Raw Data in /tmp/ (subagent's scraping output)

Subagents that do web scraping often save raw HTML/text to `/tmp/`
before parsing. Check these directories — they contain the actual
fetched content.

```python
import os

# Common /tmp/ directories subagents create
candidate_dirs = [
    "/tmp/palantir_text/",    # .txt files (parsed content)
    "/tmp/palantir_raw/",     # .html files (raw pages)
    f"/tmp/{subject}_*",      # subject-specific naming
]

for d in candidate_dirs:
    if os.path.isdir(d):
        files = sorted(os.listdir(d))
        print(f"{d}: {len(files)} files")
        for f in files[:5]:
            with open(os.path.join(d, f)) as fh:
                content = fh.read()
            print(f"  {f}: {len(content)} chars")
```

## Recovery Workflow

```
1. Read all subagent-summary-*.txt → extract structured findings
2. For missing detail → grep/tail live transcripts for specific keywords
3. For raw source content → check /tmp/ for cached HTML/text
4. Write the final report yourself (parent agent, not a subagent)
```

The parent agent (you) writes the final report using the recovered data.
This is reliable because the data was collected by real tool calls —
it just wasn't formatted into the final output by the subagent.

## Decision: Mine vs Re-dispatch

| Situation | Action |
|-----------|--------|
| Subagent collected 40+ tool calls of data | Mine the transcript + summary |
| Subagent collected < 10 tool calls | Re-dispatch with narrower scope |
| 1 of N subagents failed | Mine that one, keep others' output |
| All N failed at same point | Check systemic issue (provider, auth) |
| Data is time-sensitive | Mine (faster than re-dispatch) |
| Data requires fresh scraping | Re-dispatch (cached data may be stale) |

## Case Study: Palantir Research (2026-07-31)

3 subagents dispatched for Palantir deep research:
- task-0: Product philosophy (1398s, 50 API calls) — no output file
- task-1: Technical implementation (1716s, 50 API calls) — no output file
- task-2: Organizational patterns (1604s, 50 API calls) — no output file

All 3 hit the 50-call limit before writing. Recovery:
- Source A: Read 3 subagent-summary files → extracted key findings per dimension
- Source B: Tailed live transcripts for specific details (GitHub repos, doc URLs)
- Source C: Found `/tmp/palantir_text/` with 24 .txt files (Foundry docs) +
  `/tmp/palantir_raw/` with 24 .html files

Result: Parent agent wrote 3 complete reports (philosophy 10.7KB,
implementation 11.5KB, org-patterns 9.6KB) using recovered data,
with all source URLs preserved. No re-dispatch needed.

## Preventing the Problem (for future dispatches)

### Estimate API call budget before dispatching

For web-scraping-heavy research, estimate:
- Each URL fetch = 1-2 tool calls (fetch + parse)
- Each `execute_code` with multiple fetches = 1 call but uses the budget internally
- Each `read_file` / `search_files` = 1 call
- Writing the output file = 1 call

A subagent scraping 30 web pages + 10 GitHub repos + writing 1 report
needs ~45-55 calls. This is right at the limit.

### Mitigation options

1. **Split the workload** — 2 subagents each do half the URLs
2. **Give a lower target** — "fetch 10 key pages" not "fetch all 30"
3. **Use `execute_code` for batch fetches** — one call fetches N URLs
4. **Tell subagent to write early** — "after 40 tool calls, write what you have"
5. **Increase goal_max_turns** — if the budget is configurable, raise it

## Pitfalls

### Don't assume "status=completed" means "output file written"

A subagent that hits its API limit still returns `status=completed`
because the subagent itself completed its run (it didn't crash). The
absence of the output file is the only signal. Always check `ls -la
<expected_output_path>` after a delegation batch.

### Don't re-dispatch immediately

Before re-dispatching, check Sources A/B/C. If the subagent collected
40+ tool calls of data, mining is faster and more reliable than
re-dispatching (the new subagent might also hit the limit).

### Don't trust subagent self-reported findings without source URLs

Subagent summary files may contain findings without source URLs if
the subagent ran out of budget before formatting them. Cross-check
any un-sourced claims against the live transcript before including
them in the final report.

## Related Skills

- **deep-research-workflow** (default profile) — the parent workflow;
  this skill extends its Step 3 (mine failed transcripts) with the
  three-source recovery pattern
- **research-then-improve** (default profile) — uses delegate_task for
  research; this skill provides the failure-recovery layer
- **fusion-implementation-patterns** (default profile) — batch
  delegate_task for SOUL.md patching; same API-limit risk applies
