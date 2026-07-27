---
name: security-tool-github-research
description: >-
  Research mainstream GitHub security/offensive tools not yet covered in
  hack team SOUL.md files. Covers tool-name resolution (short alias →
  owner/repo), gap analysis against existing SOUL.md content, batch
  metadata fetching via gh CLI, and handling tools that aren't on GitHub.
  Pairs with security-team-soul-enrichment for the actual SOUL.md writing.
version: 1.0.0
platforms: [macos, linux]
metadata:
  hermes:
    tags: [soul-design, hack-team, github, tool-research, security-tools]
    related_skills: [security-team-soul-enrichment, agent-team-tool-integration, github-repo-survey]
---

# Security Tool GitHub Research

Procedures for researching mainstream GitHub security/offensive tools
and identifying gaps in hack team SOUL.md files. This is the research
phase that precedes SOUL.md enrichment — it gathers the raw tool data
(repo URL, stars, install command, key usage commands) that the
enrichment phase then writes into agent SOUL.md files.

## When to Use

- User asks to research security tools not yet in SOUL.md files
- Auditing a hack team's tool coverage against industry mainstream
- Preparing enrichment data for security-team-soul-enrichment workflow
- Any survey of offensive security tools on GitHub by short name

## Prerequisites

- `gh` CLI installed and authenticated (`gh auth status` shows ✓)
- Read access to the hack team SOUL.md files being audited

## Workflow

### Step 1 — Gap Analysis (read SOUL.md first)

Before researching any tools, read the target SOUL.md file(s) to
classify each requested tool into one of three gap types:

| Gap type | Meaning | Enrichment action needed |
|----------|---------|---------------------------|
| **Absent** | Tool not mentioned anywhere in SOUL.md | Full section: install + 2-3 commands |
| **Table-only** | Listed in speed-reference table, but no command section | Add command section only |
| **Partial** | Has some commands but missing key workflows | Extend existing section with missing commands |

For SOUL.md files >500 lines, use `read_file` with `offset` to page
through. The tool speed-reference table is typically near the end
(hack-exploit: ~line 550; hack-weapons: ~line 430).

This classification prevents duplicating tool entries that already
exist in the SOUL.md's speed-reference table and focuses writing
effort on genuinely missing content.

### Step 2 — Tool-Name Resolution

Security tools are commonly known by a short alias that does NOT match
their `owner/repo` path. Resolve each tool name before fetching metadata.

#### Resolution procedure

1. Try `gh api repos/<guessed-owner>/<guessed-name>`. If 200, done.
2. If 404, run `gh search repos "<tool-name>" --sort stars --limit 5
   --json fullName,stargazersCount,url,description`.
3. Inspect results: match by description, not just name similarity.
4. `gh api` follows repo redirects automatically — the returned
   `full_name` may differ from what you queried (renamed/transferred).

#### Known tool-name → repo mappings

| Known name | Actual repo | Common mistake |
|------------|-------------|----------------|
| XSStrike | `s0md3v/XSStrike` | |
| xsser | `epsylon/xsser` | `xsser/xsser` returns 0 stars |
| NoSQLMap | `codingo/NoSQLMap` | Case-sensitive: not `NoSQLmap` |
| Corsy | `s0md3v/Corsy` | |
| SSRFmap | `swisskyrepo/SSRFmap` | Same author as PayloadsAllTheThings |
| GitTools | `internetwache/GitTools` | |
| WhatWeb | `urbanadventurer/WhatWeb` | |
| WPScan | `wpscanteam/wpscan` | `WPScan/wpscan` 404s |
| droopescan | `SamJoan/droopescan` | Renamed from `droope/droopescan` |
| joomscan | `OWASP/joomscan` | |
| Arjun | `s0md3v/Arjun` | |
| SecLists | `danielmiessler/SecLists` | |
| FuzzDB | `fuzzdb-project/fuzzdb` | |
| PayloadsAllTheThings | `swisskyrepo/PayloadsAllTheThings` | |
| HackTricks | `HackTricks-wiki/hacktricks` | `HackTricks` is not an org |
| donut | `TheWover/donut` | Shellcode generator |
| Sliver | `BishopFox/sliver` | |
| hcxtools | `ZerBea/hcxtools` | |
| hcxdumptool | `ZerBea/hcxdumptool` | |
| wifite2 | `derv82/wifite2` | v1 is `derv82/wifite` |
| GoPhish | `gophish/gophish` | |
| Modlishka | `drk1wi/Modlishka` | Not `zkryptic/Modlishka` |
| MHDDoS | `MatrixTM/MHDDoS` | |
| GoldenEye | `jseidl/GoldenEye` | Not `jesaud/GoldenEye` |
| stegseek | `RickdeJager/stegseek` | |
| zsteg | `zed-0xff/zsteg` | |
| princeprocessor | `hashcat/princeprocessor` | PRINCE algorithm |
| Sliver Armory | `sliverarmory/armory` | |
| x8 | `Sh1Yo/x8` | Hidden parameter discovery |

#### Tools NOT on GitHub

Some tools have no canonical GitHub repo. Don't fabricate a URL.

| Tool | Actual source | Notes |
|------|---------------|-------|
| steghide | SourceForge | Mirrors exist but are unofficial |
| rockyou.txt | Kali Linux (`apt install wordlists`) | Also in SecLists `Passwords/Leaked-Databases/` |
| searchsploit | `git://git.exploit-db.com/exploitdb.git` | Mirror at `offensive-security/exploitdb` |

#### When a requested tool doesn't exist

If `gh search repos "<name>"` returns zero relevant results across
multiple phrasings (exact, camelCase, spaced, semantic), the tool
likely doesn't exist under that name. Don't fabricate a repo URL.

Instead:
- Identify the closest functional alternative
- Note the non-existence explicitly in the output

Real examples from 2025-07 session:
- `PartNavigator` (param discovery) → no GitHub repo found → suggested
  `x8` (Sh1Yo/x8, 2085★) and `Arjun` (s0md3v/Arjun, 6359★)
- `myvn` (CVE→exploit mapping) → no GitHub repo found → suggested
  `nmap-vulners` (vulnersCom/nmap-vulners, 3394★) and
  `data-cve-poc` (XiaomingX/data-cve-poc, 618★)

### Step 3 — Batch Metadata Fetch

Once all tool names are resolved to `owner/repo` paths, batch-fetch
metadata. Use `gh api` (authenticated, 5000/hr) — never raw `curl`
(unauthenticated, 60/hr).

```bash
for repo in "owner1/repo1" "owner2/repo2"; do
  result=$(gh api "repos/$repo" \
    --jq '.full_name + "␞" + (.stargazers_count|tostring) + "␞" + .html_url + "␞" + (.description[:100] // "N/A")' 2>&1)
  if echo "$result" | grep -q "Not Found\|error"; then
    echo "❌ $repo: NOT FOUND"
  else
    echo "✅ $result"
  fi
done
```

The `␞` (record separator) makes the output easy to parse downstream.
`gh api` follows redirects, so renamed repos resolve automatically.

### Step 4 — Structured Output

For each tool, produce a row with:
- Tool name and repo URL
- Star count (currency of popularity)
- Install command (apt/pip/gem/git clone/brew)
- 2-3 key usage commands (the most common workflows)
- Which agent (hack-exploit vs hack-weapons) should own it
- Gap type (Absent / Table-only / Partial) against current SOUL.md

This structured list is the input to the enrichment phase
(security-team-soul-enrichment skill).

## Tool-to-Agent Assignment

When researching tools for a hack team, assign each tool to the
correct agent based on functional alignment:

| Agent | Gets tools for | Examples |
|-------|----------------|---------|
| hack-exploit | Web vuln scanners, injection tools, CMS scanners, param discovery, exploit frameworks | nuclei, XSStrike, NoSQLMap, Corsy, SSRFmap, GitTools, WhatWeb, WPScan, Arjun |
| hack-weapons | Payload generation, phishing, password cracking, WiFi, DDoS, steganography, wordlists | donut, GoPhish, Modlishka, MHDDoS, stegseek, PRINCE |
| hack-recon | Information gathering, OSINT, subdomain enumeration | (separate SOUL.md) |
| hack-forensics | Evidence analysis, steganography (analysis side) | (separate SOUL.md) |

Some tools span both exploit and weapons:
- **SecLists / FuzzDB / PayloadsAllTheThings** — reference material for
  both agents (exploit uses for fuzzing, weapons uses for password lists)
- **HackTricks** — reference knowledge base for all agents
- **hcxtools / hcxdumptool** — capture (weapons) + cracking (weapons)

## Pitfalls

### gh CLI rate limit vs raw curl rate limit

Unauthenticated GitHub API (raw `curl`) caps at 60 req/hr. A 30-tool
survey burns that in one batch. If you start with raw curl and exhaust
the limit, `gh` CLI still works (it uses authenticated requests at
5000/hr), but any remaining raw curl calls will 403.

**Fix**: Always use `gh api` for repo lookups. Check rate limit with
`curl -s https://api.github.com/rate_limit` if raw curl is needed.

### skill_manage cannot edit default-profile skills

Both `security-team-soul-enrichment` and `github-repo-survey` live in
the `default` profile (symlinked into `orchestrator`). `skill_manage`
cannot patch them even with `cross_profile=true` — it reports "not
found in active profile". This is a known limitation.

**Workaround**: This skill (`security-tool-github-research`) was
created in the `orchestrator` profile to capture the knowledge that
would otherwise go into `github-repo-survey`'s security tool section.

### Large SOUL.md files need paginated reading

hack-exploit SOUL.md is 655 lines. The tool speed-reference table is
near the end (~line 550). Without paginating to the end, you'll miss
existing tool entries and falsely classify them as "Absent" when they're
actually "Table-only". Always `read_file` with `offset=501` (or
appropriate offset) to see the full file before gap analysis.

## Related Skills

- **security-team-soul-enrichment** — takes the structured output from
  this skill and writes it into SOUL.md files (AST extraction, Burp
  headless guide, parallel batch updates, design pattern embedding)
- **agent-team-tool-integration** — tool-to-agent mapping, load
  balancing, parallel SOUL.md batch updates
- **github-repo-survey** (default profile) — general GitHub repo
  surveying; this skill is the security-tool-specialized companion
