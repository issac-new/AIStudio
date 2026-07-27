---
name: github-repo-survey
description: "Survey GitHub repos by category — star counts, descriptions, topic discovery — using the authenticated `gh` CLI. Use when researching top projects in a domain, evaluating tools/vendors, or building a landscape report. Covers rate-limit avoidance, batch fetching, and topic search."
version: 1.0.0
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [github, research, survey, stars, discovery, tool-evaluation]
    related_skills: [evidence-based-research, github-workflows]
---

# GitHub Repo Survey

Survey GitHub repositories by category — gather metadata (stars, descriptions,
languages), discover top projects by topic, and build landscape/comparison
reports. Uses the authenticated `gh` CLI to avoid API rate limits.

## When to Use

- "Find the top 10 CI/CD tools on GitHub"
- "Research the best static analysis linters"
- "Survey E2E testing frameworks by popularity"
- "Build a tool landscape report for a role/domain"
- "Compare GitHub projects by stars for a vendor evaluation"
- Any task that enumerates and compares GitHub projects by metadata

## Prerequisites

- `gh` CLI installed and authenticated (`gh auth login`)
- Confirm: `gh auth status` shows ✓ Logged in

## Core Techniques

### 1. Individual Repo Metadata (≤20 repos)

Use `gh api` with `--jq` to extract fields. Authenticated via keyring →
5000 requests/hour (vs 60/hour unauthenticated):

```bash
for repo in owner1/repo1 owner2/repo2; do
  echo -n "$repo: "
  gh api "repos/$repo" --jq '.stargazers_count'
  echo ""
done
```

Common fields: `.stargazers_count`, `.description`, `.language`,
`.license.spdx_id`, `.homepage`, `.topics`, `.updated_at`.

To get both stars and description in one call:

```bash
for repo in owner1/repo1 owner2/repo2; do
  stars=$(gh api "repos/$repo" --jq '.stargazers_count')
  desc=$(gh api "repos/$repo" --jq '.description')
  echo "$repo: ⭐$stars  $desc"
done
```

### 2. Topic Discovery — Search by Stars

The fastest way to find top projects in a category:

```bash
gh search repos "ci/cd" --sort stars --limit 10 \
  --json fullName,stargazersCount,description
```

The search qualifier accepts natural-language topics, not just GitHub topic
tags. Try multiple phrasings for coverage:

```bash
gh search repos "static analysis" --sort stars --limit 10 --json fullName,stargazersCount,description
gh search repos "code review" --sort stars --limit 10 --json fullName,stargazersCount,description
gh search repos "mutation testing" --sort stars --limit 10 --json fullName,stargazersCount,description
```

### 3. Batch Fetch (>20 repos) — Python + Token

For large surveys (30+ repos), extract the `gh` token and use Python's
`urllib` directly. Avoids per-call process spawn overhead of `gh api`:

```bash
GH_TOKEN=$(gh auth token) python3 -c "
import urllib.request, json, os, time
token = os.environ['GH_TOKEN']
repos = ['owner1/repo1', 'owner2/repo2', 'owner3/repo3']
for repo in repos:
    req = urllib.request.Request(
        f'https://api.github.com/repos/{repo}',
        headers={'User-Agent':'hermes','Authorization':f'Bearer {token}'}
    )
    try:
        with urllib.request.urlopen(req, timeout=8) as r:
            d = json.load(r)
            print(f'{repo:40s} {d[\"stargazers_count\"]:>8} {(d[\"description\"] or \"\")[:80]}')
    except Exception as e:
        print(f'{repo:40s} ERR {str(e)[:50]}')
    time.sleep(0.2)
"
```

## Workflow for a Full Landscape Survey

1. **Define categories** — list the sub-areas you need (e.g. for DevOps:
   CI/CD, container orchestration, IaC, monitoring, release management).
2. **Search discovery** — run `gh search repos "topic" --sort stars` for
   each sub-area to identify candidate repos.
3. **Known-repo lookup** — add any industry-standard repos you know by
   name to the list (they may not surface in search if the description
   doesn't match your search term).
4. **Batch metadata** — fetch stars + descriptions for all candidates
   using the Python+token batch approach.
5. **Cross-reference** — verify star counts against known industry
   consensus (e.g. Kubernetes should be >100K; if it shows 150, something
   is wrong — likely a different repo with a similar name).
6. **Report** — write a markdown table with rank, repo, stars, description.

## Pitfalls

1. **Never use raw `curl` for >10 repos** — unauthenticated API is capped
   at 60 requests/hour. You'll hit rate limits after ~12 repos. Always
   use `gh api` or extract `GH_TOKEN=$(gh auth token)`.

2. **Field name mismatch between endpoints** — `gh search repos` returns
   camelCase (`stargazersCount`); `gh api repos/...` returns snake_case
   (`stargazers_count`). Use the correct field name for each endpoint.

3. **Repos move/fork** — `mutmut/mutmut` returned 404 because the repo
   moved to `boxed/mutmut`. If a known repo 404s, use
   `gh search repos "name"` to find the current path.

4. **`gh api --jq` adds a trailing newline** — when building tabular
   output in a shell loop, the output formatting can get messy. Either
   capture in a variable or use `| tr -d '\n'`.

5. **Star counts ≠ quality** — some repos have inflated stars from
   viral/hype factor (e.g. `github/super-linter` showed only 150 stars
   despite being an official GitHub repo). Always cross-reference with
   industry knowledge and the repo's actual usage/adoption.

6. **Description truncation** — API descriptions can be up to ~350 chars.
   Truncate in display (`[:80]`) but keep the full text for the report
   if nuance matters.

7. **Timeout on large Python batch scripts** — if fetching 40+ repos in
   a single Python script, set `timeout=8` per request and
   `time.sleep(0.2)` between calls. Total runtime for 40 repos ≈ 12s.
   If the terminal times out, split into batches of 15-20.

## Reference Files

| File | Content |
|------|---------|
| `references/github-repo-research.md` | Detailed patterns, pitfalls, and worked examples |
