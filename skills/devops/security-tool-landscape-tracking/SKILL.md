---
name: security-tool-landscape-tracking
description: Track security tool repo moves and ATT&CK version changes.
version: 1.0.0
platforms: [macos, linux]
metadata:
  hermes:
    tags: [hack-team, tool-research, github, methodology, att&ck, ai-red-team]
    related_skills: [security-tool-github-research, soul-tool-gap-research, security-team-soul-enrichment]
---

# Security Tool Landscape Tracking

The security tool landscape moves fast: popular tools change owners/get
acquired/transfer orgs, methodology frameworks (MITRE ATT&CK, OWASP) rev
their versions, and new categories (AI red team) emerge. This skill holds
the verified, time-stamped facts and the techniques to re-verify them —
so a fresh survey starts from correct ground truth instead of stale memory.

## When to Use

- Surveying 2025-2026 security/pentest/forensics tools by name
- A tool's repo path 404s and you need the *current* canonical path
- A report needs the *current* MITRE ATT&CK version and tactic list
- Confirming OWASP WSTG / API Top 10 / PTES currency
- Researching AI red-team / LLM-security tooling (new breakout category)

## Repo migrations — verify canonical paths every few months

Popular security tools change owners/get acquired/transfer orgs, and the old
path either 404s or silently redirects. A mapping correct last quarter may
be stale. `gh api` follows redirects so *renames* resolve silently — but a
*deleted* repo 404s with no forwarding hint.

**Re-verification procedure** (for any tool that 404s on direct lookup):

```bash
# 1. Direct lookup fails
gh api repos/CrowdStrike/automactc   # → 404

# 2. Search by name, match by DESCRIPTION not name similarity
gh search repos "automactc" --sort stars --limit 5 \
  --json fullName,stargazersCount,url,description

# 3. If only 0★ mirrors exist of a formerly-popular tool → original was DELETED
```

**Treat 0-star "mirrors" of a formerly-popular tool as a strong signal the
original was deleted** (saw this with automactc). Don't cite a mirror as
canonical.

Confirmed migrations (as of 2026-08 — re-verify before relying):

| Tool | Old path | Current canonical | Why it moved |
|------|----------|-------------------|--------------|
| garak (LLM vuln scanner) | `leondz/garak` | **`NVIDIA/garak`** | Acquired by NVIDIA ~2025 |
| cdxgen (SBOM gen) | `CycloneDX/cdxgen` | **`cdxgen/cdxgen`** | Spun out of CycloneDX org ~2025 |
| AutoMacTC (mac triage) | `CrowdStrike/automactc` | **DEAD (404)** | Repo deleted; use mac_apt / macos-collector |
| PentestGPT | `AI-sec/PentestGPT` | **`GreyDGL/PentestGPT`** | Always the author's handle |
| exploitdb | `offensive-security/exploitdb` | gitlab.com/exploit-database | GitHub mirror is legacy (last push 2022) |

## Methodology version verification (ATT&CK / OWASP / PTES)

NEVER cite methodology versions from memory. Verify via primary sources.

### MITRE ATT&CK — STIX diff technique

The STIX data repo is ground truth. Download per-version JSON and diff
tactic sets to confirm changes authoritatively:

```python
import urllib.request, json
for ver in ['15.1', '17.1', '19.2']:
    url = f'https://raw.githubusercontent.com/mitre-attack/attack-stix-data/master/enterprise-attack/enterprise-attack-{ver}.json'
    d = json.load(urllib.request.urlopen(url, timeout=60))
    tactics = sorted(o['name'] for o in d['objects']
                     if o.get('type') == 'x-mitre-tactic' and not o.get('revoked'))
    techs = [o for o in d['objects']
             if o.get('type') == 'attack-pattern' and not o.get('revoked')
             and not o.get('x_mitre_deprecated')]
    print(f'v{ver}: {len(tactics)} tactics, {len(techs)} techniques')
    print('  ', tactics)
```

**Confirmed finding (2026-08)**: between v15.1 and v19.2, **"Defense Evasion"**
was removed and split into two NEW tactics:
- **"Defense Impairment"** — 主动破坏/禁用安全工具
- **"Stealth"** — 规避检测、隐藏痕迹

Tactic count 14 → 15; techniques ~624 → 697. Current version **v19.2**
(released 2026-04-28). Version list + release dates at
`attack.mitre.org/resources/versions/`.

### OWASP / PTES

- **OWASP WSTG**: current stable = **v4.2** (web + PDF). Repo updates edge
  content continuously; version number holds.
- **OWASP API Security Top 10** & **Cheat Sheet Series**: active, no single
  version pin — cite repo + last-updated.
- **PTES**: `pentest-standard.org` is HTTP 200 but **unchanged since ~2014**,
  no GitHub repo, no version updates. Cite as historical methodology only,
  not current.

## AI red team — the 2025-2026 breakout category

This category barely existed before 2024 and now has multiple 4k-24k★ tools.
The default-profile skills predate it. Key tools (verified 2026-08):

| Tool | Repo | Stars | Role |
|------|------|------:|------|
| promptfoo | https://github.com/promptfoo/promptfoo | 24,090 | Prompt/agent/RAG red-teaming + vuln scanning |
| PentestGPT | https://github.com/GreyDGL/PentestGPT | 14,780 | Conversational LLM-guided pentest |
| garak | https://github.com/NVIDIA/garak | 8,746 | LLM vulnerability scanner (NVIDIA-maintained) |
| Giskard OSS | https://github.com/Giskard-AI/giskard-oss | 5,741 | LLM eval + testing library |
| PyRIT | https://github.com/microsoft/PyRIT | 4,270 | Microsoft generative-AI risk identification (v1.0 GA) |
| modelscan | https://github.com/protectai/modelscan | 757 | ML model serialization-attack detector |

Trend: **LLM-assisted vuln discovery** (PentestGPT, PyRIT) is the live 2025-26
direction, NOT classic symbolic-execution AEG (that subfield is stagnant,
low stars).

## Survey execution (rate-limit discipline)

- Use `gh api repos/<owner>/<repo>` (authenticated, 5000/hr). NEVER raw
  `curl` to api.github.com (60/hr unauthenticated) — a 30-tool survey
  exhausts it in one batch.
- Latest version: `gh api repos/<o>/<r>/releases/latest --jq '.tag_name'`.
  No-release repos: `gh api repos/<o>/<r>/tags --jq '.[0].name'`.
- For a tool whose owner you don't know: `gh search repos "<name>" --sort
  stars --limit 5 --json fullName,stargazersCount,url,description`, then
  match by description.

## Reference Files

| File | Content |
|------|---------|
| `references/security-tool-landscape-2026-08.md` | Full 2026-08-10 survey: 50+ tools across cloud/container/API/SCA-SAST/DFIR/AI-red-team/macOS with verified repos, live star counts, current versions, plus the STIX-diff methodology and the complete repo-migration table |

## Pitfalls

### The two default-profile research skills are unwritable from orchestrator

`security-tool-github-research` and `soul-tool-gap-research` are *listed*
under orchestrator's skills but physically live in the `default` profile
(the orchestrator `skills/devops/` dir is a symlink mount of default's store).
`skill_manage(action='patch'/'write_file')` keys off the skill name and
resolves within the active profile, so it reports "not found in active
profile" for these even though `skill_view` shows them. This skill exists
in the orchestrator profile as the writable companion. The background
curator can consolidate later.

### Don't cite 0-star mirrors as canonical

When a popular tool's original repo is deleted, GitHub sprouts 0★ copies.
A search may surface these. Match by description and star history — a tool
that was 2k★ last year appearing at 0★ today means the original is gone,
not that the tool shrank.

## Related Skills

- **security-tool-github-research** (default profile) — the canonical
  tool-name→repo mapping table and gap-analysis workflow. Read-only from
  orchestrator; its mapping table is the thing this skill's migration
  section supplements.
- **soul-tool-gap-research** (default profile) — 4-step gap-audit methodology
  for hack-team SOUL.md files.
- **security-team-soul-enrichment** (default profile) — writes tool sections
  into SOUL.md files (the enrichment phase after research).
