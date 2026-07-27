---
name: soul-tool-gap-research
description: >-
  Research GitHub security/forensics tools NOT yet in hack team SOUL.md files,
  identify capability gaps, and produce a structured gap analysis for the next
  worker who patches the SOULs. Covers the 4-step methodology (read SOUL
  first, batch GitHub lookup, handle non-existent tools, structured gap
  analysis), rate-limit recovery (unauthenticated urllib → gh api), platform
  consistency auditing (apt install on macOS host), and cross-profile
  skill_manage patch limitations. Use when auditing or enriching hack team
  agent SOUL.md files with new tools.
version: 1.0.0
platforms: [macos, linux]
metadata:
  hermes:
    tags: [soul-design, hack-team, tool-research, gap-analysis, github]
    related_skills: [security-team-soul-enrichment, github-repo-survey, agent-team-tool-integration]
---

# SOUL Tool Gap Research

Methodology for researching tools NOT yet in hack team SOUL.md files,
identifying capability gaps, and producing a structured gap analysis
that the next worker can act on to patch the SOULs.

## When to Use

- "Research tools NOT yet in our SOUL.md files" — the word "NOT" signals
  a gap audit, not a tool integration
- Auditing hack-recon or hack-forensics SOUL.md for missing capabilities
- Evaluating mainstream GitHub security tools for potential integration
- Producing a gap report that a downstream worker will use to patch SOULs

## The 4-Step Methodology

### Step 1 — Read the current SOUL.md files FIRST

Before any GitHub searches, read the target agent's SOUL.md in full.
Identify:

- **Which tool categories already exist** (so you don't duplicate)
- **Which categories are mentioned but lack commands** — e.g. "Zeek (Bro)"
  listed in a capability description but zero usage examples in the command
  manual. This is a "phantom tool" — named but not actionable.
- **Which install commands are vague or missing** — e.g. "go install" as a
  category but no full import paths (`go install github.com/projectdiscovery/
  nuclei/v3/cmd/nuclei@latest`)
- **Platform consistency** — check if install commands match the host OS.
  All `apt install` on a macOS host = every install command is broken.

### Step 2 — Batch GitHub API lookup

For each requested tool, fetch repo metadata (stars, description, language).
Use authenticated `gh` CLI to avoid rate limits:

```bash
# Individual repo lookup (authenticated, 5000 req/hr)
gh api repos/projectdiscovery/naabu \
  --jq '.html_url + " ★" + (.stargazers_count|tostring) + " " + .description'
```

For batch lookups (15+ repos), extract the token for Python:

```bash
GH_TOKEN=$(gh auth token) python3 -c "
import urllib.request, json, os, time
token = os.environ['GH_TOKEN']
repos = ['owner1/repo1', 'owner2/repo2']
for repo in repos:
    req = urllib.request.Request(
        f'https://api.github.com/repos/{repo}',
        headers={'User-Agent':'hermes','Authorization':f'Bearer {token}'}
    )
    # ... fetch and print
    time.sleep(0.3)
"
```

**See `github-repo-survey` skill for the full batch patterns.**

### Step 3 — Handle tools that don't exist

Not every tool a user requests will exist on GitHub. When a tool can't be
found after exhaustive search (direct repo lookup + `gh search repos`):

- Document the search effort and closest alternatives
- Mark as "⚠️ NOT FOUND" in the report — do NOT fabricate a repo URL
- Suggest functionally equivalent tools that do exist

**Real example (2026-07)**: "chameleon WAF evasion" and "altair API recon"
were requested but don't exist as security tools on GitHub. Closest matches:
- "chameleon" → `qeeqbox/chameleon` (★838, a honeypot framework, NOT WAF evasion)
- "altair" → `altair-viz/altair` (★10K+, a Python visualization library)

Owner name guesses also fail: `haharock/hakrawler` 404s — the correct owner
is `hakluke/hakrawler`. Always use `gh search repos "name"` to find the
real path when a direct lookup fails.

### Step 4 — Structured gap analysis

After finding tools, produce a gap analysis of the SOUL.md files with
these sections:

1. **Missing tool categories** — entire capabilities absent (priority-ordered)
2. **Vague/missing install steps** — tools mentioned without install commands
3. **Platform inconsistency** — install commands for wrong OS
4. **Commands that are vague** — outdated syntax, missing setup steps

This gap analysis is the actionable deliverable. The next worker patches
the SOUL.md files based on it.

## Per-Tool Output Format

For each tool found, produce a structured entry:

```
| Field | Value |
|-------|-------|
| **Repo** | https://github.com/owner/repo |
| **Stars** | N |
| **Language** | Go/Python/Rust/C++ |
| **Description** | One-line |
| **Install** | Full command (brew/go install/pip/git clone) |
| **Usage 1** | Concrete command |
| **Usage 2** | Concrete command |
| **Usage 3** | Concrete command |
| **Agent** | hack-recon / hack-forensics / hack-exploit |
```

## Common Gap Patterns

### Pattern: "Phantom tools" (named but no commands)

A SOUL.md mentions a tool in its capability description but provides zero
usage examples in the command manual. Example: hack-forensics SOUL.md line 36
says "Zeek (Bro), Suricata" but the command manual (Sections 1-8) has no Zeek
or Suricata commands at all.

**Fix**: Add a full command section with install + 2-3 usage commands.

### Pattern: All install commands for wrong platform

Hack team SOUL.md files were written with `sudo apt install` (Debian/Linux)
but the host is macOS. Every `apt install` is broken on macOS without a
`brew install` equivalent.

**Fix**: During gap analysis, note `brew` equivalents for every `apt install`
found. The worker patching the SOUL should add cross-platform install
commands: `brew install X` (macOS) / `apt install X` (Linux).

### Pattern: Missing `go install` full paths

SOUL.md says "go install: nuclei, subfinder, httpx" but doesn't give the
full import path. A worker can't run `go install nuclei` — they need
`go install github.com/projectdiscovery/nuclei/v3/cmd/nuclei@latest`.

**Fix**: Always include the full `go install` path in tool tables.

## Pitfalls

### Unauthenticated urllib hits rate limit after ~12 repos

Python `urllib` without a token hits the 60 req/hr unauthenticated GitHub
API rate limit after ~12 repos. If you hit `HTTP 403: rate limit exceeded`,
switch immediately to `gh api` which uses the keyring token (5000 req/hr).
Do NOT wait for the rate limit window to reset.

### skill_manage cannot patch default-profile skills

`security-team-soul-enrichment`, `github-repo-survey`, and
`agent-team-tool-integration` all live in the `default` profile (symlinked
into `orchestrator`). Even with `cross_profile=True`,
`skill_manage(action='patch')` reports "not found in active profile."

**Workaround**: Create a new skill in the orchestrator profile (like this
one) to capture new learnings. The background curator can consolidate
later. Alternatively, use the `patch` tool directly on the absolute file
path (shown by `skill_view` in the `path` field) — but only when not in
a restricted review context.

### Owner name guesses fail

When you guess a GitHub owner/repo path (e.g. "haharock/hakrawler"), it
will often 404. Security tool authors use personal handles, not org names.
Always use `gh search repos "toolname"` to discover the real owner before
direct lookup.

## Reference Files

| File | Content |
|------|---------|
| `references/hack-tool-gaps-2026-07.md` | Detailed findings from the 2026-07 gap audit: 21 tools found, 2 not found, per-tool tables with install/usage commands, and SOUL.md gap analysis for hack-recon and hack-forensics |

## Related Skills

- **security-team-soul-enrichment** — (in default profile) tool-to-agent
  mapping, AST-based catalog extraction, Burp Suite headless guide,
  parallel SOUL.md batch updates. This skill extends it with the research
  methodology for finding NEW tools not yet integrated.
- **github-repo-survey** — (in default profile) batch GitHub repo metadata
  fetching, `gh search repos` patterns, rate-limit avoidance
- **agent-team-tool-integration** — (in default profile) tool-to-agent
  load balancing, AST extraction from wrapper repos
