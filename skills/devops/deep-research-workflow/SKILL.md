---
name: deep-research-workflow
description: >-
  Multi-source deep research workflow: fetch articles, dispatch parallel
  subagents for industry-wide survey, mine failed subagent transcripts for
  partial data, use authenticated gh CLI for GitHub project surveys, and
  split output into multiple focused reports. Use when the user asks for
  "深入调研" across multiple sources (articles + GitHub + standards +
  forums), or when research subagents fail mid-way and collected data
  needs recovery.
version: 1.0.0
platforms: [macos, linux]
metadata:
  hermes:
    tags: [research, github, subagent, delegate-task, evidence]
    related_skills:
      - evidence-based-research
      - scope-discipline
      - wechat-article-research
---

# Deep Research Workflow

End-to-end workflow for multi-source deep research tasks: article
extraction → industry survey → technical deep-dive → structured reports.
Covers the patterns discovered during the [已移除] platform research session
(3 WeChat articles + 194 GitHub repos + Wikipedia + arXiv, producing
90KB across 3 report files).

## When to Use

- User provides multiple URLs (articles/papers) and asks for "深入调研"
- User says "调研完成后再创建团队" (research first, then propose)
- Research spans multiple source types (articles + GitHub + standards + forums)
- User asks for "重新跑深度调研" after a previous attempt was incomplete

## Workflow Steps

### Step 1: Fetch primary sources

Use curl + regex for WeChat articles (see `wechat-article-research` skill).
Save raw content to JSON for reference.

### Step 2: Dispatch research subagents in parallel

Split the research into independent workstreams. Each subagent gets a
specific domain with clear search keywords:

```
delegate_task(tasks=[
  {"goal": "Search international standards + GitHub open-source projects...",
   "context": "..."},
  {"goal": "Search Chinese tech community + domestic vendors + tool docs...",
   "context": "..."},
  {"goal": "Deep-dive algorithm analysis with formulas + Python code...",
   "context": "..."}
])
```

**Critical**: Do NOT propose solutions/team/architecture while subagents
are running. See `scope-discipline` skill — "调研未完成不得提出具体方案".

### Step 3: Mine failed subagent transcripts

**Prevent first (learned 2026-08-20, dsh rc.8 research)**: three of four deep-source subagents were interrupted after ~50-70 tool calls having read all the evidence but written nothing. Prevention beats recovery:
- Instruct research subagents to **write the report file incrementally** (skeleton first, fill as they read) so even an interruption leaves a partial artifact, not zero.
- **Shrink scope per subagent**: 1 focused question + ≤3 target packages/files each; a 4-question brief across a 55-package monorepo invites hitting the limit before writing.
- **Feed prior evidence forward**: when re-dispatching after an interruption, pass the first run's collected findings in `context` so the retry verifies + completes instead of re-reading from scratch.

When a subagent still hits iteration limit or provider error before writing
its output file, its collected data is NOT lost. The live transcript at
`~/.hermes/profiles/orchestrator/cache/delegation/live/<delegation_id>/task-0.log`
contains all tool call results.

Recover data by regex-mining the transcript:

```python
import re

with open(transcript_path, 'r') as f:
    content = f.read()

# GitHub repos with stars
pattern = r'([\w\-]+/[\w\-\.]+)\s*\|\s*Stars:\s*(\d+)\s*\|\s*Lang:\s*([\w+#]+)'
repos = [(m.group(1), int(m.group(2)), m.group(3))
         for m in re.finditer(pattern, content)]

# arXiv paper IDs
papers = [m.group(0) for m in re.finditer(r'arxiv\.org/abs/[\d.]+v\d+', content)]

# Wikipedia article content (between === markers)
sections = re.findall(r'=== (\w+) ===\n(.+?)(?====|\Z)', content, re.DOTALL)
```

Compile the recovered data into the report yourself. This pattern rescued
194 GitHub repos + Wikipedia standards + arXiv papers from two subagents
that both hit provider errors.

**Reading subagent output** (applies to completed runs too): the final
summary is saved at
`~/.hermes/profiles/orchestrator/cache/delegation/subagent-summary-<N>-<ts>.txt`
(one file per task, newest = final answer). The live `task-N.log` is
append-only and long lines display truncated as `…(+N chars)` — a `tail`
of the live log is NOT the final conclusion; always open the
subagent-summary file for the complete report.

### Step 4: Use authenticated gh CLI for GitHub surveys

**Never** use unauthenticated `urllib`/`curl` to `api.github.com` — rate
limited to 60 requests/hour per IP, hitting 403 after ~10 requests.

**Always** use `gh search repos` via `execute_code` — authenticated via
`gh auth`, gets 5,000 requests/hour:

```python
from hermes_tools import terminal
import json

queries = [
    ('[已移除] tools', 'topic:[已移除]'),
    ('FDTD electromagnetic', 'FDTD electromagnetic in:name,description'),
    # ... 15-20 queries covering all domains
]

all_repos = {}
for label, q in queries:
    result = terminal(
        f'gh search repos "{q}" --sort=stars --limit=10 '
        f'--json fullName,stargazersCount,description,language 2>/dev/null'
    )
    for r in json.loads(result.get("output", "[]")):
        name = r["fullName"]
        if name not in all_repos:
            all_repos[name] = {
                "stars": r["stargazersCount"],
                "lang": r.get("language", "N/A"),
                "desc": r.get("description", ""),
                "category": label
            }

sorted_repos = sorted(all_repos.values(), key=lambda x: x["stars"], reverse=True)
```

A single `execute_code` call with 20 queries collects 190+ repos in ~30
seconds. Store as JSON, then reference in the report.

For individual repo details (README, specific files):
```python
# Get repo metadata
r = terminal('gh api repos/neuraloperator/neuraloperator --jq '
             '"{full_name, stargazers_count, description, language, html_url}"')
```

### Step 5: Fetch Wikipedia content via Python urllib

Wikipedia doesn't rate-limit like GitHub. Use Python urllib with HTML
regex stripping:

```python
import urllib.request, re

def fetch_wiki(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    resp = urllib.request.urlopen(req, timeout=15)
    t = resp.read().decode("utf-8", errors="replace")
    t = re.sub(r"<[^>]+>", " ", t)
    t = re.sub(r"\s+", " ", t)
    return t

# Extract specific sections
content = fetch_wiki("https://en.wikipedia.org/wiki/Synopsys")
idx = content.find("Products")
products_section = content[idx:idx+3000] if idx > 0 else ""
```

### Step 6: Split output into multiple focused reports

For complex research (3+ articles + industry survey), split into:

| Report | Content |
|--------|---------|
| `*-analysis-v2.md` (main) | Article analysis + standards + project matrix + commercial tools + tech stack + feasibility + module split |
| `*-supplement.md` | Domestic vendors + tool deep-docs (FEniCS/Meep/etc) + AI trends + standards detail |
| `*-tech-deep-dive.md` | Algorithm formulas + Python code snippets + implementation details from real source code |

Each report cross-references the others. Total can reach 80-100KB across
3 files without any single file being unmanageable.

## Key Lessons

### "调研完成后再创建团队" means WAIT

The user explicitly said "调研完成后再创建团队 — 基于真实调研数据决定团队规模和角色划分".
This is a hard constraint: no team proposals until research is complete
and presented. The agent violated this by proposing a 7-profile team
after only fetching 3 articles, before any industry research was done.

### Do NOT second-guess user-specified parameters

User said "全部使用glm-5.2模型". The agent asked "模型分配：全部用
glm-5.2还是关键角色用k3？". When the user says "全部使用X", that means
ALL roles use X. No exceptions, no "but what about important roles?"
follow-up.

### Do NOT end research with "需要你确认"

"需要你确认：1.团队规模 2.模型分配 3.是否现在开始？" pushes decisions
back to the user. Either complete the task autonomously when the answer
is inferable from research data, or respect scope boundaries if the user
constrained scope.

### Subagent failure is recoverable

Two subagents hit "API call failed after 3 retries: Provider returned
an empty stream" — but both had collected 50+ tool calls of real data
in their transcripts. Mining transcripts recovered all data and the
final report was completed without re-dispatching.

## Related Skills

- **evidence-based-research** — anti-hallucination citation rules
- **scope-discipline** — research-then-propose sequence enforcement
- **wechat-article-research** — WeChat article fetching with curl+regex
- **cognition-self-check** — pre-output quality gate
